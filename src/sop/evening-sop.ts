/**
 * Evening SOP - 5+4 Review workflow
 */

import TideLogPlugin from '../main';
import { TFile } from 'obsidian';
import { SOPContext, ChatMessage, EveningQuestionType, EveningQuestionConfig } from '../types';
import {
    getBaseContextPrompt,
    GOAL_ALIGNMENT_PROMPT,
    SUCCESS_DIARY_PROMPT,
    HAPPINESS_EMOTION_PROMPT,
    ANXIETY_AWARENESS_PROMPT,
    TOMORROW_PLAN_PROMPT,
    DEEP_ANALYSIS_PROMPT,
    REFLECTION_PROMPT,
    PRINCIPLE_EXTRACT_PROMPT,
    FREE_WRITING_PROMPT,
} from './prompts';
import { formatAPIError } from '../utils/error-formatter';

interface QuestionConfig {
    type: EveningQuestionType;
    prompt: string;
    sectionName: string;
    initialMessage: string;
}

/**
 * Maps question type → AI system prompt (non-user-editable)
 */
const PROMPT_MAP: Record<EveningQuestionType, string> = {
    goal_alignment: GOAL_ALIGNMENT_PROMPT,
    success_diary: SUCCESS_DIARY_PROMPT,
    happiness_emotion: HAPPINESS_EMOTION_PROMPT,
    anxiety_awareness: ANXIETY_AWARENESS_PROMPT,
    tomorrow_plan: TOMORROW_PLAN_PROMPT,
    deep_analysis: DEEP_ANALYSIS_PROMPT,
    reflection: REFLECTION_PROMPT,
    principle_extract: PRINCIPLE_EXTRACT_PROMPT,
    free_writing: FREE_WRITING_PROMPT,
};

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
        return userQuestions
            .filter((q: EveningQuestionConfig) => q.enabled)
            .map((q: EveningQuestionConfig) => ({
                type: q.type,
                prompt: PROMPT_MAP[q.type] || '',
                sectionName: q.sectionName,
                initialMessage: q.initialMessage,
            }));
    }

    constructor(plugin: TideLogPlugin) {
        this.plugin = plugin;
    }

    /**
     * Public progress info for the UI progress bar
     */
    getProgressInfo(): { current: number; total: number; currentLabel: string } {
        const flow = this.questionFlow.length > 0 ? this.questionFlow : this.buildQuestionFlow();
        const total = flow.length;
        const current = this.currentQuestionIndex;
        const currentLabel = current < total ? flow[current].sectionName : '完成';
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
        const todayPlanContent = await this.getTodayPlanContent();

        context.userProfileContent = userProfile || undefined;
        context.todayPlanContent = todayPlanContent || undefined;

        // Get or create today's daily note
        await this.plugin.vaultManager.getOrCreateDailyNote();

        // Guard: if no questions are enabled
        if (this.questionFlow.length === 0) {
            onMessage('晚上好！目前没有启用的复盘问题。\n\n请在设置中启用至少一个复盘问题。');
            return;
        }



        // Send initial message
        const welcomeMessage = `🌙 辛苦了，一起来回顾一下今天吧。

${this.questionFlow[0].initialMessage}`;

        onMessage(welcomeMessage);
        context.currentStep = 1;
        context.currentQuestion = this.questionFlow[0].type;
    }

    /**
     * Get today's plan content
     */
    private async getTodayPlanContent(): Promise<string | null> {
        try {
            const dailyNote = await this.plugin.vaultManager.getOrCreateDailyNote();
            const content = await this.plugin.app.vault.cachedRead(dailyNote);

            // Extract morning plan section
            const lines = content.split('\n');
            let inMorningSection = false;
            const planLines: string[] = [];

            for (const line of lines) {
                if (line.startsWith('## 计划')) {
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
            context.responses['happiness_emotion'] = content;
            await this.finishEveningSOP(context, onMessage);
            return;
        }

        const currentQuestion = this.questionFlow[this.currentQuestionIndex];

        // Check for skip/end — user can skip any question
        if (this.isSkip(content)) {
            await this.moveToNextQuestion(context, onMessage);
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
            systemPrompt += `\n\n用户今日的计划：\n${todayPlan}\n\n请在回复中参考用户的计划内容，给出针对性的反馈。`;
        }

        // Add response guide to SYSTEM prompt (not user message) to prevent leaking
        systemPrompt += `\n\n回复指南：
- 简短回答 → 温和接纳即可
- 有内容的分享 → 先共情，可追问一个问题
- 完整有洞察的分享 → 肯定觉察力
- 不超过 3 句话，让用户感到"被听见"
- 绝对不要在回复中包含任何括号内的指令、标注或元信息`;

        // Generate AI response for follow-up or transition
        try {
            const provider = this.plugin.getAIProvider();
            let response = '';

            // User message is just the user's actual content — no instructions
            const userMessage = `用户在"${currentQuestion.sectionName}"环节说：\n\n"${content}"`;

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
            await this.moveToNextQuestion(context, onMessage, response);
        } catch (error) {
            onMessage(`保存成功！\n\n${error ? formatAPIError(error, this.plugin.settings.activeProvider) : ''}`);
            await this.moveToNextQuestion(context, onMessage);
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
            .replace(/<\/?(?:response_guide|style|constraints|task|scene|evaluation_dimensions)[^>]*>/g, '')
            // Clean up multiple consecutive newlines left by removals
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    /**
     * Move to next question
     */
    private async moveToNextQuestion(
        context: SOPContext,
        onMessage: (message: string) => void,
        previousResponse?: string
    ): Promise<void> {
        this.currentQuestionIndex++;

        if (this.currentQuestionIndex >= this.questionFlow.length) {
            // All questions done — ask for emotion score before finishing
            await this.askEmotionScore(context, onMessage, previousResponse);
            return;
        }

        const nextQuestion = this.questionFlow[this.currentQuestionIndex];
        context.currentQuestion = nextQuestion.type;
        context.currentStep = this.currentQuestionIndex + 1;

        const message = previousResponse
            ? `${previousResponse}\n\n---\n\n${nextQuestion.initialMessage}`
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

        const message = previousResponse
            ? `${previousResponse}\n\n---\n\n最后一个问题：**今天整体心情怎么样？** 请用 1-10 分评估一下。\n（1=很糟糕，5=一般，10=非常开心）`
            : '最后一个问题：**今天整体心情怎么样？** 请用 1-10 分评估一下。\n（1=很糟糕，5=一般，10=非常开心）';

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
        const dailyNote = await this.plugin.vaultManager.getOrCreateDailyNote();

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
            '复盘',
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
        const emotionResponse = context.responses['happiness_emotion'] || '';
        const emotionScore = this.extractEmotionScore(emotionResponse);

        // Write YAML metadata to daily note
        try {
            const dailyNote = await this.plugin.vaultManager.getOrCreateDailyNote();
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

        // Build dynamic summary from completed questions
        let summary = `✅ 今天的复盘完成了！

**复盘摘要：**`;

        // List completed question sections
        for (let i = 0; i < this.currentQuestionIndex && i < this.questionFlow.length; i++) {
            summary += `\n- ${this.questionFlow[i].sectionName} ✓`;
        }

        if (emotionScore) {
            summary += `\n\n**情绪评分**: ${emotionScore}/10`;
        }

        summary += `\n\n所有内容已保存到今日的日记中。晚安！🌙`;

        onMessage(summary);

        // Sync to kanban board if service available
        try {
            if (this.plugin.kanbanService) {
                await this.plugin.kanbanService.syncFromDailyNote();
            }
        } catch (error) {
            console.error('[Evening SOP] Failed to sync kanban:', error);
        }

        // Generate AI planning suggestions for tomorrow (runs in background)
        this.generatePlanSuggestions(context).catch(err => {
            console.error('[Evening SOP] Failed to generate plan suggestions:', err);
        });

        // Reset context
        context.type = 'none';
        context.currentStep = 0;
    }

    /**
     * Generate AI-based planning suggestions from evening review and save to file
     */
    private async generatePlanSuggestions(context: SOPContext): Promise<void> {
        try {
            const provider = this.plugin.getAIProvider();
            if (!provider) return;

            // Gather review responses
            const responses = context.responses || {};
            let reviewSummary = '';
            for (const [key, val] of Object.entries(responses)) {
                if (val && typeof val === 'string' && val.trim()) {
                    reviewSummary += `【${key}】${val.trim()}\n`;
                }
            }
            if (!reviewSummary) return;

            const systemPrompt = `基于用户的复盘内容，提炼出3条明天可以行动的建议。

严格规则：
- 每条建议必须直接来源于用户复盘中提到的事情、想法或反思，不得凭空编造
- 绝对禁止建议用户没有提到过的活动、方法或习惯（例如：如果用户没提到运动，就不要建议运动）
- 建议应该是用户自己说过的计划、反思到的改进方向、或未完成事项的延续
- 每条以"💡"开头，不超过30字
- 直接输出建议，不要加前言`;

            const messages: ChatMessage[] = [
                { role: 'user', content: `我的今日复盘：\n${reviewSummary}`, timestamp: Date.now() }
            ];

            const suggestions = await provider.sendMessage(messages, systemPrompt, () => {});

            if (suggestions && suggestions.trim()) {
                const path = `${this.plugin.settings.archiveFolder}/plan_suggestions.md`;
                const file = this.plugin.app.vault.getAbstractFileByPath(path);
                const content = `---\nupdated: ${new Date().toISOString()}\n---\n${suggestions.trim()}`;
                if (file) {
                    if (file instanceof TFile) {
                        await this.plugin.app.vault.modify(file, content);
                    }
                } else {
                    await this.plugin.app.vault.create(path, content);
                }
            }
        } catch (e) {
            console.error('[Evening SOP] Plan suggestion generation failed:', e);
        }
    }

    /**
     * Extract emotion score from response
     */
    private extractEmotionScore(text: string): string | null {
        const match = text.match(/(\d+)\s*[分\/]/);
        return match ? match[1] : null;
    }

    /**
     * Check if response is a skip
     */
    private isSkip(text: string): boolean {
        const trimmed = text.trim();
        // Only treat as skip if the message is short (dedicated skip intent)
        if (trimmed.length > 10) return false;
        const skipWords = ['跳过', '略过', 'skip', '没有', '无', '暂时不', '不需要', '不用'];
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
        const endWords = ['结束', '结束复盘', 'done', 'end', '就这样', '没了', '不做了'];
        return endWords.some((word) =>
            trimmed.toLowerCase() === word.toLowerCase() ||
            trimmed.toLowerCase().includes(word.toLowerCase())
        );
    }
}
