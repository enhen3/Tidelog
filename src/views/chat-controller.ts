/**
 * Chat Controller - Handles message sending, free chat, intent detection, and insight triggers
 * Extracted from chat-view.ts for maintainability.
 */

import { MarkdownRenderer } from 'obsidian';
import type TideLogPlugin from '../main';
import type { App, Component } from 'obsidian';
import type { ChatMessage, SOPContext } from '../types';
import { formatAPIError } from '../utils/error-formatter';
import type { MorningSOP } from '../sop/morning-sop';
import type { EveningSOP } from '../sop/evening-sop';

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
    morningSOP: MorningSOP;
    eveningSOP: EveningSOP;
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
            await h.morningSOP.handleResponse(content, h.sopContext, (message: string) => {
                h.streamAIMessage(message);
            }, () => {
                // Callback to show task input UI
                h.showTaskInput();
            });
        } else if (h.sopContext.type === 'evening') {
            await h.eveningSOP.handleResponse(content, h.sopContext, (message: string) => {
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

            const systemPrompt = `你是 Flow，用户的个人成长伙伴。现在是自由对话模式。

<strategy>
从用户的话语中自然判断需求：
- 倾诉情绪 → 先共情陪伴："听起来这件事让你……"
- 寻求建议 → 先理解完整情况，再给思考框架
- 自由思考 → 做思考伙伴，用追问帮理清思路
- 分享好消息 → 真心为用户高兴，帮用户品味快乐
</strategy>

<principles>
先回应情绪再回应内容。用提问引导发现。留意浮现的模式。每次 2-4 句话。中文回复。
如果用户提到"更新计划""修改计划""调整任务"，引导点击上方"晨间"按钮或说"更新计划"。
</principles>

${userProfile ? `<user_profile>\n${userProfile}\n</user_profile>\n\n自然地将了解融入对话。` : ''}`;

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
            const friendlyMsg = formatAPIError(error, this.host.plugin.settings.activeProvider);
            MarkdownRenderer.render(h.app, friendlyMsg, messageEl, '', h);
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
                    // Final render — strip extraction tags
                    messageEl.empty();
                    const cleanReport = fullReport
                        .replace(/<new_patterns>[\s\S]*?<\/new_patterns>/g, '')
                        .replace(/<new_principles>[\s\S]*?<\/new_principles>/g, '')
                        .trim();
                    MarkdownRenderer.render(h.app, cleanReport, messageEl, '', h);
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
        let fullContent = '';

        insightService.generateProfileSuggestions(
            (chunk: string) => {
                fullContent += chunk;
                messageEl.empty();
                // Hide <profile_update> and extraction tags from display
                const displayContent = fullContent
                    .replace(/<profile_update>[\s\S]*?<\/profile_update>/g, '')
                    .replace(/<new_patterns>[\s\S]*?<\/new_patterns>/g, '')
                    .replace(/<new_principles>[\s\S]*?<\/new_principles>/g, '')
                    .trim();
                MarkdownRenderer.render(h.app, displayContent, messageEl, '', h);
                h.scrollToBottom();
            },
            (fullResponse: string) => {
                if (fullResponse) {
                    // Show save confirmation
                    const hasUpdate = /<profile_update>/.test(fullResponse);
                    if (hasUpdate) {
                        h.addAIMessage('✅ 用户画像已自动更新，分析记录已保存。你可以在 `user_profile` 文件中查看最新画像。');
                    }
                }
            }
        );
    }
}
