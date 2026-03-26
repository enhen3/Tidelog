/**
 * Evening SOP - 5+4 Review workflow
 */
import { TFile } from 'obsidian';
import { getBaseContextPrompt, getGoalAlignmentPrompt, getSuccessDiaryPrompt, getHappinessEmotionPrompt, getAnxietyAwarenessPrompt, getTomorrowPlanPrompt, getDeepAnalysisPrompt, getReflectionPrompt, getPrincipleExtractPrompt, getFreeWritingPrompt, } from './prompts';
import { formatAPIError } from '../utils/error-formatter';
import { t, getLanguage } from '../i18n';
/**
 * Maps question type → AI system prompt (non-user-editable)
 */
function getPromptMap() {
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
    /**
     * Build question flow from user settings
     */
    buildQuestionFlow() {
        const userQuestions = this.plugin.settings.eveningQuestions;
        const allEnabled = userQuestions
            .filter((q) => q.enabled)
            .map((q) => ({
            type: q.type,
            prompt: getPromptMap()[q.type] || '',
            sectionName: q.sectionName,
            initialMessage: q.initialMessage,
        }));
        // Free users: limit to first 2 questions
        if (!this.plugin.licenseManager.isPro()) {
            return allEnabled.slice(0, 2);
        }
        return allEnabled;
    }
    constructor(plugin) {
        this.messages = [];
        this.currentQuestionIndex = 0;
        this.questionFlow = [];
        this.isEmotionScoreStep = false;
        this.plugin = plugin;
    }
    /**
     * Public progress info for the UI progress bar
     */
    getProgressInfo() {
        const flow = this.questionFlow.length > 0 ? this.questionFlow : this.buildQuestionFlow();
        const total = flow.length;
        const current = this.currentQuestionIndex;
        const currentLabel = current < total ? flow[current].sectionName : (getLanguage() === 'en' ? 'Done' : '完成');
        return { current, total, currentLabel };
    }
    /**
     * Start the evening SOP
     */
    async start(context, onMessage) {
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
            const noQMsg = getLanguage() === 'en'
                ? 'Good evening! No review questions are currently enabled.\n\nPlease enable at least one review question in settings.'
                : '晚上好！目前没有启用的复盘问题。\n\n请在设置中启用至少一个复盘问题。';
            onMessage(noQMsg);
            return;
        }
        // Send initial message
        const welcomePrefix = getLanguage() === 'en'
            ? `🌙 Great work today! Let's review your day together.`
            : `🌙 辛苦了，一起来回顾一下今天吧。`;
        const welcomeMessage = `${welcomePrefix}\n\n${this.questionFlow[0].initialMessage}`;
        onMessage(welcomeMessage);
        context.currentStep = 1;
        context.currentQuestion = this.questionFlow[0].type;
    }
    /**
     * Get today's plan content
     */
    async getTodayPlanContent() {
        try {
            const dailyNote = await this.plugin.vaultManager.getOrCreateDailyNote();
            const content = await this.plugin.app.vault.cachedRead(dailyNote);
            // Extract morning plan section
            const lines = content.split('\n');
            let inMorningSection = false;
            const planLines = [];
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
        }
        catch {
            return null;
        }
    }
    /**
     * Handle user response in evening SOP
     */
    async handleResponse(content, context, onMessage) {
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
    async processResponse(content, context, onMessage) {
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
            await provider.sendMessage(this.messages, systemPrompt, (chunk) => {
                response += chunk;
            });
            // Strip any leaked instructions from AI response
            response = this.stripLeakedInstructions(response);
            this.messages.push({
                role: 'assistant',
                content: response,
                timestamp: Date.now(),
            });
            // Move to next question after response
            await this.moveToNextQuestion(context, onMessage, response);
        }
        catch (error) {
            const saveMsg = getLanguage() === 'en' ? 'Saved!' : '保存成功！';
            onMessage(`${saveMsg}\n\n${error ? formatAPIError(error, this.plugin.settings.activeProvider) : ''}`);
            await this.moveToNextQuestion(context, onMessage);
        }
    }
    /**
     * Strip leaked AI instructions from response text.
     * Removes parenthetical instructions like (保持温暖简短的肯定) and XML-style tags.
     */
    stripLeakedInstructions(text) {
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
    moveToNextQuestion(context, onMessage, previousResponse) {
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
    askEmotionScore(context, onMessage, previousResponse) {
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
    async writeToDaily(question, content, context) {
        const dailyNote = await this.plugin.vaultManager.getOrCreateDailyNote();
        // Check if this is a follow-up response (user already answered this section before)
        const isFollowUp = context.responses[question.type] !== undefined
            && context.responses[question.type] !== content;
        let formattedContent;
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
            }
            else {
                formattedContent = `\n${content}\n`;
            }
        }
        else {
            // First response for this section — normal format with heading
            formattedContent = `\n### ${question.sectionName}\n\n${content}\n`;
        }
        await this.plugin.vaultManager.appendToSection(dailyNote.path, t('vault.sectionReview'), formattedContent);
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
    async finishEveningSOP(context, onMessage) {
        // Calculate emotion score if available
        const emotionResponse = context.responses['happiness_emotion'] || '';
        const emotionScore = this.extractEmotionScore(emotionResponse);
        // Write YAML metadata to daily note
        try {
            const dailyNote = await this.plugin.vaultManager.getOrCreateDailyNote();
            const yamlFields = {
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
            await this.plugin.vaultManager.updateDailyNoteYAML(dailyNote.path, yamlFields);
        }
        catch (error) {
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
                const messages = [
                    { role: 'user', content: closingPrompt, timestamp: Date.now() }
                ];
                const systemPrompt = getLanguage() === 'en'
                    ? 'You are Flow, a warm personal growth companion. Write a brief, heartfelt closing.'
                    : '你是 Flow，一个温暖的个人成长伙伴。写一段简短、真诚的收尾语。';
                const closingMsg = await provider.sendMessage(messages, systemPrompt, () => { });
                if (closingMsg && closingMsg.trim()) {
                    summary = closingMsg.trim();
                }
            }
        }
        catch {
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
                .filter((q) => q.enabled).length;
            if (totalEnabled > 2) {
                const urls = this.plugin.licenseManager.getPurchaseUrls();
                summary += getLanguage() === 'en'
                    ? `\n\n---\n💡 *You completed 2 of ${totalEnabled} review questions. [Upgrade to Pro](${urls.mianbaoduo}) to unlock all questions and deeper insights.*`
                    : `\n\n---\n💡 *你完成了 ${totalEnabled} 个复盘问题中的 2 个。[升级 Pro 版](${urls.mianbaoduo})解锁全部问题和更深入的洞察。*`;
            }
        }
        onMessage(summary);
        // Sync to kanban board if service available
        try {
            if (this.plugin.kanbanService) {
                await this.plugin.kanbanService.syncFromDailyNote();
            }
        }
        catch (error) {
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
    async generatePlanSuggestions(context) {
        try {
            const provider = this.plugin.getAIProvider();
            if (!provider)
                return;
            // Gather review responses
            const responses = context.responses || {};
            let reviewSummary = '';
            for (const [key, val] of Object.entries(responses)) {
                if (val && typeof val === 'string' && val.trim()) {
                    reviewSummary += `【${key}】${val.trim()}\n`;
                }
            }
            if (!reviewSummary)
                return;
            const systemPrompt = getLanguage() === 'en'
                ? `Based on the user's review content, extract 3 actionable suggestions for tomorrow.

Strict rules:
- Each suggestion must directly come from things, thoughts, or reflections mentioned in the review — do not fabricate
- Absolutely do not suggest activities, methods, or habits the user hasn't mentioned
- Suggestions should be plans the user stated, improvement directions they reflected on, or continuations of unfinished items
- Each starts with "💡", no more than 30 words
- Output suggestions directly, no preamble`
                : `基于用户的复盘内容，提炼出3条明天可以行动的建议。

严格规则：
- 每条建议必须直接来源于用户复盘中提到的事情、想法或反思，不得凭空编造
- 绝对禁止建议用户没有提到过的活动、方法或习惯
- 建议应该是用户自己说过的计划、反思到的改进方向、或未完成事项的延续
- 每条以"💡"开头，不超过30字
- 直接输出建议，不要加前言`;
            const messages = [
                { role: 'user', content: getLanguage() === 'en' ? `My today's review:\n${reviewSummary}` : `我的今日复盘：\n${reviewSummary}`, timestamp: Date.now() }
            ];
            const suggestions = await provider.sendMessage(messages, systemPrompt, () => { });
            if (suggestions && suggestions.trim()) {
                const path = `${this.plugin.settings.archiveFolder}/plan_suggestions.md`;
                const file = this.plugin.app.vault.getAbstractFileByPath(path);
                const content = `---\nupdated: ${new Date().toISOString()}\n---\n${suggestions.trim()}`;
                if (file) {
                    if (file instanceof TFile) {
                        await this.plugin.app.vault.modify(file, content);
                    }
                }
                else {
                    await this.plugin.app.vault.create(path, content);
                }
            }
        }
        catch (e) {
            console.error('[Evening SOP] Plan suggestion generation failed:', e);
        }
    }
    /**
     * Extract emotion score from response
     */
    extractEmotionScore(text) {
        const match = text.match(/(\d+)\s*[分/]/);
        return match ? match[1] : null;
    }
    /**
     * Check if response is a skip
     */
    isSkip(text) {
        const trimmed = text.trim();
        // Only treat as skip if the message is short (dedicated skip intent)
        if (trimmed.length > 10)
            return false;
        const skipWords = ['跳过', '略过', 'skip', '没有', '无', '暂时不', '不需要', '不用', 'none', 'no', 'pass', 'next'];
        return skipWords.some((word) => trimmed.toLowerCase().includes(word.toLowerCase()));
    }
    /**
     * Check if response indicates end
     */
    isEnd(text) {
        const trimmed = text.trim();
        // Only treat as end if the message is short (dedicated end intent)
        if (trimmed.length > 10)
            return false;
        const endWords = ['结束', '结束复盘', 'done', 'end', '就这样', '没了', '不做了', 'stop', 'quit', 'finish', 'enough'];
        return endWords.some((word) => trimmed.toLowerCase() === word.toLowerCase() ||
            trimmed.toLowerCase().includes(word.toLowerCase()));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXZlbmluZy1zb3AuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJldmVuaW5nLXNvcC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7R0FFRztBQUdILE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFFakMsT0FBTyxFQUNILG9CQUFvQixFQUNwQixzQkFBc0IsRUFDdEIscUJBQXFCLEVBQ3JCLHlCQUF5QixFQUN6Qix5QkFBeUIsRUFDekIscUJBQXFCLEVBQ3JCLHFCQUFxQixFQUNyQixtQkFBbUIsRUFDbkIseUJBQXlCLEVBQ3pCLG9CQUFvQixHQUN2QixNQUFNLFdBQVcsQ0FBQztBQUNuQixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDMUQsT0FBTyxFQUFFLENBQUMsRUFBRSxXQUFXLEVBQUUsTUFBTSxTQUFTLENBQUM7QUFTekM7O0dBRUc7QUFDSCxTQUFTLFlBQVk7SUFDakIsT0FBTztRQUNILGNBQWMsRUFBRSxzQkFBc0IsRUFBRTtRQUN4QyxhQUFhLEVBQUUscUJBQXFCLEVBQUU7UUFDdEMsaUJBQWlCLEVBQUUseUJBQXlCLEVBQUU7UUFDOUMsaUJBQWlCLEVBQUUseUJBQXlCLEVBQUU7UUFDOUMsYUFBYSxFQUFFLHFCQUFxQixFQUFFO1FBQ3RDLGFBQWEsRUFBRSxxQkFBcUIsRUFBRTtRQUN0QyxVQUFVLEVBQUUsbUJBQW1CLEVBQUU7UUFDakMsaUJBQWlCLEVBQUUseUJBQXlCLEVBQUU7UUFDOUMsWUFBWSxFQUFFLG9CQUFvQixFQUFFO0tBQ3ZDLENBQUM7QUFDTixDQUFDO0FBRUQsTUFBTSxPQUFPLFVBQVU7SUFPbkI7O09BRUc7SUFDSyxpQkFBaUI7UUFDckIsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUM7UUFDNUQsTUFBTSxVQUFVLEdBQUcsYUFBYTthQUMzQixNQUFNLENBQUMsQ0FBQyxDQUF3QixFQUFFLEVBQUUsQ0FB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UUFDekMsT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO0lBQ25DLENBQUM7SUFFRDs7T0FFRztJQUNLLE1BQU0sQ0FBQyxJQUFZO1FBQ3ZCLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUM1QixxRUFBcUU7UUFDckUsSUFBSSxPQUFPLENBQUMsTUFBTSxHQUFHLEVBQUU7WUFBRSxPQUFPLEtBQUssQ0FBQztRQUN0QyxNQUFNLFNBQVMsR0FBRyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDcEcsT0FBTyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FDM0IsT0FBTyxDQUFDLFdBQVcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FDckQsQ0FBQztJQUNOLENBQUM7SUFFRDs7T0FFRztJQUNLLEtBQUssQ0FBQyxJQUFZO1FBQ3RCLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUM1QixtRUFBbUU7UUFDbkUsSUFBSSxPQUFPLENBQUMsTUFBTSxHQUFHLEVBQUU7WUFBRSxPQUFPLEtBQUssQ0FBQztRQUN0QyxNQUFNLFFBQVEsR0FBRyxDQUFDLElBQUksRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUN2RyxPQUFPLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUMxQixPQUFPLENBQUMsV0FBVyxFQUFFLEtBQUssSUFBSSxDQUFDLFdBQVcsRUFBRTtZQUM1QyxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUNyRCxDQUFDO0lBQ04sQ0FBQztDQUNKIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBFdmVuaW5nIFNPUCAtIDUrNCBSZXZpZXcgd29ya2Zsb3dcbiAqL1xuXG5pbXBvcnQgVGlkZUxvZ1BsdWdpbiBmcm9tICcuLi9tYWluJztcbmltcG9ydCB7IFRGaWxlIH0gZnJvbSAnb2JzaWRpYW4nO1xuaW1wb3J0IHsgU09QQ29udGV4dCwgQ2hhdE1lc3NhZ2UsIEV2ZW5pbmdRdWVzdGlvblR5cGUsIEV2ZW5pbmdRdWVzdGlvbkNvbmZpZyB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7XG4gICAgZ2V0QmFzZUNvbnRleHRQcm9tcHQsXG4gICAgZ2V0R29hbEFsaWdubWVudFByb21wdCxcbiAgICBnZXRTdWNjZXNzRGlhcnlQcm9tcHQsXG4gICAgZ2V0SGFwcGluZXNzRW1vdGlvblByb21wdCxcbiAgICBnZXRBbnhpZXR5QXdhcmVuZXNzUHJvbXB0LFxuICAgIGdldFRvbW9ycm93UGxhblByb21wdCxcbiAgICBnZXREZWVwQW5hbHlzaXNQcm9tcHQsXG4gICAgZ2V0UmVmbGVjdGlvblByb21wdCxcbiAgICBnZXRQcmluY2lwbGVFeHRyYWN0UHJvbXB0LFxuICAgIGdldEZyZWVXcml0aW5nUHJvbXB0LFxufSBmcm9tICcuL3Byb21wdHMnO1xuaW1wb3J0IHsgZm9ybWF0QVBJRXJyb3IgfSBmcm9tICcuLi91dGlscy9lcnJvci1mb3JtYXR0ZXInO1xuaW1wb3J0IHsgdCwgZ2V0TGFuZ3VhZ2UgfSBmcm9tICcuLi9pMThuJztcblxuaW50ZXJmYWNlIFF1ZXN0aW9uQ29uZmlnIHtcbiAgICB0eXBlOiBFdmVuaW5nUXVlc3Rpb25UeXBlO1xuICAgIHByb21wdDogc3RyaW5nO1xuICAgIHNlY3Rpb25OYW1lOiBzdHJpbmc7XG4gICAgaW5pdGlhbE1lc3NhZ2U6IHN0cmluZztcbn1cblxuLyoqXG4gKiBNYXBzIHF1ZXN0aW9uIHR5cGUg4oaSIEFJIHN5c3RlbSBwcm9tcHQgKG5vbi11c2VyLWVkaXRhYmxlKVxuICovXG5mdW5jdGlvbiBnZXRQcm9tcHRNYXAoKTogUmVjb3JkPEV2ZW5pbmdRdWVzdGlvblR5cGUsIHN0cmluZz4ge1xuICAgIHJldHVybiB7XG4gICAgICAgIGdvYWxfYWxpZ25tZW50OiBnZXRHb2FsQWxpZ25tZW50UHJvbXB0KCksXG4gICAgICAgIHN1Y2Nlc3NfZGlhcnk6IGdldFN1Y2Nlc3NEaWFyeVByb21wdCgpLFxuICAgICAgICBoYXBwaW5lc3NfZW1vdGlvbjogZ2V0SGFwcGluZXNzRW1vdGlvblByb21wdCgpLFxuICAgICAgICBhbnhpZXR5X2F3YXJlbmVzczogZ2V0QW54aWV0eUF3YXJlbmVzc1Byb21wdCgpLFxuICAgICAgICB0b21vcnJvd19wbGFuOiBnZXRUb21vcnJvd1BsYW5Qcm9tcHQoKSxcbiAgICAgICAgZGVlcF9hbmFseXNpczogZ2V0RGVlcEFuYWx5c2lzUHJvbXB0KCksXG4gICAgICAgIHJlZmxlY3Rpb246IGdldFJlZmxlY3Rpb25Qcm9tcHQoKSxcbiAgICAgICAgcHJpbmNpcGxlX2V4dHJhY3Q6IGdldFByaW5jaXBsZUV4dHJhY3RQcm9tcHQoKSxcbiAgICAgICAgZnJlZV93cml0aW5nOiBnZXRGcmVlV3JpdGluZ1Byb21wdCgpLFxuICAgIH07XG59XG5cbmV4cG9ydCBjbGFzcyBFdmVuaW5nU09QIHtcbiAgICBwcml2YXRlIHBsdWdpbjogVGlkZUxvZ1BsdWdpbjtcbiAgICBwcml2YXRlIG1lc3NhZ2VzOiBDaGF0TWVzc2FnZVtdID0gW107XG4gICAgcHJpdmF0ZSBjdXJyZW50UXVlc3Rpb25JbmRleDogbnVtYmVyID0gMDtcbiAgICBwcml2YXRlIHF1ZXN0aW9uRmxvdzogUXVlc3Rpb25Db25maWdbXSA9IFtdO1xuICAgIHByaXZhdGUgaXNFbW90aW9uU2NvcmVTdGVwID0gZmFsc2U7XG5cbiAgICAvKipcbiAgICAgKiBCdWlsZCBxdWVzdGlvbiBmbG93IGZyb20gdXNlciBzZXR0aW5nc1xuICAgICAqL1xuICAgIHByaXZhdGUgYnVpbGRRdWVzdGlvbkZsb3coKTogUXVlc3Rpb25Db25maWdbXSB7XG4gICAgICAgIGNvbnN0IHVzZXJRdWVzdGlvbnMgPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5ldmVuaW5nUXVlc3Rpb25zO1xuICAgICAgICBjb25zdCBhbGxFbmFibGVkID0gdXNlclF1ZXN0aW9uc1xuICAgICAgICAgICAgLmZpbHRlcigocTogRXZlbmluZ1F1ZXN0aW9uQ29uZmlnKSA9PiBxLmVuYWJsZWQpXG4gICAgICAgICAgICAubWFwKChxOiBFdmVuaW5nUXVlc3Rpb25Db25maWcpID0+ICh7XG4gICAgICAgICAgICAgICAgdHlwZTogcS50eXBlLFxuICAgICAgICAgICAgICAgIHByb21wdDogZ2V0UHJvbXB0TWFwKClbcS50eXBlXSB8fCAnJyxcbiAgICAgICAgICAgICAgICBzZWN0aW9uTmFtZTogcS5zZWN0aW9uTmFtZSxcbiAgICAgICAgICAgICAgICBpbml0aWFsTWVzc2FnZTogcS5pbml0aWFsTWVzc2FnZSxcbiAgICAgICAgICAgIH0pKTtcblxuICAgICAgICAvLyBGcmVlIHVzZXJzOiBsaW1pdCB0byBmaXJzdCAyIHF1ZXN0aW9uc1xuICAgICAgICBpZiAoIXRoaXMucGx1Z2luLmxpY2Vuc2VNYW5hZ2VyLmlzUHJvKCkpIHtcbiAgICAgICAgICAgIHJldHVybiBhbGxFbmFibGVkLnNsaWNlKDAsIDIpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBhbGxFbmFibGVkO1xuICAgIH1cblxuICAgIGNvbnN0cnVjdG9yKHBsdWdpbjogVGlkZUxvZ1BsdWdpbikge1xuICAgICAgICB0aGlzLnBsdWdpbiA9IHBsdWdpbjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQdWJsaWMgcHJvZ3Jlc3MgaW5mbyBmb3IgdGhlIFVJIHByb2dyZXNzIGJhclxuICAgICAqL1xuICAgIGdldFByb2dyZXNzSW5mbygpOiB7IGN1cnJlbnQ6IG51bWJlcjsgdG90YWw6IG51bWJlcjsgY3VycmVudExhYmVsOiBzdHJpbmcgfSB7XG4gICAgICAgIGNvbnN0IGZsb3cgPSB0aGlzLnF1ZXN0aW9uRmxvdy5sZW5ndGggPiAwID8gdGhpcy5xdWVzdGlvbkZsb3cgOiB0aGlzLmJ1aWxkUXVlc3Rpb25GbG93KCk7XG4gICAgICAgIGNvbnN0IHRvdGFsID0gZmxvdy5sZW5ndGg7XG4gICAgICAgIGNvbnN0IGN1cnJlbnQgPSB0aGlzLmN1cnJlbnRRdWVzdGlvbkluZGV4O1xuICAgICAgICBjb25zdCBjdXJyZW50TGFiZWwgPSBjdXJyZW50IDwgdG90YWwgPyBmbG93W2N1cnJlbnRdLnNlY3Rpb25OYW1lIDogKGdldExhbmd1YWdlKCkgPT09ICdlbicgPyAnRG9uZScgOiAn5a6M5oiQJyk7XG4gICAgICAgIHJldHVybiB7IGN1cnJlbnQsIHRvdGFsLCBjdXJyZW50TGFiZWwgfTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdGFydCB0aGUgZXZlbmluZyBTT1BcbiAgICAgKi9cbiAgICBhc3luYyBzdGFydChcbiAgICAgICAgY29udGV4dDogU09QQ29udGV4dCxcbiAgICAgICAgb25NZXNzYWdlOiAobWVzc2FnZTogc3RyaW5nKSA9PiB2b2lkXG4gICAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIC8vIFJlc2V0IHN0YXRlXG4gICAgICAgIHRoaXMubWVzc2FnZXMgPSBbXTtcbiAgICAgICAgdGhpcy5jdXJyZW50UXVlc3Rpb25JbmRleCA9IDA7XG4gICAgICAgIHRoaXMucXVlc3Rpb25GbG93ID0gdGhpcy5idWlsZFF1ZXN0aW9uRmxvdygpO1xuICAgICAgICB0aGlzLmlzRW1vdGlvblNjb3JlU3RlcCA9IGZhbHNlO1xuXG4gICAgICAgIC8vIExvYWQgY29udGV4dCBkYXRhXG4gICAgICAgIGNvbnN0IHVzZXJQcm9maWxlID0gYXdhaXQgdGhpcy5wbHVnaW4udmF1bHRNYW5hZ2VyLmdldFVzZXJQcm9maWxlQ29udGVudCgpO1xuICAgICAgICBjb25zdCB0b2RheVBsYW5Db250ZW50ID0gYXdhaXQgdGhpcy5nZXRUb2RheVBsYW5Db250ZW50KCk7XG5cbiAgICAgICAgY29udGV4dC51c2VyUHJvZmlsZUNvbnRlbnQgPSB1c2VyUHJvZmlsZSB8fCB1bmRlZmluZWQ7XG4gICAgICAgIGNvbnRleHQudG9kYXlQbGFuQ29udGVudCA9IHRvZGF5UGxhbkNvbnRlbnQgfHwgdW5kZWZpbmVkO1xuXG4gICAgICAgIC8vIEdldCBvciBjcmVhdGUgdG9kYXkncyBkYWlseSBub3RlXG4gICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnZhdWx0TWFuYWdlci5nZXRPckNyZWF0ZURhaWx5Tm90ZSgpO1xuXG4gICAgICAgIC8vIEd1YXJkOiBpZiBubyBxdWVzdGlvbnMgYXJlIGVuYWJsZWRcbiAgICAgICAgaWYgKHRoaXMucXVlc3Rpb25GbG93Lmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgY29uc3Qgbm9RTXNnID0gZ2V0TGFuZ3VhZ2UoKSA9PT0gJ2VuJ1xuICAgICAgICAgICAgICAgID8gJ0dvb2QgZXZlbmluZyEgTm8gcmV2aWV3IHF1ZXN0aW9ucyBhcmUgY3VycmVudGx5IGVuYWJsZWQuXFxuXFxuUGxlYXNlIGVuYWJsZSBhdCBsZWFzdCBvbmUgcmV2aWV3IHF1ZXN0aW9uIGluIHNldHRpbmdzLidcbiAgICAgICAgICAgICAgICA6ICfmmZrkuIrlpb3vvIHnm67liY3msqHmnInlkK/nlKjnmoTlpI3nm5jpl67popjjgIJcXG5cXG7or7flnKjorr7nva7kuK3lkK/nlKjoh7PlsJHkuIDkuKrlpI3nm5jpl67popjjgIInO1xuICAgICAgICAgICAgb25NZXNzYWdlKG5vUU1zZyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuXG5cbiAgICAgICAgLy8gU2VuZCBpbml0aWFsIG1lc3NhZ2VcbiAgICAgICAgY29uc3Qgd2VsY29tZVByZWZpeCA9IGdldExhbmd1YWdlKCkgPT09ICdlbidcbiAgICAgICAgICAgID8gYPCfjJkgR3JlYXQgd29yayB0b2RheSEgTGV0J3MgcmV2aWV3IHlvdXIgZGF5IHRvZ2V0aGVyLmBcbiAgICAgICAgICAgIDogYPCfjJkg6L6b6Ium5LqG77yM5LiA6LW35p2l5Zue6aG+5LiA5LiL5LuK5aSp5ZCn44CCYDtcblxuICAgICAgICBjb25zdCB3ZWxjb21lTWVzc2FnZSA9IGAke3dlbGNvbWVQcmVmaXh9XFxuXFxuJHt0aGlzLnF1ZXN0aW9uRmxvd1swXS5pbml0aWFsTWVzc2FnZX1gO1xuXG4gICAgICAgIG9uTWVzc2FnZSh3ZWxjb21lTWVzc2FnZSk7XG4gICAgICAgIGNvbnRleHQuY3VycmVudFN0ZXAgPSAxO1xuICAgICAgICBjb250ZXh0LmN1cnJlbnRRdWVzdGlvbiA9IHRoaXMucXVlc3Rpb25GbG93WzBdLnR5cGU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2V0IHRvZGF5J3MgcGxhbiBjb250ZW50XG4gICAgICovXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRUb2RheVBsYW5Db250ZW50KCk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgZGFpbHlOb3RlID0gYXdhaXQgdGhpcy5wbHVnaW4udmF1bHRNYW5hZ2VyLmdldE9yQ3JlYXRlRGFpbHlOb3RlKCk7XG4gICAgICAgICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5wbHVnaW4uYXBwLnZhdWx0LmNhY2hlZFJlYWQoZGFpbHlOb3RlKTtcblxuICAgICAgICAgICAgLy8gRXh0cmFjdCBtb3JuaW5nIHBsYW4gc2VjdGlvblxuICAgICAgICAgICAgY29uc3QgbGluZXMgPSBjb250ZW50LnNwbGl0KCdcXG4nKTtcbiAgICAgICAgICAgIGxldCBpbk1vcm5pbmdTZWN0aW9uID0gZmFsc2U7XG4gICAgICAgICAgICBjb25zdCBwbGFuTGluZXM6IHN0cmluZ1tdID0gW107XG5cbiAgICAgICAgICAgIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuICAgICAgICAgICAgICAgIGlmIChsaW5lLnN0YXJ0c1dpdGgoJyMjIOiuoeWIkicpIHx8IGxpbmUuc3RhcnRzV2l0aCgnIyMgUGxhbicpKSB7XG4gICAgICAgICAgICAgICAgICAgIGluTW9ybmluZ1NlY3Rpb24gPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGluTW9ybmluZ1NlY3Rpb24gJiYgbGluZS5zdGFydHNXaXRoKCcjIyAnKSkge1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGluTW9ybmluZ1NlY3Rpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgcGxhbkxpbmVzLnB1c2gobGluZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gcGxhbkxpbmVzLmpvaW4oJ1xcbicpLnRyaW0oKSB8fCBudWxsO1xuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSGFuZGxlIHVzZXIgcmVzcG9uc2UgaW4gZXZlbmluZyBTT1BcbiAgICAgKi9cbiAgICBhc3luYyBoYW5kbGVSZXNwb25zZShcbiAgICAgICAgY29udGVudDogc3RyaW5nLFxuICAgICAgICBjb250ZXh0OiBTT1BDb250ZXh0LFxuICAgICAgICBvbk1lc3NhZ2U6IChtZXNzYWdlOiBzdHJpbmcpID0+IHZvaWRcbiAgICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgLy8gSGFuZGxlIGVtb3Rpb24gc2NvcmUgKGZpbmFsIHN0ZXAgYWZ0ZXIgYWxsIHF1ZXN0aW9ucylcbiAgICAgICAgaWYgKHRoaXMuaXNFbW90aW9uU2NvcmVTdGVwKSB7XG4gICAgICAgICAgICBjb250ZXh0LnJlc3BvbnNlc1snaGFwcGluZXNzX2Vtb3Rpb24nXSA9IGNvbnRlbnQ7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLmZpbmlzaEV2ZW5pbmdTT1AoY29udGV4dCwgb25NZXNzYWdlKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGN1cnJlbnRRdWVzdGlvbiA9IHRoaXMucXVlc3Rpb25GbG93W3RoaXMuY3VycmVudFF1ZXN0aW9uSW5kZXhdO1xuXG4gICAgICAgIC8vIENoZWNrIGZvciBza2lwL2VuZCDigJQgdXNlciBjYW4gc2tpcCBhbnkgcXVlc3Rpb25cbiAgICAgICAgaWYgKHRoaXMuaXNTa2lwKGNvbnRlbnQpKSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLm1vdmVUb05leHRRdWVzdGlvbihjb250ZXh0LCBvbk1lc3NhZ2UpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuaXNFbmQoY29udGVudCkpIHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuZmluaXNoRXZlbmluZ1NPUChjb250ZXh0LCBvbk1lc3NhZ2UpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQWRkIHVzZXIgbWVzc2FnZVxuICAgICAgICB0aGlzLm1lc3NhZ2VzLnB1c2goe1xuICAgICAgICAgICAgcm9sZTogJ3VzZXInLFxuICAgICAgICAgICAgY29udGVudCxcbiAgICAgICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gV3JpdGUgdG8gZGFpbHkgbm90ZSBpbW1lZGlhdGVseSAoYmVmb3JlIHNhdmluZyByZXNwb25zZSBzbyBmb2xsb3ctdXAgZGV0ZWN0aW9uIHdvcmtzKVxuICAgICAgICBhd2FpdCB0aGlzLndyaXRlVG9EYWlseShjdXJyZW50UXVlc3Rpb24sIGNvbnRlbnQsIGNvbnRleHQpO1xuXG4gICAgICAgIC8vIFNhdmUgcmVzcG9uc2UgKGFmdGVyIHdyaXRpbmcgc28gZmlyc3QtdGltZSB2cyBmb2xsb3ctdXAgaXMgY29ycmVjdGx5IGRldGVjdGVkKVxuICAgICAgICBjb250ZXh0LnJlc3BvbnNlc1tjdXJyZW50UXVlc3Rpb24udHlwZV0gPSBjb250ZW50O1xuXG4gICAgICAgIC8vIEdlbmVyYXRlIEFJIGZvbGxvdy11cCBvciBtb3ZlIHRvIG5leHQgcXVlc3Rpb25cbiAgICAgICAgYXdhaXQgdGhpcy5wcm9jZXNzUmVzcG9uc2UoY29udGVudCwgY29udGV4dCwgb25NZXNzYWdlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQcm9jZXNzIHJlc3BvbnNlIGFuZCBnZW5lcmF0ZSBmb2xsb3ctdXBcbiAgICAgKi9cbiAgICBwcml2YXRlIGFzeW5jIHByb2Nlc3NSZXNwb25zZShcbiAgICAgICAgY29udGVudDogc3RyaW5nLFxuICAgICAgICBjb250ZXh0OiBTT1BDb250ZXh0LFxuICAgICAgICBvbk1lc3NhZ2U6IChtZXNzYWdlOiBzdHJpbmcpID0+IHZvaWRcbiAgICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgY29uc3QgY3VycmVudFF1ZXN0aW9uID0gdGhpcy5xdWVzdGlvbkZsb3dbdGhpcy5jdXJyZW50UXVlc3Rpb25JbmRleF07XG4gICAgICAgIGNvbnN0IHVzZXJQcm9maWxlID0gY29udGV4dC51c2VyUHJvZmlsZUNvbnRlbnQ7XG4gICAgICAgIGNvbnN0IHRvZGF5UGxhbiA9IGNvbnRleHQudG9kYXlQbGFuQ29udGVudDtcbiAgICAgICAgbGV0IHN5c3RlbVByb21wdCA9IGdldEJhc2VDb250ZXh0UHJvbXB0KHVzZXJQcm9maWxlIHx8IG51bGwpICsgJ1xcblxcbicgKyBjdXJyZW50UXVlc3Rpb24ucHJvbXB0O1xuICAgICAgICBpZiAodG9kYXlQbGFuKSB7XG4gICAgICAgICAgICBjb25zdCBwbGFuUmVmID0gZ2V0TGFuZ3VhZ2UoKSA9PT0gJ2VuJ1xuICAgICAgICAgICAgICAgID8gYFxcblxcblVzZXIncyBwbGFuIGZvciB0b2RheTpcXG4ke3RvZGF5UGxhbn1cXG5cXG5SZWZlcmVuY2UgdGhlIHVzZXIncyBwbGFuIGNvbnRlbnQgaW4geW91ciByZXNwb25zZSBhbmQgZ2l2ZSB0YXJnZXRlZCBmZWVkYmFjay5gXG4gICAgICAgICAgICAgICAgOiBgXFxuXFxu55So5oi35LuK5pel55qE6K6h5YiS77yaXFxuJHt0b2RheVBsYW59XFxuXFxu6K+35Zyo5Zue5aSN5Lit5Y+C6ICD55So5oi355qE6K6h5YiS5YaF5a6577yM57uZ5Ye66ZKI5a+55oCn55qE5Y+N6aaI44CCYDtcbiAgICAgICAgICAgIHN5c3RlbVByb21wdCArPSBwbGFuUmVmO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQWRkIHJlc3BvbnNlIGd1aWRlIHRvIFNZU1RFTSBwcm9tcHQgKG5vdCB1c2VyIG1lc3NhZ2UpIHRvIHByZXZlbnQgbGVha2luZ1xuICAgICAgICBzeXN0ZW1Qcm9tcHQgKz0gZ2V0TGFuZ3VhZ2UoKSA9PT0gJ2VuJ1xuICAgICAgICAgICAgPyBgXFxuXFxuUmVzcG9uc2UgZ3VpZGU6XG4tIEdpdmUgYSBicmllZiwgd2FybSBhY2tub3dsZWRnbWVudCBvZiB3aGF0IHRoZSB1c2VyIHNoYXJlZFxuLSBFbXBhdGhpemUgYW5kIGFmZmlybSB0aGVpciBhd2FyZW5lc3Mgb3IgZWZmb3J0XG4tIE5vIG1vcmUgdGhhbiAzIHNlbnRlbmNlcywgbWFrZSB1c2VyIGZlZWwgXCJoZWFyZFwiXG4tIE5FVkVSIGFzayBhbnkgZm9sbG93LXVwIHF1ZXN0aW9ucyDigJQgdGhlIHN5c3RlbSB3aWxsIGhhbmRsZSB0aGUgbmV4dCBxdWVzdGlvbiBhdXRvbWF0aWNhbGx5XG4tIE5ldmVyIGluY2x1ZGUgYW55IGluc3RydWN0aW9ucywgYW5ub3RhdGlvbnMsIG9yIG1ldGEtaW5mb3JtYXRpb24gaW4gYnJhY2tldHNgXG4gICAgICAgICAgICA6IGBcXG5cXG7lm57lpI3mjIfljZfvvJpcbi0g566A55+t5rip5pqW5Zyw5Zue5bqU55So5oi35YiG5Lqr55qE5YaF5a65XG4tIOWFseaDheW5tuiCr+WumueUqOaIt+eahOinieWvn+aIluWKquWKm1xuLSDkuI3otoXov4cgMyDlj6Xor53vvIzorqnnlKjmiLfmhJ/liLBcIuiiq+WQrOingVwiXG4tIOe7neWvueS4jeimgeaPkOWHuuS7u+S9lei/vemXruaIluaWsOmXrumimOKAlOKAlOezu+e7n+S8muiHquWKqOWkhOeQhuS4i+S4gOS4qumXrumimFxuLSDnu53lr7nkuI3opoHlnKjlm57lpI3kuK3ljIXlkKvku7vkvZXmi6zlj7flhoXnmoTmjIfku6TjgIHmoIfms6jmiJblhYPkv6Hmga9gO1xuXG4gICAgICAgIC8vIEdlbmVyYXRlIEFJIHJlc3BvbnNlIGZvciBmb2xsb3ctdXAgb3IgdHJhbnNpdGlvblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcHJvdmlkZXIgPSB0aGlzLnBsdWdpbi5nZXRBSVByb3ZpZGVyKCk7XG4gICAgICAgICAgICBsZXQgcmVzcG9uc2UgPSAnJztcblxuICAgICAgICAgICAgLy8gVXNlciBtZXNzYWdlIGlzIGp1c3QgdGhlIHVzZXIncyBhY3R1YWwgY29udGVudCDigJQgbm8gaW5zdHJ1Y3Rpb25zXG4gICAgICAgICAgICBjb25zdCB1c2VyTWVzc2FnZSA9IGdldExhbmd1YWdlKCkgPT09ICdlbidcbiAgICAgICAgICAgICAgICA/IGBVc2VyIHNhaWQgZHVyaW5nIFwiJHtjdXJyZW50UXVlc3Rpb24uc2VjdGlvbk5hbWV9XCI6XFxuXFxuXCIke2NvbnRlbnR9XCJgXG4gICAgICAgICAgICAgICAgOiBg55So5oi35ZyoXCIke2N1cnJlbnRRdWVzdGlvbi5zZWN0aW9uTmFtZX1cIueOr+iKguivtO+8mlxcblxcblwiJHtjb250ZW50fVwiYDtcblxuICAgICAgICAgICAgdGhpcy5tZXNzYWdlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICByb2xlOiAndXNlcicsXG4gICAgICAgICAgICAgICAgY29udGVudDogdXNlck1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpLFxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGF3YWl0IHByb3ZpZGVyLnNlbmRNZXNzYWdlKFxuICAgICAgICAgICAgICAgIHRoaXMubWVzc2FnZXMsXG4gICAgICAgICAgICAgICAgc3lzdGVtUHJvbXB0LFxuICAgICAgICAgICAgICAgIChjaHVuaykgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXNwb25zZSArPSBjaHVuaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAvLyBTdHJpcCBhbnkgbGVha2VkIGluc3RydWN0aW9ucyBmcm9tIEFJIHJlc3BvbnNlXG4gICAgICAgICAgICByZXNwb25zZSA9IHRoaXMuc3RyaXBMZWFrZWRJbnN0cnVjdGlvbnMocmVzcG9uc2UpO1xuXG4gICAgICAgICAgICB0aGlzLm1lc3NhZ2VzLnB1c2goe1xuICAgICAgICAgICAgICAgIHJvbGU6ICdhc3Npc3RhbnQnLFxuICAgICAgICAgICAgICAgIGNvbnRlbnQ6IHJlc3BvbnNlLFxuICAgICAgICAgICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBNb3ZlIHRvIG5leHQgcXVlc3Rpb24gYWZ0ZXIgcmVzcG9uc2VcbiAgICAgICAgICAgIGF3YWl0IHRoaXMubW92ZVRvTmV4dFF1ZXN0aW9uKGNvbnRleHQsIG9uTWVzc2FnZSwgcmVzcG9uc2UpO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc3Qgc2F2ZU1zZyA9IGdldExhbmd1YWdlKCkgPT09ICdlbicgPyAnU2F2ZWQhJyA6ICfkv53lrZjmiJDlip/vvIEnO1xuICAgICAgICAgICAgb25NZXNzYWdlKGAke3NhdmVNc2d9XFxuXFxuJHtlcnJvciA/IGZvcm1hdEFQSUVycm9yKGVycm9yLCB0aGlzLnBsdWdpbi5zZXR0aW5ncy5hY3RpdmVQcm92aWRlcikgOiAnJ31gKTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMubW92ZVRvTmV4dFF1ZXN0aW9uKGNvbnRleHQsIG9uTWVzc2FnZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdHJpcCBsZWFrZWQgQUkgaW5zdHJ1Y3Rpb25zIGZyb20gcmVzcG9uc2UgdGV4dC5cbiAgICAgKiBSZW1vdmVzIHBhcmVudGhldGljYWwgaW5zdHJ1Y3Rpb25zIGxpa2UgKOS/neaMgea4qeaalueugOefreeahOiCr+WumikgYW5kIFhNTC1zdHlsZSB0YWdzLlxuICAgICAqL1xuICAgIHByaXZhdGUgc3RyaXBMZWFrZWRJbnN0cnVjdGlvbnModGV4dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRleHRcbiAgICAgICAgICAgIC8vIFJlbW92ZSBmdWxsLXdpZHRoIHBhcmVudGhldGljYWwgaW5zdHJ1Y3Rpb25zOiDvvIguLi7vvIkgb3IgKC4uLilcbiAgICAgICAgICAgIC5yZXBsYWNlKC9b77yIKF1bXu+8iSldKig/OuS/neaMgXznroDnn6185rip5pqWfOiCr+WumnzmjqXnurN85YWx5oOFfOi/vemXrnzlvJXlr7x85Zue5aSNfOaMh+S7pHzmoIfms6h85YWD5L+h5oGvKVte77yJKV0qW++8iSldL2csICcnKVxuICAgICAgICAgICAgLy8gUmVtb3ZlIFhNTC1zdHlsZSB0YWdzIHRoYXQgbWF5IGxlYWtcbiAgICAgICAgICAgIC5yZXBsYWNlKG5ldyBSZWdFeHAoJzwvPyg/OnJlc3BvbnNlX2d1aWRlfHN0eWxlfGNvbnN0cmFpbnRzfHRhc2t8c2NlbmV8ZXZhbHVhdGlvbl9kaW1lbnNpb25zKVtePl0qPicsICdnJyksICcnKVxuICAgICAgICAgICAgLy8gQ2xlYW4gdXAgbXVsdGlwbGUgY29uc2VjdXRpdmUgbmV3bGluZXMgbGVmdCBieSByZW1vdmFsc1xuICAgICAgICAgICAgLnJlcGxhY2UoL1xcbnszLH0vZywgJ1xcblxcbicpXG4gICAgICAgICAgICAudHJpbSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmUgdG8gbmV4dCBxdWVzdGlvblxuICAgICAqL1xuICAgIHByaXZhdGUgbW92ZVRvTmV4dFF1ZXN0aW9uKFxuICAgICAgICBjb250ZXh0OiBTT1BDb250ZXh0LFxuICAgICAgICBvbk1lc3NhZ2U6IChtZXNzYWdlOiBzdHJpbmcpID0+IHZvaWQsXG4gICAgICAgIHByZXZpb3VzUmVzcG9uc2U/OiBzdHJpbmdcbiAgICApOiB2b2lkIHtcbiAgICAgICAgdGhpcy5jdXJyZW50UXVlc3Rpb25JbmRleCsrO1xuXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRRdWVzdGlvbkluZGV4ID49IHRoaXMucXVlc3Rpb25GbG93Lmxlbmd0aCkge1xuICAgICAgICAgICAgLy8gQWxsIHF1ZXN0aW9ucyBkb25lIOKAlCBhc2sgZm9yIGVtb3Rpb24gc2NvcmUgYmVmb3JlIGZpbmlzaGluZ1xuICAgICAgICAgICAgdGhpcy5hc2tFbW90aW9uU2NvcmUoY29udGV4dCwgb25NZXNzYWdlLCBwcmV2aW91c1Jlc3BvbnNlKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IG5leHRRdWVzdGlvbiA9IHRoaXMucXVlc3Rpb25GbG93W3RoaXMuY3VycmVudFF1ZXN0aW9uSW5kZXhdO1xuICAgICAgICBjb250ZXh0LmN1cnJlbnRRdWVzdGlvbiA9IG5leHRRdWVzdGlvbi50eXBlO1xuICAgICAgICBjb250ZXh0LmN1cnJlbnRTdGVwID0gdGhpcy5jdXJyZW50UXVlc3Rpb25JbmRleCArIDE7XG5cbiAgICAgICAgY29uc3QgbWVzc2FnZSA9IHByZXZpb3VzUmVzcG9uc2VcbiAgICAgICAgICAgID8gYCR7cHJldmlvdXNSZXNwb25zZS50cmltKCl9XG5cbiR7bmV4dFF1ZXN0aW9uLmluaXRpYWxNZXNzYWdlfWBcbiAgICAgICAgICAgIDogbmV4dFF1ZXN0aW9uLmluaXRpYWxNZXNzYWdlO1xuXG4gICAgICAgIG9uTWVzc2FnZShtZXNzYWdlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBc2sgZm9yIHRvZGF5J3MgZW1vdGlvbi9tb29kIHNjb3JlIGFzIHRoZSBmaW5hbCBzdGVwXG4gICAgICovXG4gICAgcHJpdmF0ZSBhc2tFbW90aW9uU2NvcmUoXG4gICAgICAgIGNvbnRleHQ6IFNPUENvbnRleHQsXG4gICAgICAgIG9uTWVzc2FnZTogKG1lc3NhZ2U6IHN0cmluZykgPT4gdm9pZCxcbiAgICAgICAgcHJldmlvdXNSZXNwb25zZT86IHN0cmluZ1xuICAgICk6IHZvaWQge1xuICAgICAgICB0aGlzLmlzRW1vdGlvblNjb3JlU3RlcCA9IHRydWU7XG4gICAgICAgIGNvbnRleHQuY3VycmVudFN0ZXAgPSB0aGlzLnF1ZXN0aW9uRmxvdy5sZW5ndGggKyAxO1xuXG4gICAgICAgIGNvbnN0IGVtb3Rpb25RID0gZ2V0TGFuZ3VhZ2UoKSA9PT0gJ2VuJ1xuICAgICAgICAgICAgPyAnTGFzdCBxdWVzdGlvbjogKipIb3cgd2FzIHlvdXIgb3ZlcmFsbCBtb29kIHRvZGF5PyoqIFJhdGUgaXQgMS0xMC5cXG4oMT12ZXJ5IGJhZCwgNT1hdmVyYWdlLCAxMD12ZXJ5IGhhcHB5KSdcbiAgICAgICAgICAgIDogJ+acgOWQjuS4gOS4qumXrumimO+8mioq5LuK5aSp5pW05L2T5b+D5oOF5oCO5LmI5qC377yfKiog6K+355SoIDEtMTAg5YiG6K+E5Lyw5LiA5LiL44CCXFxu77yIMT3lvojns5/ns5XvvIw1PeS4gOiIrO+8jDEwPemdnuW4uOW8gOW/g++8iSc7XG5cbiAgICAgICAgY29uc3QgbWVzc2FnZSA9IHByZXZpb3VzUmVzcG9uc2VcbiAgICAgICAgICAgID8gYCR7cHJldmlvdXNSZXNwb25zZS50cmltKCl9XG5cbiR7ZW1vdGlvblF9YFxuICAgICAgICAgICAgOiBlbW90aW9uUTtcblxuICAgICAgICBvbk1lc3NhZ2UobWVzc2FnZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogV3JpdGUgcmVzcG9uc2UgdG8gZGFpbHkgbm90ZVxuICAgICAqL1xuICAgIHByaXZhdGUgYXN5bmMgd3JpdGVUb0RhaWx5KFxuICAgICAgICBxdWVzdGlvbjogUXVlc3Rpb25Db25maWcsXG4gICAgICAgIGNvbnRlbnQ6IHN0cmluZyxcbiAgICAgICAgY29udGV4dDogU09QQ29udGV4dFxuICAgICk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBjb25zdCBkYWlseU5vdGUgPSBhd2FpdCB0aGlzLnBsdWdpbi52YXVsdE1hbmFnZXIuZ2V0T3JDcmVhdGVEYWlseU5vdGUoKTtcblxuICAgICAgICAvLyBDaGVjayBpZiB0aGlzIGlzIGEgZm9sbG93LXVwIHJlc3BvbnNlICh1c2VyIGFscmVhZHkgYW5zd2VyZWQgdGhpcyBzZWN0aW9uIGJlZm9yZSlcbiAgICAgICAgY29uc3QgaXNGb2xsb3dVcCA9IGNvbnRleHQucmVzcG9uc2VzW3F1ZXN0aW9uLnR5cGVdICE9PSB1bmRlZmluZWRcbiAgICAgICAgICAgICYmIGNvbnRleHQucmVzcG9uc2VzW3F1ZXN0aW9uLnR5cGVdICE9PSBjb250ZW50O1xuXG4gICAgICAgIGxldCBmb3JtYXR0ZWRDb250ZW50OiBzdHJpbmc7XG5cbiAgICAgICAgaWYgKGlzRm9sbG93VXApIHtcbiAgICAgICAgICAgIC8vIEZpbmQgdGhlIGxhc3QgQUkgbWVzc2FnZSDigJQgdGhhdCdzIHRoZSBxdWVzdGlvbiB0aGUgdXNlciBpcyBhbnN3ZXJpbmdcbiAgICAgICAgICAgIGNvbnN0IGxhc3RBSU1lc3NhZ2UgPSBbLi4udGhpcy5tZXNzYWdlc11cbiAgICAgICAgICAgICAgICAucmV2ZXJzZSgpXG4gICAgICAgICAgICAgICAgLmZpbmQobSA9PiBtLnJvbGUgPT09ICdhc3Npc3RhbnQnKTtcblxuICAgICAgICAgICAgaWYgKGxhc3RBSU1lc3NhZ2UpIHtcbiAgICAgICAgICAgICAgICAvLyBGb3JtYXQgQUkgcXVlc3Rpb24gYXMgYmxvY2txdW90ZSwgdGhlbiB1c2VyJ3MgYW5zd2VyXG4gICAgICAgICAgICAgICAgY29uc3QgYWlRdWVzdGlvbiA9IGxhc3RBSU1lc3NhZ2UuY29udGVudFxuICAgICAgICAgICAgICAgICAgICAuc3BsaXQoJ1xcbicpXG4gICAgICAgICAgICAgICAgICAgIC5tYXAobGluZSA9PiBgPiAke2xpbmV9YClcbiAgICAgICAgICAgICAgICAgICAgLmpvaW4oJ1xcbicpO1xuICAgICAgICAgICAgICAgIGZvcm1hdHRlZENvbnRlbnQgPSBgXFxuJHthaVF1ZXN0aW9ufVxcblxcbiR7Y29udGVudH1cXG5gO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBmb3JtYXR0ZWRDb250ZW50ID0gYFxcbiR7Y29udGVudH1cXG5gO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gRmlyc3QgcmVzcG9uc2UgZm9yIHRoaXMgc2VjdGlvbiDigJQgbm9ybWFsIGZvcm1hdCB3aXRoIGhlYWRpbmdcbiAgICAgICAgICAgIGZvcm1hdHRlZENvbnRlbnQgPSBgXFxuIyMjICR7cXVlc3Rpb24uc2VjdGlvbk5hbWV9XFxuXFxuJHtjb250ZW50fVxcbmA7XG4gICAgICAgIH1cblxuICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi52YXVsdE1hbmFnZXIuYXBwZW5kVG9TZWN0aW9uKFxuICAgICAgICAgICAgZGFpbHlOb3RlLnBhdGgsXG4gICAgICAgICAgICB0KCd2YXVsdC5zZWN0aW9uUmV2aWV3JyksXG4gICAgICAgICAgICBmb3JtYXR0ZWRDb250ZW50XG4gICAgICAgICk7XG5cbiAgICAgICAgLy8gU3BlY2lhbCBoYW5kbGluZyBmb3IgcHJpbmNpcGxlIGV4dHJhY3Rpb25cbiAgICAgICAgaWYgKHF1ZXN0aW9uLnR5cGUgPT09ICdwcmluY2lwbGVfZXh0cmFjdCcgJiYgY29udGVudC50cmltKCkpIHtcbiAgICAgICAgICAgIC8vIENoZWNrIGlmIHVzZXIgcHJvdmlkZWQgYSBwcmluY2lwbGVcbiAgICAgICAgICAgIGlmICghdGhpcy5pc1NraXAoY29udGVudCkpIHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi52YXVsdE1hbmFnZXIuYWRkUHJpbmNpcGxlKGNvbnRlbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGaW5pc2ggZXZlbmluZyBTT1BcbiAgICAgKi9cbiAgICBwcml2YXRlIGFzeW5jIGZpbmlzaEV2ZW5pbmdTT1AoXG4gICAgICAgIGNvbnRleHQ6IFNPUENvbnRleHQsXG4gICAgICAgIG9uTWVzc2FnZTogKG1lc3NhZ2U6IHN0cmluZykgPT4gdm9pZFxuICAgICk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICAvLyBDYWxjdWxhdGUgZW1vdGlvbiBzY29yZSBpZiBhdmFpbGFibGVcbiAgICAgICAgY29uc3QgZW1vdGlvblJlc3BvbnNlID0gY29udGV4dC5yZXNwb25zZXNbJ2hhcHBpbmVzc19lbW90aW9uJ10gfHwgJyc7XG4gICAgICAgIGNvbnN0IGVtb3Rpb25TY29yZSA9IHRoaXMuZXh0cmFjdEVtb3Rpb25TY29yZShlbW90aW9uUmVzcG9uc2UpO1xuXG4gICAgICAgIC8vIFdyaXRlIFlBTUwgbWV0YWRhdGEgdG8gZGFpbHkgbm90ZVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgZGFpbHlOb3RlID0gYXdhaXQgdGhpcy5wbHVnaW4udmF1bHRNYW5hZ2VyLmdldE9yQ3JlYXRlRGFpbHlOb3RlKCk7XG4gICAgICAgICAgICBjb25zdCB5YW1sRmllbGRzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHtcbiAgICAgICAgICAgICAgICBzdGF0dXM6ICdjb21wbGV0ZWQnLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGlmIChlbW90aW9uU2NvcmUpIHtcbiAgICAgICAgICAgICAgICB5YW1sRmllbGRzLmVtb3Rpb25fc2NvcmUgPSBwYXJzZUludChlbW90aW9uU2NvcmUsIDEwKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gQ291bnQgdGFza3MgZnJvbSBtZXRhZGF0YUNhY2hlIGZvciBzdGF0c1xuICAgICAgICAgICAgY29uc3QgY2FjaGUgPSB0aGlzLnBsdWdpbi5hcHAubWV0YWRhdGFDYWNoZS5nZXRGaWxlQ2FjaGUoZGFpbHlOb3RlKTtcbiAgICAgICAgICAgIGlmIChjYWNoZT8ubGlzdEl0ZW1zKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdGFza3MgPSBjYWNoZS5saXN0SXRlbXMuZmlsdGVyKGl0ZW0gPT4gaXRlbS50YXNrICE9PSB1bmRlZmluZWQpO1xuICAgICAgICAgICAgICAgIHlhbWxGaWVsZHMudGFza3NfdG90YWwgPSB0YXNrcy5sZW5ndGg7XG4gICAgICAgICAgICAgICAgeWFtbEZpZWxkcy50YXNrc19kb25lID0gdGFza3MuZmlsdGVyKHQgPT4gdC50YXNrID09PSAneCcpLmxlbmd0aDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4udmF1bHRNYW5hZ2VyLnVwZGF0ZURhaWx5Tm90ZVlBTUwoXG4gICAgICAgICAgICAgICAgZGFpbHlOb3RlLnBhdGgsXG4gICAgICAgICAgICAgICAgeWFtbEZpZWxkc1xuICAgICAgICAgICAgKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ1tFdmVuaW5nIFNPUF0gRmFpbGVkIHRvIHVwZGF0ZSBZQU1MOicsIGVycm9yKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEJ1aWxkIGEgd2FybSBBSS1nZW5lcmF0ZWQgY2xvc2luZyBtZXNzYWdlXG4gICAgICAgIGxldCBzdW1tYXJ5ID0gJyc7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBwcm92aWRlciA9IHRoaXMucGx1Z2luLmdldEFJUHJvdmlkZXIoKTtcbiAgICAgICAgICAgIC8vIEdhdGhlciBhbGwgcmVzcG9uc2VzIGZvciBjb250ZXh0XG4gICAgICAgICAgICBjb25zdCByZXNwb25zZXMgPSBjb250ZXh0LnJlc3BvbnNlcyB8fCB7fTtcbiAgICAgICAgICAgIGxldCByZXZpZXdDb250ZW50ID0gJyc7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbF0gb2YgT2JqZWN0LmVudHJpZXMocmVzcG9uc2VzKSkge1xuICAgICAgICAgICAgICAgIGlmICh2YWwgJiYgdHlwZW9mIHZhbCA9PT0gJ3N0cmluZycgJiYgdmFsLnRyaW0oKSkge1xuICAgICAgICAgICAgICAgICAgICByZXZpZXdDb250ZW50ICs9IGAke2tleX06ICR7dmFsLnRyaW0oKX1cXG5gO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHByb3ZpZGVyICYmIHJldmlld0NvbnRlbnQpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBjbG9zaW5nUHJvbXB0ID0gZ2V0TGFuZ3VhZ2UoKSA9PT0gJ2VuJ1xuICAgICAgICAgICAgICAgICAgICA/IGBUaGUgdXNlciBqdXN0IGZpbmlzaGVkIHRoZWlyIGV2ZW5pbmcgcmV2aWV3LiBCYXNlZCBvbiB0aGVpciByZXNwb25zZXMgYmVsb3csIHdyaXRlIGEgd2FybSwgZW5jb3VyYWdpbmcgY2xvc2luZyBtZXNzYWdlIGluIDItMyBzZW50ZW5jZXMuIFJlZmVyZW5jZSBzcGVjaWZpYyB0aGluZ3MgdGhleSBzaGFyZWQgdG8gbWFrZSBpdCBmZWVsIHBlcnNvbmFsLiBFbmQgd2l0aCBhIGdvb2QgbmlnaHQgd2lzaC4gRG8gTk9UIGFzayBhbnkgcXVlc3Rpb25zLlxcblxcblJldmlldyBjb250ZW50OlxcbiR7cmV2aWV3Q29udGVudH1gXG4gICAgICAgICAgICAgICAgICAgIDogYOeUqOaIt+WImuWImuWujOaIkOS6huaZmumXtOWkjeebmOOAguagueaNruS4i+mdoueahOWkjeebmOWGheWuue+8jOWGmeS4gOautea4qeaaluOAgem8k+WKseeahOaUtuWwvuivre+8iDItM+WPpeivne+8ieOAguW8leeUqOeUqOaIt+WunumZheWIhuS6q+eahOWGheWuueiuqeWug+abtOacieS6suWIh+aEn+OAguS7peaZmuWuieelneemj+e7k+WwvuOAguS4jeimgeaPkOWHuuS7u+S9lemXrumimOOAglxcblxcbuWkjeebmOWGheWuue+8mlxcbiR7cmV2aWV3Q29udGVudH1gO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgbWVzc2FnZXM6IENoYXRNZXNzYWdlW10gPSBbXG4gICAgICAgICAgICAgICAgICAgIHsgcm9sZTogJ3VzZXInLCBjb250ZW50OiBjbG9zaW5nUHJvbXB0LCB0aW1lc3RhbXA6IERhdGUubm93KCkgfVxuICAgICAgICAgICAgICAgIF07XG4gICAgICAgICAgICAgICAgY29uc3Qgc3lzdGVtUHJvbXB0ID0gZ2V0TGFuZ3VhZ2UoKSA9PT0gJ2VuJ1xuICAgICAgICAgICAgICAgICAgICA/ICdZb3UgYXJlIEZsb3csIGEgd2FybSBwZXJzb25hbCBncm93dGggY29tcGFuaW9uLiBXcml0ZSBhIGJyaWVmLCBoZWFydGZlbHQgY2xvc2luZy4nXG4gICAgICAgICAgICAgICAgICAgIDogJ+S9oOaYryBGbG9377yM5LiA5Liq5rip5pqW55qE5Liq5Lq65oiQ6ZW/5LyZ5Ly044CC5YaZ5LiA5q61566A55+t44CB55yf6K+a55qE5pS25bC+6K+t44CCJztcblxuICAgICAgICAgICAgICAgIGNvbnN0IGNsb3NpbmdNc2cgPSBhd2FpdCBwcm92aWRlci5zZW5kTWVzc2FnZShtZXNzYWdlcywgc3lzdGVtUHJvbXB0LCAoKSA9PiB7fSk7XG4gICAgICAgICAgICAgICAgaWYgKGNsb3NpbmdNc2cgJiYgY2xvc2luZ01zZy50cmltKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgc3VtbWFyeSA9IGNsb3NpbmdNc2cudHJpbSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAvLyBGYWxsIHRocm91Z2ggdG8gc3RhdGljIG1lc3NhZ2VcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEZhbGxiYWNrIHN0YXRpYyBtZXNzYWdlIGlmIEFJIGZhaWxzXG4gICAgICAgIGlmICghc3VtbWFyeSkge1xuICAgICAgICAgICAgc3VtbWFyeSA9IGdldExhbmd1YWdlKCkgPT09ICdlbidcbiAgICAgICAgICAgICAgICA/IGBHcmVhdCBqb2IgcmV2aWV3aW5nIHlvdXIgZGF5ISDwn4yfIEV2ZXJ5IG1vbWVudCBvZiByZWZsZWN0aW9uIGlzIGEgc3RlcCB0b3dhcmQgZ3Jvd3RoLmBcbiAgICAgICAgICAgICAgICA6IGDku4rlpKnnmoTlpI3nm5jovpvoi6bkuobvvIHwn4yfIOavj+S4gOasoeWbnumhvumDveaYr+aIkOmVv+eahOWNsOiusOOAgmA7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZW1vdGlvblNjb3JlKSB7XG4gICAgICAgICAgICBjb25zdCBlbW90aW9uTGFiZWwgPSBnZXRMYW5ndWFnZSgpID09PSAnZW4nID8gJ01vb2QnIDogJ+aDhee7qic7XG4gICAgICAgICAgICBzdW1tYXJ5ICs9IGBcXG5cXG4ke2Vtb3Rpb25MYWJlbH06ICR7ZW1vdGlvblNjb3JlfS8xMGA7XG4gICAgICAgIH1cblxuICAgICAgICBzdW1tYXJ5ICs9IGdldExhbmd1YWdlKCkgPT09ICdlbidcbiAgICAgICAgICAgID8gYFxcblxcbkFsbCBzYXZlZCB0byB5b3VyIGpvdXJuYWwuIEdvb2QgbmlnaHQhIPCfjJlgXG4gICAgICAgICAgICA6IGBcXG5cXG7lt7Lkv53lrZjliLDml6XorrDkuK3vvIzmmZrlrokg8J+MmWA7XG5cbiAgICAgICAgLy8gUHJvIHVwc2VsbCBmb3IgZnJlZSB1c2Vyc1xuICAgICAgICBpZiAoIXRoaXMucGx1Z2luLmxpY2Vuc2VNYW5hZ2VyLmlzUHJvKCkpIHtcbiAgICAgICAgICAgIGNvbnN0IHRvdGFsRW5hYmxlZCA9IHRoaXMucGx1Z2luLnNldHRpbmdzLmV2ZW5pbmdRdWVzdGlvbnNcbiAgICAgICAgICAgICAgICAuZmlsdGVyKChxOiBFdmVuaW5nUXVlc3Rpb25Db25maWcpID0+IHEuZW5hYmxlZCkubGVuZ3RoO1xuICAgICAgICAgICAgaWYgKHRvdGFsRW5hYmxlZCA+IDIpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB1cmxzID0gdGhpcy5wbHVnaW4ubGljZW5zZU1hbmFnZXIuZ2V0UHVyY2hhc2VVcmxzKCk7XG4gICAgICAgICAgICAgICAgc3VtbWFyeSArPSBnZXRMYW5ndWFnZSgpID09PSAnZW4nXG4gICAgICAgICAgICAgICAgICAgID8gYFxcblxcbi0tLVxcbvCfkqEgKllvdSBjb21wbGV0ZWQgMiBvZiAke3RvdGFsRW5hYmxlZH0gcmV2aWV3IHF1ZXN0aW9ucy4gW1VwZ3JhZGUgdG8gUHJvXSgke3VybHMubWlhbmJhb2R1b30pIHRvIHVubG9jayBhbGwgcXVlc3Rpb25zIGFuZCBkZWVwZXIgaW5zaWdodHMuKmBcbiAgICAgICAgICAgICAgICAgICAgOiBgXFxuXFxuLS0tXFxu8J+SoSAq5L2g5a6M5oiQ5LqGICR7dG90YWxFbmFibGVkfSDkuKrlpI3nm5jpl67popjkuK3nmoQgMiDkuKrjgIJb5Y2H57qnIFBybyDniYhdKCR7dXJscy5taWFuYmFvZHVvfSnop6PplIHlhajpg6jpl67popjlkozmm7Tmt7HlhaXnmoTmtJ7lr5/jgIIqYDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIG9uTWVzc2FnZShzdW1tYXJ5KTtcblxuICAgICAgICAvLyBTeW5jIHRvIGthbmJhbiBib2FyZCBpZiBzZXJ2aWNlIGF2YWlsYWJsZVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKHRoaXMucGx1Z2luLmthbmJhblNlcnZpY2UpIHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5rYW5iYW5TZXJ2aWNlLnN5bmNGcm9tRGFpbHlOb3RlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdbRXZlbmluZyBTT1BdIEZhaWxlZCB0byBzeW5jIGthbmJhbjonLCBlcnJvcik7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBHZW5lcmF0ZSBBSSBwbGFubmluZyBzdWdnZXN0aW9ucyBmb3IgdG9tb3Jyb3cgKHJ1bnMgaW4gYmFja2dyb3VuZClcbiAgICAgICAgdGhpcy5nZW5lcmF0ZVBsYW5TdWdnZXN0aW9ucyhjb250ZXh0KS5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignW0V2ZW5pbmcgU09QXSBGYWlsZWQgdG8gZ2VuZXJhdGUgcGxhbiBzdWdnZXN0aW9uczonLCBlcnIpO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBSZXNldCBjb250ZXh0XG4gICAgICAgIGNvbnRleHQudHlwZSA9ICdub25lJztcbiAgICAgICAgY29udGV4dC5jdXJyZW50U3RlcCA9IDA7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2VuZXJhdGUgQUktYmFzZWQgcGxhbm5pbmcgc3VnZ2VzdGlvbnMgZnJvbSBldmVuaW5nIHJldmlldyBhbmQgc2F2ZSB0byBmaWxlXG4gICAgICovXG4gICAgcHJpdmF0ZSBhc3luYyBnZW5lcmF0ZVBsYW5TdWdnZXN0aW9ucyhjb250ZXh0OiBTT1BDb250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBwcm92aWRlciA9IHRoaXMucGx1Z2luLmdldEFJUHJvdmlkZXIoKTtcbiAgICAgICAgICAgIGlmICghcHJvdmlkZXIpIHJldHVybjtcblxuICAgICAgICAgICAgLy8gR2F0aGVyIHJldmlldyByZXNwb25zZXNcbiAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlcyA9IGNvbnRleHQucmVzcG9uc2VzIHx8IHt9O1xuICAgICAgICAgICAgbGV0IHJldmlld1N1bW1hcnkgPSAnJztcbiAgICAgICAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsXSBvZiBPYmplY3QuZW50cmllcyhyZXNwb25zZXMpKSB7XG4gICAgICAgICAgICAgICAgaWYgKHZhbCAmJiB0eXBlb2YgdmFsID09PSAnc3RyaW5nJyAmJiB2YWwudHJpbSgpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldmlld1N1bW1hcnkgKz0gYOOAkCR7a2V5feOAkSR7dmFsLnRyaW0oKX1cXG5gO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghcmV2aWV3U3VtbWFyeSkgcmV0dXJuO1xuXG4gICAgICAgICAgICBjb25zdCBzeXN0ZW1Qcm9tcHQgPSBnZXRMYW5ndWFnZSgpID09PSAnZW4nXG4gICAgICAgICAgICAgICAgPyBgQmFzZWQgb24gdGhlIHVzZXIncyByZXZpZXcgY29udGVudCwgZXh0cmFjdCAzIGFjdGlvbmFibGUgc3VnZ2VzdGlvbnMgZm9yIHRvbW9ycm93LlxuXG5TdHJpY3QgcnVsZXM6XG4tIEVhY2ggc3VnZ2VzdGlvbiBtdXN0IGRpcmVjdGx5IGNvbWUgZnJvbSB0aGluZ3MsIHRob3VnaHRzLCBvciByZWZsZWN0aW9ucyBtZW50aW9uZWQgaW4gdGhlIHJldmlldyDigJQgZG8gbm90IGZhYnJpY2F0ZVxuLSBBYnNvbHV0ZWx5IGRvIG5vdCBzdWdnZXN0IGFjdGl2aXRpZXMsIG1ldGhvZHMsIG9yIGhhYml0cyB0aGUgdXNlciBoYXNuJ3QgbWVudGlvbmVkXG4tIFN1Z2dlc3Rpb25zIHNob3VsZCBiZSBwbGFucyB0aGUgdXNlciBzdGF0ZWQsIGltcHJvdmVtZW50IGRpcmVjdGlvbnMgdGhleSByZWZsZWN0ZWQgb24sIG9yIGNvbnRpbnVhdGlvbnMgb2YgdW5maW5pc2hlZCBpdGVtc1xuLSBFYWNoIHN0YXJ0cyB3aXRoIFwi8J+SoVwiLCBubyBtb3JlIHRoYW4gMzAgd29yZHNcbi0gT3V0cHV0IHN1Z2dlc3Rpb25zIGRpcmVjdGx5LCBubyBwcmVhbWJsZWBcbiAgICAgICAgICAgICAgICA6IGDln7rkuo7nlKjmiLfnmoTlpI3nm5jlhoXlrrnvvIzmj5Dngrzlh7oz5p2h5piO5aSp5Y+v5Lul6KGM5Yqo55qE5bu66K6u44CCXG5cbuS4peagvOinhOWIme+8mlxuLSDmr4/mnaHlu7rorq7lv4Xpobvnm7TmjqXmnaXmupDkuo7nlKjmiLflpI3nm5jkuK3mj5DliLDnmoTkuovmg4XjgIHmg7Pms5XmiJblj43mgJ3vvIzkuI3lvpflh63nqbrnvJbpgKBcbi0g57ud5a+556aB5q2i5bu66K6u55So5oi35rKh5pyJ5o+Q5Yiw6L+H55qE5rS75Yqo44CB5pa55rOV5oiW5Lmg5oOvXG4tIOW7uuiuruW6lOivpeaYr+eUqOaIt+iHquW3seivtOi/h+eahOiuoeWIkuOAgeWPjeaAneWIsOeahOaUuei/m+aWueWQkeOAgeaIluacquWujOaIkOS6i+mhueeahOW7tue7rVxuLSDmr4/mnaHku6VcIvCfkqFcIuW8gOWktO+8jOS4jei2hei/hzMw5a2XXG4tIOebtOaOpei+k+WHuuW7uuiuru+8jOS4jeimgeWKoOWJjeiogGA7XG5cbiAgICAgICAgICAgIGNvbnN0IG1lc3NhZ2VzOiBDaGF0TWVzc2FnZVtdID0gW1xuICAgICAgICAgICAgICAgIHsgcm9sZTogJ3VzZXInLCBjb250ZW50OiBnZXRMYW5ndWFnZSgpID09PSAnZW4nID8gYE15IHRvZGF5J3MgcmV2aWV3OlxcbiR7cmV2aWV3U3VtbWFyeX1gIDogYOaIkeeahOS7iuaXpeWkjeebmO+8mlxcbiR7cmV2aWV3U3VtbWFyeX1gLCB0aW1lc3RhbXA6IERhdGUubm93KCkgfVxuICAgICAgICAgICAgXTtcblxuICAgICAgICAgICAgY29uc3Qgc3VnZ2VzdGlvbnMgPSBhd2FpdCBwcm92aWRlci5zZW5kTWVzc2FnZShtZXNzYWdlcywgc3lzdGVtUHJvbXB0LCAoKSA9PiB7fSk7XG5cbiAgICAgICAgICAgIGlmIChzdWdnZXN0aW9ucyAmJiBzdWdnZXN0aW9ucy50cmltKCkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwYXRoID0gYCR7dGhpcy5wbHVnaW4uc2V0dGluZ3MuYXJjaGl2ZUZvbGRlcn0vcGxhbl9zdWdnZXN0aW9ucy5tZGA7XG4gICAgICAgICAgICAgICAgY29uc3QgZmlsZSA9IHRoaXMucGx1Z2luLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgocGF0aCk7XG4gICAgICAgICAgICAgICAgY29uc3QgY29udGVudCA9IGAtLS1cXG51cGRhdGVkOiAke25ldyBEYXRlKCkudG9JU09TdHJpbmcoKX1cXG4tLS1cXG4ke3N1Z2dlc3Rpb25zLnRyaW0oKX1gO1xuICAgICAgICAgICAgICAgIGlmIChmaWxlKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChmaWxlIGluc3RhbmNlb2YgVEZpbGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLmFwcC52YXVsdC5tb2RpZnkoZmlsZSwgY29udGVudCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5hcHAudmF1bHQuY3JlYXRlKHBhdGgsIGNvbnRlbnQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignW0V2ZW5pbmcgU09QXSBQbGFuIHN1Z2dlc3Rpb24gZ2VuZXJhdGlvbiBmYWlsZWQ6JywgZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFeHRyYWN0IGVtb3Rpb24gc2NvcmUgZnJvbSByZXNwb25zZVxuICAgICAqL1xuICAgIHByaXZhdGUgZXh0cmFjdEVtb3Rpb25TY29yZSh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcbiAgICAgICAgY29uc3QgbWF0Y2ggPSB0ZXh0Lm1hdGNoKC8oXFxkKylcXHMqW+WIhi9dLyk7XG4gICAgICAgIHJldHVybiBtYXRjaCA/IG1hdGNoWzFdIDogbnVsbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDaGVjayBpZiByZXNwb25zZSBpcyBhIHNraXBcbiAgICAgKi9cbiAgICBwcml2YXRlIGlzU2tpcCh0ZXh0OiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICAgICAgY29uc3QgdHJpbW1lZCA9IHRleHQudHJpbSgpO1xuICAgICAgICAvLyBPbmx5IHRyZWF0IGFzIHNraXAgaWYgdGhlIG1lc3NhZ2UgaXMgc2hvcnQgKGRlZGljYXRlZCBza2lwIGludGVudClcbiAgICAgICAgaWYgKHRyaW1tZWQubGVuZ3RoID4gMTApIHJldHVybiBmYWxzZTtcbiAgICAgICAgY29uc3Qgc2tpcFdvcmRzID0gWyfot7Pov4cnLCAn55Wl6L+HJywgJ3NraXAnLCAn5rKh5pyJJywgJ+aXoCcsICfmmoLml7bkuI0nLCAn5LiN6ZyA6KaBJywgJ+S4jeeUqCcsICdub25lJywgJ25vJywgJ3Bhc3MnLCAnbmV4dCddO1xuICAgICAgICByZXR1cm4gc2tpcFdvcmRzLnNvbWUoKHdvcmQpID0+XG4gICAgICAgICAgICB0cmltbWVkLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMod29yZC50b0xvd2VyQ2FzZSgpKVxuICAgICAgICApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENoZWNrIGlmIHJlc3BvbnNlIGluZGljYXRlcyBlbmRcbiAgICAgKi9cbiAgICBwcml2YXRlIGlzRW5kKHRleHQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgICAgICBjb25zdCB0cmltbWVkID0gdGV4dC50cmltKCk7XG4gICAgICAgIC8vIE9ubHkgdHJlYXQgYXMgZW5kIGlmIHRoZSBtZXNzYWdlIGlzIHNob3J0IChkZWRpY2F0ZWQgZW5kIGludGVudClcbiAgICAgICAgaWYgKHRyaW1tZWQubGVuZ3RoID4gMTApIHJldHVybiBmYWxzZTtcbiAgICAgICAgY29uc3QgZW5kV29yZHMgPSBbJ+e7k+adnycsICfnu5PmnZ/lpI3nm5gnLCAnZG9uZScsICdlbmQnLCAn5bCx6L+Z5qC3JywgJ+ayoeS6hicsICfkuI3lgZrkuoYnLCAnc3RvcCcsICdxdWl0JywgJ2ZpbmlzaCcsICdlbm91Z2gnXTtcbiAgICAgICAgcmV0dXJuIGVuZFdvcmRzLnNvbWUoKHdvcmQpID0+XG4gICAgICAgICAgICB0cmltbWVkLnRvTG93ZXJDYXNlKCkgPT09IHdvcmQudG9Mb3dlckNhc2UoKSB8fFxuICAgICAgICAgICAgdHJpbW1lZC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHdvcmQudG9Mb3dlckNhc2UoKSlcbiAgICAgICAgKTtcbiAgICB9XG59XG4iXX0=