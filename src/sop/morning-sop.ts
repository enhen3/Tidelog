/**
 * Morning SOP - Plan alignment workflow
 */

import TideLogPlugin from '../main';
import { SOPContext, ChatMessage } from '../types';
import { getBaseContextPrompt, MORNING_PROMPT } from './prompts';

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
        onMessage: (message: string) => void
    ): Promise<void> {
        // Reset messages
        this.messages = [];

        // Load context data
        const weeklyPlan = await this.plugin.vaultManager.getWeeklyPlanContent();
        const userProfile = await this.plugin.vaultManager.getUserProfileContent();

        context.weeklyPlanContent = weeklyPlan || undefined;
        context.userProfileContent = userProfile || undefined;

        // Build initial prompt
        let contextInfo = '';
        if (weeklyPlan) {
            contextInfo += `\n\n本周计划：\n${weeklyPlan}`;
        }

        // Send initial message
        const initialMessage = `早上好！☀️ 让我们开始今天的晨间计划。

${weeklyPlan ? '我已经读取了你的本周计划，会帮助你对标今日任务。\n' : ''}
首先，今天的精力状态怎么样？请用 1-10 分来评估一下（1=非常疲惫，10=精力充沛）。`;

        onMessage(initialMessage);
        context.currentStep = 1;
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
            case 1: // Energy level
                context.responses['energy_level'] = content;
                await this.askTodayPlan(context, onMessage, showTaskInput);
                break;

            case 2: // Today's plan
                context.responses['today_plan'] = content;
                await this.confirmAndWrite(context, onMessage);
                break;

            case 3: // Confirmation or adjustment
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

    /**
     * Ask for today's plan
     */
    private async askTodayPlan(
        context: SOPContext,
        onMessage: (message: string) => void,
        showTaskInput?: () => void
    ): Promise<void> {
        const weeklyPlan = context.weeklyPlanContent;
        const energyLevel = context.responses['energy_level'];

        let message = '';

        if (weeklyPlan) {
            message = `了解了，精力状态 ${energyLevel} 分。

根据你的周计划，我建议今天重点推进以下方向。

**请在下方输入今天要完成的任务：**`;
        } else {
            message = `了解了，精力状态 ${energyLevel} 分。

**请在下方输入今天要完成的任务：**`;
        }

        onMessage(message);
        context.currentStep = 2;

        // Trigger the multi-task input UI
        if (showTaskInput) {
            showTaskInput();
        }
    }

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

请简短评价这个计划的可行性（2-3句话），然后问用户是否确认这个计划。
如果计划看起来太多或太少，温和地指出。`;

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
            context.currentStep = 3;
        } catch (error) {
            onMessage(`评估出错：${error}\n\n请确认你的计划，或调整后重新输入。`);
            context.currentStep = 3;
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
        const energyLevel = context.responses['energy_level'];

        // Format tasks as checkbox items
        console.log('[Morning SOP] Raw todayPlan:', JSON.stringify(todayPlan));
        const formattedPlan = this.formatAsTasks(todayPlan);
        console.log('[Morning SOP] Formatted plan:', JSON.stringify(formattedPlan));

        // Get or create today's daily note
        const dailyNote = await this.plugin.vaultManager.getOrCreateDailyNote();

        // Write to the morning plan section
        const content = `
**精力状态**: ${energyLevel}/10

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
            onMessage(`抱歉，发生了错误：${error}`);
        }
    }
}
