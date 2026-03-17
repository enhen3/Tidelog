/**
 * Morning SOP - Plan alignment workflow
 */

import TideLogPlugin from '../main';
import { SOPContext, ChatMessage } from '../types';
import { getBaseContextPrompt, MORNING_PROMPT } from './prompts';
import { formatAPIError } from '../utils/error-formatter';

export class MorningSOP {
    private plugin: TideLogPlugin;
    private messages: ChatMessage[] = [];

    constructor(plugin: TideLogPlugin) {
        this.plugin = plugin;
    }

    /**
     * Start the morning SOP
     */
    async start(
        context: SOPContext,
        onMessage: (message: string) => void,
        showTaskInput?: () => void
    ): Promise<void> {
        // Reset messages
        this.messages = [];

        // Load context data
        const weeklyPlan = await this.plugin.vaultManager.getWeeklyPlanContent();
        const userProfile = await this.plugin.vaultManager.getUserProfileContent();

        context.weeklyPlanContent = weeklyPlan || undefined;
        context.userProfileContent = userProfile || undefined;

        // Send initial message - go directly to task input
        let initialMessage = `早上好！☀️ 让我们开始今天的晨间计划。\n\n`;
        if (weeklyPlan) {
            initialMessage += '我已经读取了你的本周计划，会帮助你对标今日任务。\n\n';
        }
        initialMessage += '**请在下方输入今天要完成的任务：**';

        onMessage(initialMessage);
        context.currentStep = 1;

        // Trigger the multi-task input UI
        if (showTaskInput) {
            showTaskInput();
        }
    }

    /**
     * Handle user response in morning SOP
     */
    async handleResponse(
        content: string,
        context: SOPContext,
        onMessage: (message: string) => void,
        showTaskInput?: () => void
    ): Promise<void> {
        // Add user message
        this.messages.push({
            role: 'user',
            content,
            timestamp: Date.now(),
        });

        // Save response based on current step
        switch (context.currentStep) {
            case 1: // Today's plan (direct entry)
                context.responses['today_plan'] = content;
                await this.confirmAndWrite(context, onMessage);
                break;

            case 2: // Confirmation or adjustment
                if (this.isConfirmation(content)) {
                    await this.finishMorningSOP(context, onMessage);
                } else {
                    context.responses['today_plan'] = content;
                    await this.confirmAndWrite(context, onMessage);
                }
                break;

            default:
                await this.handleFreeChat(content, context, onMessage);
        }
    }

    // askTodayPlan removed -- morning SOP now starts directly with task input

    /**
     * Confirm the plan and prepare to write
     */
    private async confirmAndWrite(
        context: SOPContext,
        onMessage: (message: string) => void
    ): Promise<void> {
        const todayPlan = context.responses['today_plan'];

        // Use AI to evaluate feasibility
        const userProfile = context.userProfileContent;
        const systemPrompt = getBaseContextPrompt(userProfile || null) + '\n\n' + MORNING_PROMPT;

        const evaluationPrompt = `用户今天的计划：
${todayPlan}

快速评估（2-3 句话）：任务量是否现实？有没有一件今天必须推进的核心任务？有什么可以更具体的地方？合理就肯定并确认；有优化空间就像战友一样直接说。`;

        this.messages.push({
            role: 'user',
            content: evaluationPrompt,
            timestamp: Date.now(),
        });

        try {
            const provider = this.plugin.getAIProvider();
            let response = '';

            await provider.sendMessage(
                this.messages,
                systemPrompt,
                (chunk) => {
                    response += chunk;
                }
            );

            onMessage(response + '\n\n确认这个计划吗？（回复"确认"或者调整你的计划）');
            context.currentStep = 2;
        } catch (error) {
            onMessage(formatAPIError(error, this.plugin.settings.activeProvider) + '\n\n请确认你的计划，或调整后重新输入。');
            context.currentStep = 2;
        }
    }

    /**
     * Finish morning SOP and write to daily note
     */
    private async finishMorningSOP(
        context: SOPContext,
        onMessage: (message: string) => void
    ): Promise<void> {
        const todayPlan = context.responses['today_plan'];

        // Format tasks as checkbox items
        const formattedPlan = this.formatAsTasks(todayPlan);

        // Get or create today's daily note
        const dailyNote = await this.plugin.vaultManager.getOrCreateDailyNote();

        // Write to the morning plan section (no energy level)
        const content = `
${formattedPlan}

---
`;

        await this.plugin.vaultManager.appendToSection(
            dailyNote.path,
            '晨间计划',
            content
        );

        onMessage(`✅ 完美！今日计划已写入到你的日记中。\n\n祝你度过高效的一天！如果需要帮助，随时来找我。🌟`);

        // Update daily note YAML status
        try {
            await this.plugin.vaultManager.updateDailyNoteYAML(
                dailyNote.path,
                { status: 'in-progress' }
            );
        } catch (e) {
            console.error('[Morning SOP] Failed to update YAML:', e);
        }

        // Sync to kanban board
        try {
            if (this.plugin.kanbanService) {
                await this.plugin.kanbanService.syncFromDailyNote();
            }
        } catch (e) {
            console.error('[Morning SOP] Failed to sync kanban:', e);
        }

        // Reset context
        context.type = 'none';
        context.currentStep = 0;
    }

    /**
     * Format text as task items
     */
    private formatAsTasks(text: string): string {
        // Tasks come pre-separated by newlines from the multi-task input UI
        const items = text.split('\n')
            .map((line) => line.replace(/^\d+[\.、．\)）]\s*/, '').trim())
            .filter((item) => item.length > 0);

        return items
            .map((item) => `- [ ] ${item}`)
            .join('\n');
    }

    /**
     * Check if response is a confirmation
     */
    private isConfirmation(text: string): boolean {
        const confirmWords = ['确认', '好', '可以', 'ok', 'yes', '是', '确定', '没问题'];
        return confirmWords.some((word) =>
            text.toLowerCase().includes(word.toLowerCase())
        );
    }

    /**
     * Handle free chat after SOP completion
     */
    private async handleFreeChat(
        content: string,
        context: SOPContext,
        onMessage: (message: string) => void
    ): Promise<void> {
        const userProfile = context.userProfileContent;
        const systemPrompt = getBaseContextPrompt(userProfile || null) + '\n\n' + MORNING_PROMPT;

        this.messages.push({
            role: 'user',
            content,
            timestamp: Date.now(),
        });

        try {
            const provider = this.plugin.getAIProvider();
            let response = '';

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

            onMessage(response);
        } catch (error) {
            onMessage(formatAPIError(error, this.plugin.settings.activeProvider));
        }
    }
}
