/**
 * Evening SOP - 5+4 Review workflow
 */

import TideLogPlugin from '../main';
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

interface QuestionConfig {
    type: EveningQuestionType;
    prompt: string;
    sectionName: string;
    required: boolean;
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
                required: q.required,
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

        // Load context data
        const userProfile = await this.plugin.vaultManager.getUserProfileContent();
        const todayPlanContent = await this.getTodayPlanContent();

        context.userProfileContent = userProfile || undefined;
        context.todayPlanContent = todayPlanContent || undefined;

        // Get or create today's daily note
        await this.plugin.vaultManager.getOrCreateDailyNote();

        // Guard: if no questions are enabled
        if (this.questionFlow.length === 0) {
            onMessage('晚上好！目前没有启用的复盘问题。\n\n请在设置中启用至少一个晚间复盘问题。');
            return;
        }

        // Count required and optional questions
        const requiredCount = this.questionFlow.filter(q => q.required).length;
        const optionalCount = this.questionFlow.filter(q => !q.required).length;

        // Send initial message
        const welcomeMessage = `晚上好！🌙 让我们开始今天的晚间复盘。

这个过程有 ${requiredCount} 个必答问题${optionalCount > 0 ? `和 ${optionalCount} 个选答问题` : ''}，大约需要 10-15 分钟。
每个问题回答后，我会立即保存到你的日记中。

${todayPlanContent ? '我已读取了你今天的计划，会帮助你回顾。\n' : ''}
准备好了吗？让我们开始！

---

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
            const content = await this.plugin.app.vault.read(dailyNote);

            // Extract morning plan section
            const lines = content.split('\n');
            let inMorningSection = false;
            const planLines: string[] = [];

            for (const line of lines) {
                if (line.startsWith('## 晨间计划')) {
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
        const currentQuestion = this.questionFlow[this.currentQuestionIndex];

        // Check for skip/end
        if (this.isSkip(content) && !currentQuestion.required) {
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

        // Save response
        context.responses[currentQuestion.type] = content;

        // Write to daily note immediately
        await this.writeToDaily(currentQuestion, content, context);

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
            systemPrompt += `\n\n用户今日的晨间计划：\n${todayPlan}\n\n请在回复中参考用户的计划内容，给出针对性的反馈。`;
        }

        // Generate AI response for follow-up or transition
        try {
            const provider = this.plugin.getAIProvider();
            let response = '';

            const transitionPrompt = `用户刚刚回答了"${currentQuestion.sectionName}"环节：
"${content}"

请：
1. 简短回应用户的分享（1-2句话，表示理解和支持）
2. 如果有值得追问的点，可以追问一个问题
3. 如果回答足够完整，给予肯定后准备进入下一环节

回复要简洁，不超过3句话。`;

            this.messages.push({
                role: 'user',
                content: transitionPrompt,
                timestamp: Date.now(),
            });

            await provider.sendMessage(
                this.messages,
                systemPrompt,
                (chunk) => {
                    response += chunk;
                }
            );

            this.messages.push({
                role: 'assistant',
                content: response,
                timestamp: Date.now(),
            });

            // Move to next question after response
            await this.moveToNextQuestion(context, onMessage, response);
        } catch (error) {
            onMessage(`保存成功！\n\n${error ? `(AI 回复出错: ${error})` : ''}`);
            await this.moveToNextQuestion(context, onMessage);
        }
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

        // If not including optional questions, check if next question is optional
        if (!this.plugin.settings.includeOptionalQuestions) {
            // Find next question, skip if it's optional
            while (
                this.currentQuestionIndex < this.questionFlow.length &&
                !this.questionFlow[this.currentQuestionIndex].required
            ) {
                this.currentQuestionIndex++;
            }
        }

        if (this.currentQuestionIndex >= this.questionFlow.length) {
            await this.finishEveningSOP(context, onMessage);
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
     * Write response to daily note
     */
    private async writeToDaily(
        question: QuestionConfig,
        content: string,
        context: SOPContext
    ): Promise<void> {
        const dailyNote = await this.plugin.vaultManager.getOrCreateDailyNote();

        const formattedContent = `\n### ${question.sectionName}\n\n${content}\n`;

        await this.plugin.vaultManager.appendToSection(
            dailyNote.path,
            '晚间复盘',
            formattedContent
        );

        // Special handling for principle extraction
        if (question.type === 'principle_extract' && content.trim()) {
            // Check if user provided a principle
            if (!this.isSkip(content)) {
                await this.plugin.vaultManager.addPrinciple(content);
            }
        }

        // Special handling for tomorrow's plan - sync to next day
        if (question.type === 'tomorrow_plan') {
            await this.syncTomorrowPlan(content);
        }
    }

    /**
     * Sync tomorrow's plan to next day's daily note
     */
    private async syncTomorrowPlan(content: string): Promise<void> {
        try {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);

            // Create tomorrow's note
            const tomorrowNote = await this.plugin.vaultManager.getOrCreateDailyNote(tomorrow);

            // Format as tasks
            const formattedPlan = this.formatAsTasks(content);

            const planContent = `\n**来自昨日复盘的计划：**\n\n${formattedPlan}\n`;

            await this.plugin.vaultManager.appendToSection(
                tomorrowNote.path,
                '晨间计划',
                planContent
            );
        } catch (error) {
            console.error('Failed to sync tomorrow plan:', error);
        }
    }

    /**
     * Format text as task items
     */
    private formatAsTasks(text: string): string {
        const lines = text.split('\n').filter((line) => line.trim());
        return lines
            .map((line) => {
                const cleaned = line.replace(/^[\d\.\-\*\[\]\s]+/, '').trim();
                if (cleaned) {
                    return `- [ ] ${cleaned}`;
                }
                return '';
            })
            .filter((line) => line)
            .join('\n');
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
            const yamlFields: Record<string, string | number | null> = {
                status: 'completed',
            };
            if (emotionScore) {
                yamlFields.emotion_score = parseInt(emotionScore, 10);
            }
            await this.plugin.vaultManager.updateDailyNoteYAML(
                dailyNote.path,
                yamlFields
            );
        } catch (error) {
            console.error('[Evening SOP] Failed to update YAML:', error);
        }

        // Build dynamic summary from completed questions
        const requiredCount = this.questionFlow.filter(q => q.required).length;
        const completedRequired = Math.min(this.currentQuestionIndex, requiredCount);
        const completedOptional = Math.max(0, this.currentQuestionIndex - requiredCount);

        let summary = `✅ 今天的晚间复盘完成了！

**复盘摘要：**`;

        // List completed question sections
        for (let i = 0; i < this.currentQuestionIndex && i < this.questionFlow.length; i++) {
            summary += `\n- ${this.questionFlow[i].sectionName} ✓`;
        }

        if (emotionScore) {
            summary += `\n\n**情绪评分**: ${emotionScore}/10`;
        }

        if (completedOptional > 0) {
            const totalOptional = this.questionFlow.filter(q => !q.required).length;
            summary += `\n- 选问完成 ${completedOptional}/${totalOptional}`;
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

        // Reset context
        context.type = 'none';
        context.currentStep = 0;
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
