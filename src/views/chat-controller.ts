/**
 * Chat Controller - Handles message sending, free chat, intent detection, and insight triggers
 * Extracted from chat-view.ts for maintainability.
 */

import { MarkdownRenderer } from 'obsidian';
import type TideLogPlugin from '../main';
import type { App, Component } from 'obsidian';
import type { ChatMessage, SOPContext } from '../types';

/** Minimal interface for the host view that owns this controller. */
export interface ChatControllerHost extends Component {
    plugin: TideLogPlugin;
    app: App;
    messages: ChatMessage[];
    sopContext: SOPContext;
    quickUpdateMode: boolean;
    inputEl: HTMLTextAreaElement;
    sendButton: HTMLButtonElement;
    isProcessing: boolean;
    messagesContainer: HTMLElement;

    addUserMessage(content: string): void;
    addAIMessage(content: string): void;
    streamAIMessage(content: string): void;
    createMessageElement(type: 'user' | 'ai'): HTMLElement;
    scrollToBottom(): void;
    showTaskInput(prefillTasks?: { text: string; subtasks: string[] }[]): void;
    getExistingTasks(): Promise<{ text: string; subtasks: string[] }[]>;
    startMorningSOP(): Promise<void>;
    startEveningSOP(): Promise<void>;
}

export class ChatController {
    constructor(private host: ChatControllerHost) { }

    /**
     * Detect if the user wants to update a plan
     */
    detectPlanUpdateIntent(content: string): boolean {
        const planKeywords = [
            '更新计划', '修改计划', '调整计划', '改计划',
            '更新今日', '修改今日', '调整今日',
            '更新任务', '修改任务', '调整任务',
            '更新日计划', '更新周计划', '更新月计划',
        ];
        return planKeywords.some((keyword) => content.includes(keyword));
    }

    /**
     * Show plan update options as clickable buttons
     */
    showPlanUpdateOptions(): void {
        const h = this.host;
        const messageEl = h.createMessageElement('ai');

        const text = messageEl.createDiv();
        text.textContent = '你想更新哪个计划？';

        const buttons = messageEl.createDiv('tl-plan-buttons');

        const todayBtn = buttons.createEl('button', {
            cls: 'tl-plan-option-btn',
            text: '📋 更新今日计划',
        });
        todayBtn.addEventListener('click', () => {
            this.startQuickPlanUpdate();
        });

        const weekBtn = buttons.createEl('button', {
            cls: 'tl-plan-option-btn',
            text: '📅 更新周计划',
        });
        weekBtn.addEventListener('click', async () => {
            try {
                const effectiveDate = h.plugin.vaultManager.getEffectiveDate();
                const weekNumber = `W${effectiveDate.format('ww')}`;
                const monthRef = effectiveDate.format('YYYY-MM');
                const template = h.plugin.templateManager.getWeeklyPlanTemplate(weekNumber, monthRef);
                const file = await h.plugin.vaultManager.getOrCreateWeeklyPlan(undefined, template);
                const leaf = h.app.workspace.getLeaf();
                await leaf.openFile(file);
                h.addAIMessage('✅ 已打开本周计划！');
            } catch (e) {
                h.addAIMessage(`❌ 创建周计划失败：${e}`);
            }
        });

        const monthBtn = buttons.createEl('button', {
            cls: 'tl-plan-option-btn',
            text: '📆 更新月计划',
        });
        monthBtn.addEventListener('click', async () => {
            try {
                const effectiveDate = h.plugin.vaultManager.getEffectiveDate();
                const yearMonth = effectiveDate.format('YYYY-MM');
                const template = h.plugin.templateManager.getMonthlyPlanTemplate(yearMonth);
                const file = await h.plugin.vaultManager.getOrCreateMonthlyPlan(undefined, template);
                const leaf = h.app.workspace.getLeaf();
                await leaf.openFile(file);
                h.addAIMessage('✅ 已打开本月计划！');
            } catch (e) {
                h.addAIMessage(`❌ 创建月计划失败：${e}`);
            }
        });

        h.scrollToBottom();
    }

    /**
     * Send a message
     */
    async sendMessage(): Promise<void> {
        const h = this.host;
        const content = h.inputEl.value.trim();
        if (!content || h.isProcessing) return;

        // Add user message
        h.addUserMessage(content);
        h.inputEl.value = '';
        h.inputEl.style.height = 'auto';
        h.inputEl.dispatchEvent(new Event('input'));

        // Check for plan update / adjust intent (works in ANY mode)
        const adjustKeywords = ['调整计划', '修改计划', '调整任务', '修改任务', '改一下', '调整一下'];
        const isAdjust = adjustKeywords.some((k) => content.includes(k));
        if (isAdjust) {
            h.addAIMessage('好的，请重新输入任务：');
            h.quickUpdateMode = true;
            h.sopContext = { type: 'none', currentStep: 0, responses: {} };
            const existingTasks = await h.getExistingTasks();
            h.showTaskInput(existingTasks.length > 0 ? existingTasks : undefined);
            return;
        }

        // Check for plan update intent in free chat mode (e.g. "更新计划")
        if (h.sopContext.type === 'none' && this.detectPlanUpdateIntent(content)) {
            this.showPlanUpdateOptions();
            return;
        }

        // Process based on SOP context
        if (h.sopContext.type === 'morning') {
            const morningSOP = (h as any).morningSOP;
            await morningSOP.handleResponse(content, h.sopContext, (message: string) => {
                h.streamAIMessage(message);
            }, () => {
                // Callback to show task input UI
                h.showTaskInput();
            });
        } else if (h.sopContext.type === 'evening') {
            const eveningSOP = (h as any).eveningSOP;
            await eveningSOP.handleResponse(content, h.sopContext, (message: string) => {
                h.streamAIMessage(message);
            });
        } else {
            // Free chat
            await this.handleFreeChat(content);
        }
    }

    /**
     * Handle free chat message
     */
    private async handleFreeChat(content: string): Promise<void> {
        const h = this.host;
        h.isProcessing = true;
        h.sendButton.disabled = true;

        // Add user message to history
        h.messages.push({
            role: 'user',
            content,
            timestamp: Date.now(),
        });

        // Get AI response
        const messageEl = h.createMessageElement('ai');
        let fullResponse = '';

        try {
            const provider = h.plugin.getAIProvider();

            // Check if API key is configured
            const activeProvider = h.plugin.settings.activeProvider;
            const providerConfig = h.plugin.settings.providers[activeProvider];
            if (!providerConfig.apiKey) {
                messageEl.empty();
                MarkdownRenderer.render(
                    h.app,
                    `⚠️ **未配置 API Key**\n\n请先在 Obsidian 设置 → TideLog 中配置 ${activeProvider.toUpperCase()} 的 API Key。\n\n配置完成后即可开始对话。`,
                    messageEl,
                    '',
                    h
                );
                h.isProcessing = false;
                h.sendButton.disabled = false;
                return;
            }

            const userProfile = await h.plugin.vaultManager.getUserProfileContent();

            const systemPrompt = `你是一位温暖、有洞察力的生活教练和思考伙伴。

你的职责是：
1. 倾听用户的想法，给予理解和支持
2. 通过提问帮助用户深入思考
3. 在适当的时候提供建议和新视角
4. 帮助用户发现自己的模式和成长机会

重要：如果用户提到想要"更新计划"、"修改计划"、"调整任务"等，请告诉他们点击上方的"晨间"按钮来重新规划今日任务，或者直接说"更新计划"让系统引导操作。

${userProfile ? `用户背景：\n${userProfile}` : ''}

请用中文回复，保持温暖友善的语气。`;

            await provider.sendMessage(h.messages, systemPrompt, (chunk) => {
                fullResponse += chunk;
                messageEl.empty();
                MarkdownRenderer.render(h.app, fullResponse, messageEl, '', h);
                h.scrollToBottom();
            });

            // Add to message history
            h.messages.push({
                role: 'assistant',
                content: fullResponse,
                timestamp: Date.now(),
            });
        } catch (error) {
            messageEl.empty();
            const errMsg = String(error);
            if (errMsg.includes('401') || errMsg.includes('403') || errMsg.includes('Unauthorized')) {
                MarkdownRenderer.render(
                    h.app,
                    `🔑 **API Key 无效或已过期**\n\n请检查 Obsidian 设置 → TideLog 中的 API Key 是否正确。`,
                    messageEl,
                    '',
                    h
                );
            } else if (errMsg.includes('429') || errMsg.includes('rate')) {
                MarkdownRenderer.render(
                    h.app,
                    `⏳ **请求过于频繁**\n\n请稍后再试，或切换到其他 AI 提供商。`,
                    messageEl,
                    '',
                    h
                );
            } else if (errMsg.includes('network') || errMsg.includes('fetch') || errMsg.includes('Failed to fetch')) {
                MarkdownRenderer.render(
                    h.app,
                    `🌐 **网络连接失败**\n\n请检查网络连接后重试。如果使用代理，请确认代理设置正确。`,
                    messageEl,
                    '',
                    h
                );
            } else {
                messageEl.createSpan({ text: `抱歉，发生了错误：${error}` });
            }
            messageEl.addClass('tl-message-error');
        }

        h.isProcessing = false;
        h.sendButton.disabled = false;
    }

    /**
     * Start a quick plan update (delegates to task input)
     */
    private async startQuickPlanUpdate(): Promise<void> {
        const h = this.host;
        const existingTasks = await h.getExistingTasks();
        if (existingTasks.length > 0) {
            h.addAIMessage('你可以修改或添加任务：');
        } else {
            h.addAIMessage('请输入要添加的任务：');
        }
        h.quickUpdateMode = true;
        h.showTaskInput(existingTasks.length > 0 ? existingTasks : undefined);
    }

    /**
     * Trigger insight generation (public, called from main.ts)
     */
    triggerInsight(type: 'weekly' | 'monthly'): void {
        const h = this.host;
        const label = type === 'weekly' ? '本周' : '本月';
        h.addAIMessage(`📊 正在生成${label}洞察报告，请稍候...`);

        const messageEl = h.createMessageElement('ai');
        const insightService = h.plugin.insightService;

        const handler = type === 'weekly'
            ? insightService.generateWeeklyInsight.bind(insightService)
            : insightService.generateMonthlyInsight.bind(insightService);

        handler(
            (chunk: string) => {
                // Append chunk to the message element
                messageEl.empty();
                // Accumulate content
                const existing = messageEl.getAttribute('data-content') || '';
                const newContent = existing + chunk;
                messageEl.setAttribute('data-content', newContent);
                MarkdownRenderer.render(h.app, newContent, messageEl, '', h);
                h.scrollToBottom();
            },
            (fullReport: string) => {
                if (fullReport) {
                    // Final render
                    messageEl.empty();
                    MarkdownRenderer.render(h.app, fullReport, messageEl, '', h);
                    h.addAIMessage('📁 报告已保存到 `03-Archive/Insights/` 目录。');
                }
                h.scrollToBottom();
            }
        );
    }

    /**
     * Trigger profile suggestion generation
     */
    triggerProfileSuggestion(): void {
        const h = this.host;
        h.addAIMessage('👤 正在分析你的日记数据，生成用户画像建议...');

        const messageEl = h.createMessageElement('ai');
        const insightService = h.plugin.insightService;

        insightService.generateProfileSuggestions((chunk: string) => {
            messageEl.empty();
            const existing = messageEl.getAttribute('data-content') || '';
            const newContent = existing + chunk;
            messageEl.setAttribute('data-content', newContent);
            MarkdownRenderer.render(h.app, newContent, messageEl, '', h);
            h.scrollToBottom();
        });
    }
}
