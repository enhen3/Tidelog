/**
 * Evening SOP - 5+4 Review workflow
 */

import TideLogPlugin from '../main';
import { SOPContext, ChatMessage, EveningQuestionType, EveningQuestionConfig } from '../types';
import {
    getBaseContextPrompt,
    getGoalAlignmentPrompt,
    getSuccessDiaryPrompt,
    getHappinessEmotionPrompt,
    getAnxietyAwarenessPrompt,
    getTomorrowPlanPrompt,
    getDeepAnalysisPrompt,
    getReflectionPrompt,
    getPrincipleExtractPrompt,
    getFreeWritingPrompt,
} from './prompts';
import { formatAPIError } from '../utils/error-formatter';
import { t, getLanguage } from '../i18n';
import { moment } from 'obsidian';

interface QuestionConfig {
    type: EveningQuestionType;
    prompt: string;
    sectionName: string;
    initialMessage: string;
}

/**
 * Maps question type → AI system prompt (non-user-editable)
 */
function getPromptMap(): Record<EveningQuestionType, string> {
    return {
        goal_alignment: getGoalAlignmentPrompt(),
        success_diary: getSuccessDiaryPrompt(),
        happiness_emotion: getHappinessEmotionPrompt(),
        anxiety_awareness: getAnxietyAwarenessPrompt(),
        tomorrow_plan: getTomorrowPlanPrompt(),
        deep_analysis: getDeepAnalysisPrompt(),
        reflection: getReflectionPrompt(),
        principle_extract: getPrincipleExtractPrompt(),
        free_writing: getFreeWritingPrompt(),
    };
}

export class EveningSOP {
    private plugin: TideLogPlugin;
    private messages: ChatMessage[] = [];
    private currentQuestionIndex: number = 0;
    private questionFlow: QuestionConfig[] = [];
    private isEmotionScoreStep = false;

    /**
     * Build question flow from user settings
     */
    private buildQuestionFlow(): QuestionConfig[] {
        const userQuestions = this.plugin.settings.eveningQuestions;
        const enabledQuestions = userQuestions
            .filter((q: EveningQuestionConfig) => q.enabled !== false)
            .map((q: EveningQuestionConfig) => ({
                type: q.type,
                prompt: getPromptMap()[q.type] || '',
                sectionName: q.sectionName,
                initialMessage: q.initialMessage,
            }));

        // Free users: limit to the first 2 enabled questions in the user's configured order.
        if (!this.plugin.licenseManager.isPro()) {
            return enabledQuestions.slice(0, 2);
        }
        return enabledQuestions;
    }

    constructor(plugin: TideLogPlugin) {
        this.plugin = plugin;
    }

    /**
     * Public progress info for the UI progress bar.
     * `total` always reflects all enabled questions in settings (not Pro-limited),
     * so the progress bar matches what the user configured.
     */
    getProgressInfo(): { current: number; total: number; currentLabel: string } {
        const enabledQuestions = this.plugin.settings.eveningQuestions
            .filter((q: EveningQuestionConfig) => q.enabled !== false);
        const total = enabledQuestions.length;

        // Current step within the actual flow
        const flow = this.questionFlow.length > 0 ? this.questionFlow : enabledQuestions;
        const current = this.currentQuestionIndex;
        const currentLabel = current < flow.length
            ? (flow[current].sectionName ?? flow[current].initialMessage ?? '')
            : (getLanguage() === 'en' ? 'Done' : '完成');
        return { current, total, currentLabel };
    }

    /**
     * Start the evening SOP
     */
    async start(
        context: SOPContext,
        onMessage: (message: string) => void
    ): Promise<void> {
        // Reset state
        this.messages = [];
        this.currentQuestionIndex = 0;
        this.questionFlow = this.buildQuestionFlow();
        this.isEmotionScoreStep = false;

        // Load context data
        const userProfile = await this.plugin.vaultManager.getUserProfileContent();
        const todayPlanContent = await this.getPlanContent(context);

        context.userProfileContent = userProfile || undefined;
        context.todayPlanContent = todayPlanContent || undefined;

        // Get or create today's daily note
        await this.plugin.vaultManager.getOrCreateDailyNote(this.getTargetDate(context));

        // Guard: if no questions are enabled
        if (this.questionFlow.length === 0) {
            const noQMsg = getLanguage() === 'en'
                ? 'Good evening! No review questions are currently enabled.\n\nPlease enable at least one review question in settings.'
                : '晚上好！目前没有启用的复盘问题。\n\n请在设置中启用至少一个复盘问题。';
            onMessage(noQMsg);
            return;
        }



        // Send initial message
        const target = this.getTargetMoment(context);
        const isToday = typeof target.isSame === 'function' ? target.isSame(moment(), 'day') : true;
        const welcomePrefix = getLanguage() === 'en'
            ? (isToday ? `Great work today. Let's review your day together.` : `Let's catch up the review for ${target.format('MMM D')}.`)
            : (isToday ? `辛苦了，一起来回顾一下今天吧。` : `一起来补上 ${target.format('M月D日')} 的复盘。`);

        const welcomeMessage = `${welcomePrefix}\n\n${this.questionFlow[0].initialMessage}`;

        onMessage(welcomeMessage);
        context.currentStep = 1;
        context.currentQuestion = this.questionFlow[0].type;
    }

    /**
     * Get today's plan content
     */
    private async getPlanContent(context: SOPContext): Promise<string | null> {
        try {
            const dailyNote = await this.plugin.vaultManager.getOrCreateDailyNote(this.getTargetDate(context));
            const content = await this.plugin.app.vault.cachedRead(dailyNote);

            // Extract morning plan section
            const lines = content.split('\n');
            let inMorningSection = false;
            const planLines: string[] = [];

            for (const line of lines) {
                if (line.startsWith('## 计划') || line.startsWith('## Plan')) {
                    inMorningSection = true;
                    continue;
                }
                if (inMorningSection && line.startsWith('## ')) {
                    break;
                }
                if (inMorningSection) {
                    planLines.push(line);
                }
            }

            return planLines.join('\n').trim() || null;
        } catch {
            return null;
        }
    }

    /**
     * Handle user response in evening SOP
     */
    async handleResponse(
        content: string,
        context: SOPContext,
        onMessage: (message: string) => void
    ): Promise<void> {
        // Handle emotion score (final step after all questions)
        if (this.isEmotionScoreStep) {
            context.responses['emotion_score'] = content;
            await this.finishEveningSOP(context, onMessage);
            return;
        }

        const currentQuestion = this.questionFlow[this.currentQuestionIndex];

        // Check for skip/end — user can skip any question
        if (this.isSkip(content)) {
            this.moveToNextQuestion(context, onMessage);
            return;
        }

        if (this.isEnd(content)) {
            await this.finishEveningSOP(context, onMessage);
            return;
        }

        // Add user message
        this.messages.push({
            role: 'user',
            content,
            timestamp: Date.now(),
        });

        // Write to daily note immediately (before saving response so follow-up detection works)
        await this.writeToDaily(currentQuestion, content, context);

        // Save response (after writing so first-time vs follow-up is correctly detected)
        context.responses[currentQuestion.type] = content;

        // Generate AI follow-up or move to next question
        await this.processResponse(content, context, onMessage);
    }

    /**
     * Process response and generate follow-up
     */
    private async processResponse(
        content: string,
        context: SOPContext,
        onMessage: (message: string) => void
    ): Promise<void> {
        const currentQuestion = this.questionFlow[this.currentQuestionIndex];
        const userProfile = context.userProfileContent;
        const todayPlan = context.todayPlanContent;
        let systemPrompt = getBaseContextPrompt(userProfile || null) + '\n\n' + currentQuestion.prompt;
        if (todayPlan) {
            const planRef = getLanguage() === 'en'
                ? `\n\nUser's plan for today:\n${todayPlan}\n\nReference the user's plan content in your response and give targeted feedback.`
                : `\n\n用户今日的计划：\n${todayPlan}\n\n请在回复中参考用户的计划内容，给出针对性的反馈。`;
            systemPrompt += planRef;
        }

        // Add response guide to SYSTEM prompt (not user message) to prevent leaking
        systemPrompt += getLanguage() === 'en'
            ? `\n\nResponse guide:
- Give a brief, warm acknowledgment of what the user shared
- Empathize and affirm their awareness or effort
- No more than 3 sentences, make user feel "heard"
- NEVER ask any follow-up questions — the system will handle the next question automatically
- Never include any instructions, annotations, or meta-information in brackets`
            : `\n\n回复指南：
- 简短温暖地回应用户分享的内容
- 共情并肯定用户的觉察或努力
- 不超过 3 句话，让用户感到"被听见"
- 绝对不要提出任何追问或新问题——系统会自动处理下一个问题
- 绝对不要在回复中包含任何括号内的指令、标注或元信息`;

        // Generate AI response for follow-up or transition
        try {
            const provider = this.plugin.getAIProvider();
            let response = '';

            // User message is just the user's actual content — no instructions
            const userMessage = getLanguage() === 'en'
                ? `User said during "${currentQuestion.sectionName}":\n\n"${content}"`
                : `用户在"${currentQuestion.sectionName}"环节说：\n\n"${content}"`;

            this.messages.push({
                role: 'user',
                content: userMessage,
                timestamp: Date.now(),
            });

            await provider.sendMessage(
                this.messages,
                systemPrompt,
                (chunk) => {
                    response += chunk;
                }
            );

            // Strip any leaked instructions from AI response
            response = this.stripLeakedInstructions(response);

            this.messages.push({
                role: 'assistant',
                content: response,
                timestamp: Date.now(),
            });

            // Move to next question after response
            this.moveToNextQuestion(context, onMessage, response);
        } catch (error) {
            const saveMsg = getLanguage() === 'en' ? 'Saved!' : '保存成功！';
            onMessage(`${saveMsg}\n\n${error ? formatAPIError(error, this.plugin.settings.activeProvider) : ''}`);
            this.moveToNextQuestion(context, onMessage);
        }
    }

    /**
     * Strip leaked AI instructions from response text.
     * Removes parenthetical instructions like (保持温暖简短的肯定) and XML-style tags.
     */
    private stripLeakedInstructions(text: string): string {
        return text
            // Remove full-width parenthetical instructions: （...） or (...)
            .replace(/[（(][^）)]*(?:保持|简短|温暖|肯定|接纳|共情|追问|引导|回复|指令|标注|元信息)[^）)]*[）)]/g, '')
            // Remove XML-style tags that may leak
            .replace(new RegExp('</?(?:response_guide|style|constraints|task|scene|evaluation_dimensions)[^>]*>', 'g'), '')
            // Clean up multiple consecutive newlines left by removals
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    /**
     * Move to next question
     */
    private moveToNextQuestion(
        context: SOPContext,
        onMessage: (message: string) => void,
        previousResponse?: string
    ): void {
        this.currentQuestionIndex++;

        if (this.currentQuestionIndex >= this.questionFlow.length) {
            // All questions done — ask for emotion score before finishing
            this.askEmotionScore(context, onMessage, previousResponse);
            return;
        }

        const nextQuestion = this.questionFlow[this.currentQuestionIndex];
        context.currentQuestion = nextQuestion.type;
        context.currentStep = this.currentQuestionIndex + 1;

        const message = previousResponse
            ? `${previousResponse.trim()}

${nextQuestion.initialMessage}`
            : nextQuestion.initialMessage;

        onMessage(message);
    }

    /**
     * Ask for today's emotion/mood score as the final step
     */
    private askEmotionScore(
        context: SOPContext,
        onMessage: (message: string) => void,
        previousResponse?: string
    ): void {
        this.isEmotionScoreStep = true;
        context.currentStep = this.questionFlow.length + 1;

        const emotionQ = getLanguage() === 'en'
            ? 'Last question: **How was your overall mood today?** Rate it 1-10.\n(1=very bad, 5=average, 10=very happy)'
            : '最后一个问题：**今天整体心情怎么样？** 请用 1-10 分评估一下。\n（1=很糟糕，5=一般，10=非常开心）';

        const message = previousResponse
            ? `${previousResponse.trim()}

${emotionQ}`
            : emotionQ;

        onMessage(message);
    }

    /**
     * Write response to daily note
     */
    private async writeToDaily(
        question: QuestionConfig,
        content: string,
        context: SOPContext
    ): Promise<void> {
        const dailyNote = await this.plugin.vaultManager.getOrCreateDailyNote(this.getTargetDate(context));

        // Check if this is a follow-up response (user already answered this section before)
        const isFollowUp = context.responses[question.type] !== undefined
            && context.responses[question.type] !== content;

        let formattedContent: string;

        if (isFollowUp) {
            // Find the last AI message — that's the question the user is answering
            const lastAIMessage = [...this.messages]
                .reverse()
                .find(m => m.role === 'assistant');

            if (lastAIMessage) {
                // Format AI question as blockquote, then user's answer
                const aiQuestion = lastAIMessage.content
                    .split('\n')
                    .map(line => `> ${line}`)
                    .join('\n');
                formattedContent = `\n${aiQuestion}\n\n${content}\n`;
            } else {
                formattedContent = `\n${content}\n`;
            }
        } else {
            // First response for this section — normal format with heading
            formattedContent = `\n### ${question.sectionName}\n\n${content}\n`;
        }

        await this.plugin.vaultManager.appendToSection(
            dailyNote.path,
            t('vault.sectionReview'),
            formattedContent
        );

        // Special handling for principle extraction
        if (question.type === 'principle_extract' && content.trim()) {
            // Check if user provided a principle
            if (!this.isSkip(content)) {
                await this.plugin.vaultManager.addPrinciple(content);
            }
        }

    }

    /**
     * Finish evening SOP
     */
    private async finishEveningSOP(
        context: SOPContext,
        onMessage: (message: string) => void
    ): Promise<void> {
        // Calculate emotion score if available
        const emotionResponse = context.responses['emotion_score'] || context.responses['happiness_emotion'] || '';
        const emotionScore = this.extractEmotionScore(emotionResponse);

        // Write YAML metadata to daily note
        try {
            const dailyNote = await this.plugin.vaultManager.getOrCreateDailyNote(this.getTargetDate(context));
            const yamlFields: Record<string, unknown> = {
                status: 'completed',
            };
            if (emotionScore) {
                yamlFields.emotion_score = parseInt(emotionScore, 10);
            }

            // Count tasks from metadataCache for stats
            const cache = this.plugin.app.metadataCache.getFileCache(dailyNote);
            if (cache?.listItems) {
                const tasks = cache.listItems.filter(item => item.task !== undefined);
                yamlFields.tasks_total = tasks.length;
                yamlFields.tasks_done = tasks.filter(t => t.task === 'x').length;
            }

            await this.plugin.vaultManager.updateDailyNoteYAML(
                dailyNote.path,
                yamlFields
            );
        } catch (error) {
            console.error('[Evening SOP] Failed to update YAML:', error);
        }

        // Build a warm AI-generated closing message
        let summary = '';
        try {
            const provider = this.plugin.getAIProvider();
            // Gather all responses for context
            const responses = context.responses || {};
            let reviewContent = '';
            for (const [key, val] of Object.entries(responses)) {
                if (val && typeof val === 'string' && val.trim()) {
                    reviewContent += `${key}: ${val.trim()}\n`;
                }
            }

            if (provider && reviewContent) {
                const closingPrompt = getLanguage() === 'en'
                    ? `The user just finished their evening review. Based on their responses below, write a warm, encouraging closing message in 2-3 sentences. Reference specific things they shared to make it feel personal. End with a good night wish. Do NOT ask any questions.\n\nReview content:\n${reviewContent}`
                    : `用户刚刚完成了晚间复盘。根据下面的复盘内容，写一段温暖、鼓励的收尾语（2-3句话）。引用用户实际分享的内容让它更有亲切感。以晚安祝福结尾。不要提出任何问题。\n\n复盘内容：\n${reviewContent}`;

                const messages: ChatMessage[] = [
                    { role: 'user', content: closingPrompt, timestamp: Date.now() }
                ];
                const systemPrompt = getLanguage() === 'en'
                    ? 'You are Flow, a warm personal growth companion. Write a brief, heartfelt closing.'
                    : '你是 Flow，一个温暖的个人成长伙伴。写一段简短、真诚的收尾语。';

                const closingMsg = await provider.sendMessage(messages, systemPrompt, () => {});
                if (closingMsg && closingMsg.trim()) {
                    summary = closingMsg.trim();
                }
            }
        } catch {
            // Fall through to static message
        }

        // Fallback static message if AI fails
        if (!summary) {
            summary = getLanguage() === 'en'
                ? `Great job reviewing your day! 🌟 Every moment of reflection is a step toward growth.`
                : `今天的复盘辛苦了！🌟 每一次回顾都是成长的印记。`;
        }

        if (emotionScore) {
            const emotionLabel = getLanguage() === 'en' ? 'Mood' : '情绪';
            summary += `\n\n${emotionLabel}: ${emotionScore}/10`;
        }

        summary += getLanguage() === 'en'
            ? `\n\nAll saved to your journal. Good night! 🌙`
            : `\n\n已保存到日记中，晚安 🌙`;

        // Pro upsell for free users
        if (!this.plugin.licenseManager.isPro()) {
            const totalEnabled = this.plugin.settings.eveningQuestions
                .filter((q: EveningQuestionConfig) => q.enabled !== false)
                .length;
            if (totalEnabled > 2) {
                const purchaseUrl = this.plugin.licenseManager.getPurchaseUrl();
                summary += getLanguage() === 'en'
                    ? `\n\n---\n💡 *You completed 2 of ${totalEnabled} review questions. [Upgrade to Pro](${purchaseUrl}) to unlock all questions and deeper insights.*`
                    : `\n\n---\n💡 *你完成了 ${totalEnabled} 个复盘问题中的 2 个。[升级 Pro 版](${purchaseUrl})解锁全部问题和更深入的洞察。*`;
            }
        }

        // Refresh day/week/month planning suggestions before announcing completion,
        // so the next Plan view opens with fresh guidance instead of a stale empty card.
        try {
            if (this.isTargetToday(context)) {
                await this.plugin.planSuggestionService?.refreshAfterDailyReview(context);
            }
        } catch (err) {
            console.error('[Evening SOP] Failed to refresh plan suggestions:', err);
        }

        onMessage(summary);

        // Sync to kanban board if service available
        try {
            if (this.plugin.kanbanService) {
                await this.plugin.kanbanService.syncFromDailyNote();
            }
        } catch (error) {
            console.error('[Evening SOP] Failed to sync kanban:', error);
        }

        // Reset context
        context.type = 'none';
        context.currentStep = 0;
    }

    private getTargetMoment(context: SOPContext): moment.Moment {
        const raw = context.reviewTargetDate;
        if (!raw) return moment();
        const parsed = moment(raw, 'YYYY-MM-DD');
        return typeof parsed.isValid === 'function' && !parsed.isValid() ? moment() : parsed;
    }

    private getTargetDate(context: SOPContext): Date | undefined {
        const target = this.getTargetMoment(context);
        return context.reviewTargetDate && typeof target.toDate === 'function' ? target.toDate() : undefined;
    }

    private isTargetToday(context: SOPContext): boolean {
        const target = this.getTargetMoment(context);
        return typeof target.isSame === 'function' ? target.isSame(moment(), 'day') : true;
    }

    /**
     * Extract emotion score from response
     */
    private extractEmotionScore(text: string): string | null {
        const match = text.match(/(?:^|[^\d])(10|[1-9])(?:\s*(?:分|\/\s*10)?)?(?=$|[^\d])/);
        return match ? match[1] : null;
    }

    /**
     * Check if response is a skip
     */
    private isSkip(text: string): boolean {
        const trimmed = text.trim();
        // Only treat as skip if the message is short (dedicated skip intent)
        if (trimmed.length > 10) return false;
        const skipWords = ['跳过', '略过', 'skip', '没有', '无', '暂时不', '不需要', '不用', 'none', 'no', 'pass', 'next'];
        return skipWords.some((word) =>
            trimmed.toLowerCase().includes(word.toLowerCase())
        );
    }

    /**
     * Check if response indicates end
     */
    private isEnd(text: string): boolean {
        const trimmed = text.trim();
        // Only treat as end if the message is short (dedicated end intent)
        if (trimmed.length > 10) return false;
        const endWords = ['结束', '结束复盘', 'done', 'end', '就这样', '没了', '不做了', 'stop', 'quit', 'finish', 'enough'];
        return endWords.some((word) =>
            trimmed.toLowerCase() === word.toLowerCase() ||
            trimmed.toLowerCase().includes(word.toLowerCase())
        );
    }
}
