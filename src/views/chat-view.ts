/**
 * Chat View - Sidebar chat interface for AI interactions
 */

import {
    ItemView,
    MarkdownRenderer,
    WorkspaceLeaf,
    TFile,
    setIcon,
    moment,
} from 'obsidian';

import TideLogPlugin from '../main';
import { ChatMessage, SOPContext, SOPType } from '../types';
import { MorningSOP } from '../sop/morning-sop';
import { EveningSOP } from '../sop/evening-sop';
import { PeriodicRenderer, PeriodicMode } from './periodic-renderer';
import { ReviewRenderer } from './review-renderer';
import { TaskInputManager } from './task-input-manager';
import { ChatController } from './chat-controller';

type SidebarTab = 'chat' | 'kanban' | 'review';

export const CHAT_VIEW_TYPE = 'tl-chat-view';

export class ChatView extends ItemView {
    public plugin: TideLogPlugin;
    public messages: ChatMessage[] = [];
    public sopContext: SOPContext = {
        type: 'none',
        currentStep: 0,
        responses: {},
    };

    public messagesContainer!: HTMLElement;
    public inputContainer!: HTMLElement;
    public inputEl!: HTMLTextAreaElement;
    public sendButton!: HTMLButtonElement;
    public isProcessing = false;

    // Task input mode
    public taskInputContainer: HTMLElement | null = null;
    public taskData: { field: HTMLInputElement; subtaskFields: HTMLInputElement[]; subtaskContainer: HTMLElement | null }[] = [];
    public isTaskInputMode = false;
    public quickUpdateMode = false;

    // Tab system
    private activeTab: SidebarTab = 'chat';
    private tabContentEl!: HTMLElement;
    private tabBarEl!: HTMLElement;
    private chatPanel!: HTMLElement;
    public kanbanWeekOffset = 0;
    public kanbanMonthOffset = 0;
    public kanbanDayOffset = 0;
    public calendarMonth: moment.Moment = moment();
    public calendarViewMode: 'month' | 'week' = 'month';
    public calendarWeekOffset = 0;

    // Periodic navigator state
    public periodicMode: PeriodicMode = 'day';
    public periodicSelectedDate: moment.Moment = moment();
    public periodicMonthOffset = 0;

    // Live refresh
    private vaultModifyRef: ReturnType<typeof this.app.vault.on> | null = null;
    private refreshTimer: ReturnType<typeof setTimeout> | null = null;
    private _suppressRefresh = false;

    private morningSOP!: MorningSOP;
    private eveningSOP!: EveningSOP;
    private periodicRenderer!: PeriodicRenderer;
    private reviewRenderer!: ReviewRenderer;
    private taskInputManager!: TaskInputManager;
    private chatController!: ChatController;

    constructor(leaf: WorkspaceLeaf, plugin: TideLogPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.morningSOP = new MorningSOP(plugin);
        this.eveningSOP = new EveningSOP(plugin);
        this.periodicRenderer = new PeriodicRenderer(this);
        this.reviewRenderer = new ReviewRenderer(this);
        this.taskInputManager = new TaskInputManager(this);
        this.chatController = new ChatController(this);
    }

    getViewType(): string {
        return CHAT_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'TideLog「潮记」';
    }

    getIcon(): string {
        return 'tidelog-wave';
    }

    async onOpen(): Promise<void> {
        console.log('[TideLog] ChatView.onOpen() called');
        const container = this.contentEl;
        container.empty();
        container.addClass('tl-chat-container');

        // Header (title only)
        this.renderHeader(container);

        // Tab bar
        this.renderTabBar(container);

        // Tab content area
        this.tabContentEl = container.createDiv('tl-tab-content');

        // Chat panel (SOP buttons + messages + input)
        this.chatPanel = this.tabContentEl.createDiv('tl-tab-panel tl-tab-panel-chat');
        this.renderSOPButtons(this.chatPanel);
        this.messagesContainer = this.chatPanel.createDiv('tl-messages');
        this.renderInputArea(this.chatPanel);
        this.showWelcomeMessage();

        // Switch to chat tab by default
        this.switchTab('chat');

        // Live refresh: re-render kanban when vault files change
        this.vaultModifyRef = this.app.vault.on('modify', (file) => {
            if (this._suppressRefresh) return;
            if (this.activeTab !== 'kanban' && this.activeTab !== 'review') return;
            if (!(file instanceof TFile) || file.extension !== 'md') return;
            // Debounce to avoid re-render storm
            if (this.refreshTimer) clearTimeout(this.refreshTimer);
            this.refreshTimer = setTimeout(() => {
                this.switchTab(this.activeTab, false);
            }, 500);
        });
        this.registerEvent(this.vaultModifyRef);
    }

    async onClose(): Promise<void> {
        if (this.refreshTimer) clearTimeout(this.refreshTimer);
    }

    /**
     * Render the header with SOP mode buttons
     */
    private renderHeader(container: HTMLElement): void {
        const header = container.createDiv('tl-header');
        const title = header.createDiv('tl-title');
        const iconSpan = title.createSpan('tl-title-icon');
        iconSpan.innerHTML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="tideGrad" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="hsl(200,70%,55%)"/><stop offset="100%" stop-color="hsl(230,55%,50%)"/></linearGradient></defs>
<circle cx="12" cy="12" r="10" fill="url(#tideGrad)" opacity="0.1"/>
<path d="M3 14 Q6 10 9 14 Q12 18 15 14 Q18 10 21 14" fill="none" stroke="url(#tideGrad)" stroke-width="2" stroke-linecap="round"/>
<path d="M3 18 Q6 14 9 18 Q12 22 15 18 Q18 14 21 18" fill="none" stroke="url(#tideGrad)" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
<circle cx="12" cy="7" r="3" fill="url(#tideGrad)" opacity="0.6"/>
<path d="M9.5 7 Q12 3 14.5 7" fill="none" stroke="url(#tideGrad)" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;
        title.createSpan({ text: 'TideLog「潮记」' });
    }

    /**
     * Render SOP buttons inside the chat panel only
     */
    private renderSOPButtons(container: HTMLElement): void {
        const buttons = container.createDiv('tl-header-buttons');

        const morningBtn = buttons.createEl('button', {
            cls: 'tl-mode-btn',
            attr: { 'aria-label': 'Plan：规划今日' },
        });
        setIcon(morningBtn, 'sun');
        morningBtn.createSpan({ text: 'Plan' });
        morningBtn.addEventListener('click', () => this.startSOP('morning'));

        const eveningBtn = buttons.createEl('button', {
            cls: 'tl-mode-btn',
            attr: { 'aria-label': 'Review：回顾今天' },
        });
        setIcon(eveningBtn, 'moon');
        eveningBtn.createSpan({ text: 'Review' });
        eveningBtn.addEventListener('click', () => this.startSOP('evening'));

        const insightBtn = buttons.createEl('button', {
            cls: 'tl-mode-btn',
            attr: { 'aria-label': 'TideLog Talk：自由对话' },
        });
        setIcon(insightBtn, 'lightbulb');
        insightBtn.createSpan({ text: 'Insight' });
        insightBtn.addEventListener('click', () => this.startFreeChat());
    }

    // =========================================================================
    // Tab bar
    // =========================================================================

    private renderTabBar(container: HTMLElement): void {
        const tabBarWrap = container.createDiv('tl-tab-bar-wrap');
        this.tabBarEl = tabBarWrap.createDiv('tl-tab-bar');

        const tabs: { id: SidebarTab; icon: string; label: string }[] = [
            { id: 'chat', icon: '💬', label: 'TideLog Talk' },
            { id: 'kanban', icon: '📅', label: '计划' },
            { id: 'review', icon: '📊', label: '仪表盘' },
        ];

        for (const tab of tabs) {
            const btn = this.tabBarEl.createEl('button', {
                cls: `tl-tab-btn ${tab.id === this.activeTab ? 'tl-tab-btn-active' : ''}`,
                attr: { 'data-tab': tab.id },
            });
            btn.createEl('span', { cls: 'tl-tab-btn-icon', text: tab.icon });
            btn.createEl('span', { cls: 'tl-tab-btn-label', text: tab.label });
            btn.addEventListener('click', () => this.switchTab(tab.id, true));
        }
    }

    public switchTab(tab: SidebarTab, animate = false): void {
        this.activeTab = tab;

        // Update tab bar active state
        this.tabBarEl.querySelectorAll('.tl-tab-btn').forEach(btn => {
            btn.removeClass('tl-tab-btn-active');
            if (btn.getAttribute('data-tab') === tab) {
                btn.addClass('tl-tab-btn-active');
            }
        });

        if (tab === 'chat') {
            this.chatPanel.style.display = '';
            // Remove non-chat panels
            this.tabContentEl.querySelectorAll('.tl-tab-panel:not(.tl-tab-panel-chat)').forEach(el => el.remove());
        } else {
            this.chatPanel.style.display = 'none';
            // Build new panel first, THEN remove old to avoid white flash
            const panel = this.tabContentEl.createDiv('tl-tab-panel');
            if (animate) panel.addClass('tl-tab-panel-animate');
            const renderDone = (tab === 'kanban')
                ? this.renderKanbanTab(panel)
                : this.renderReviewTab(panel);
            renderDone.then(() => {
                // Remove stale panels (keep the new one and chat)
                this.tabContentEl.querySelectorAll('.tl-tab-panel:not(.tl-tab-panel-chat)').forEach(el => {
                    if (el !== panel) el.remove();
                });
            });
        }
    }

    // =========================================================================
    // Shared helpers for task parsing / toggling
    // =========================================================================

    /**
     * Parse markdown content into structured items.
     * Filters out empty/placeholder items (e.g. "第一周：" with no content).
     */
    public parseMdTasks(content: string): { text: string; done: boolean; isTask: boolean; section: string; indent: number }[] {
        const items: { text: string; done: boolean; isTask: boolean; section: string; indent: number }[] = [];
        let section = '';
        const isSubstantive = (t: string) => {
            const stripped = t.replace(/[：:]/g, '').trim();
            if (stripped.length < 2) return false;
            if (/^第.{1,2}周$/.test(stripped)) return false;
            return true;
        };
        const calcIndent = (ws: string): number => {
            const tabs = (ws.match(/\t/g) || []).length;
            const spaces = ws.replace(/\t/g, '').length;
            return tabs + Math.floor(spaces / 2);
        };
        for (const line of content.split('\n')) {
            if (line.startsWith('## ') || line.startsWith('### ')) {
                section = line.replace(/^#{2,3}\s+/, '').trim();
                continue;
            }
            const taskM = line.match(/^(\s*)- \[([ x])\] (.+)$/);
            if (taskM) {
                const txt = taskM[3].trim();
                if (isSubstantive(txt)) {
                    items.push({ text: txt, done: taskM[2] === 'x', isTask: true, section, indent: calcIndent(taskM[1]) });
                }
                continue;
            }
            const numM = line.match(/^(\s*)\d+\.\s+(.+)$/);
            if (numM && numM[2].trim() && isSubstantive(numM[2].trim())) {
                let numText = numM[2].trim();
                // Handle numbered items with checkbox markers: 1. [x] text / 1. [ ] text
                const numTaskM = numText.match(/^\[([ x])\]\s*(.+)$/);
                if (numTaskM) {
                    items.push({ text: numTaskM[2].trim(), done: numTaskM[1] === 'x', isTask: true, section, indent: calcIndent(numM[1]) });
                } else {
                    items.push({ text: numText, done: false, isTask: false, section, indent: calcIndent(numM[1]) });
                }
                continue;
            }
            const bulletM = line.match(/^(\s*)- (.+)$/);
            if (bulletM && bulletM[2].trim() && isSubstantive(bulletM[2].trim())) {
                const txt = bulletM[2].trim();
                // Skip empty/near-empty checkboxes that slipped past the task regex
                if (/^\[[\sx]?\]/.test(txt)) continue;
                items.push({ text: txt, done: false, isTask: false, section, indent: calcIndent(bulletM[1]) });
            }
        }
        return items;
    }

    public async toggleMdTask(file: TFile, taskText: string, wasDone: boolean): Promise<void> {
        this._suppressRefresh = true;
        try {
            let content = await this.app.vault.read(file);
            const escaped = taskText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const oldMark = wasDone ? 'x' : ' ';
            const newMark = wasDone ? ' ' : 'x';
            // Support indented tasks (leading whitespace)
            const pat = new RegExp(`^(\\s*)- \\[${oldMark}\\] ${escaped}$`, 'm');
            const match = content.match(pat);
            if (match) {
                content = content.replace(pat, `${match[1]}- [${newMark}] ${taskText}`);
            } else {
                // Try matching numbered list item and convert to checkbox
                const numPat = new RegExp(`^(\\s*)\\d+\\.\\s+${escaped}$`, 'm');
                const numMatch = content.match(numPat);
                if (numMatch) {
                    content = content.replace(numPat, `${numMatch[1]}- [${newMark}] ${taskText}`);
                } else {
                    // Try matching plain bullet and convert to checkbox
                    const bulletPat = new RegExp(`^(\\s*)- ${escaped}$`, 'm');
                    const bulletMatch = content.match(bulletPat);
                    if (bulletMatch) {
                        content = content.replace(bulletPat, `${bulletMatch[1]}- [${newMark}] ${taskText}`);
                    }
                }
            }
            await this.app.vault.modify(file, content);
        } finally {
            // Delay clearing the flag so the vault 'modify' event (async) is suppressed
            setTimeout(() => { this._suppressRefresh = false; }, 200);
        }
    }

    /**
     * Extract emotion/energy scores from a daily note's body content.
     * Checks:
     *   1. **精力状态**: N/10  (morning energy)
     *   2. ### 开心事与情绪 section → first number on subsequent lines (evening emotion)
     *   3. YAML frontmatter emotion_score (fallback for legacy notes)
     * Returns the best available score (1-10), or null.
     */
    public parseNoteScores(content: string): number | null {
        // 1. Try evening emotion section: "## 开心事与情绪" or "### 开心事与情绪" followed by a number
        const emotionSectionMatch = content.match(/#{2,3}\s*开心事与情绪[\s\S]*?\n\s*(\d+)/m);
        if (emotionSectionMatch) {
            const v = parseInt(emotionSectionMatch[1], 10);
            if (v >= 1 && v <= 10) return v;
        }

        // 2. Try morning energy: "**精力状态**: N/10"
        const energyMatch = content.match(/\*\*精力状态\*\*[：:]\s*(\d+)/);
        if (energyMatch) {
            const v = parseInt(energyMatch[1], 10);
            if (v >= 1 && v <= 10) return v;
        }

        // 3. Fallback: YAML frontmatter emotion_score
        if (content.startsWith('---')) {
            const end = content.indexOf('---', 3);
            if (end > 0) {
                const fm = content.substring(4, end);
                const em = fm.match(/emotion_score:\s*(\d+)/);
                if (em) return parseInt(em[1], 10);
            }
        }

        return null;
    }

    // =========================================================================
    // Kanban tab — delegated to PeriodicRenderer
    // =========================================================================

    private async renderKanbanTab(panel: HTMLElement): Promise<void> {
        await this.periodicRenderer.render(panel);
    }

    /**
     * Invalidate a cached tab panel so the next switchTab re-renders fresh.
     * Used by KanbanRenderer nav buttons to force re-render on navigation.
     */
    public invalidateTabCache(_tab: string): void {
        // Simple implementation: force re-render by switching tab
        // The tab content is always re-created by switchTab
    }

    // =========================================================================
    // Review tab — delegated to ReviewRenderer
    // =========================================================================

    private async renderReviewTab(panel: HTMLElement): Promise<void> {
        await this.reviewRenderer.render(panel);
    }

    /**
     * Render the input area
     */
    private renderInputArea(container: HTMLElement): void {
        this.inputContainer = container.createDiv('tl-input-container');

        this.inputEl = this.inputContainer.createEl('textarea', {
            cls: 'tl-input',
            attr: {
                placeholder: '输入你的想法...',
                rows: '3',
            },
        });

        // Handle Enter key (Shift+Enter for new line)
        this.inputEl.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                await this.sendMessage();
            }
        });

        // Auto-resize
        this.inputEl.addEventListener('input', () => {
            this.inputEl.style.height = 'auto';
            this.inputEl.style.height = `${Math.min(this.inputEl.scrollHeight, 150)}px`;
        });

        const buttonContainer = this.inputContainer.createDiv('tl-input-buttons');

        this.sendButton = buttonContainer.createEl('button', {
            cls: 'tl-send-btn',
            text: '发送',
        });
        this.sendButton.addEventListener('click', () => this.sendMessage());
    }

    /**
     * Show welcome message
     */
    private showWelcomeMessage(): void {
        this.addAIMessage(`你好 👋

我是你的 AI 教练，帮助你建立持续成长的习惯。

**☀️ Plan** — 对标计划，规划今日任务
**🌙 Review** — 回顾一天，记录成就与情绪
**💡 Insight** — 洞察分析，生成报告

点击上方按钮开始，或直接输入你的想法。`);
    }

    /**
     * Start SOP workflow
     */
    startSOP(type: SOPType): void {
        this.sopContext = {
            type,
            currentStep: 0,
            responses: {},
        };

        // Clear messages and hide task input if visible
        this.messages = [];
        this.messagesContainer.empty();
        this.hideTaskInput();

        if (type === 'morning') {
            this.startMorningSOP();
        } else if (type === 'evening') {
            this.startEveningSOP();
        }
    }

    /**
     * Start morning SOP
     */
    async startMorningSOP(): Promise<void> {
        // Check if today's plan already exists
        try {
            const dailyNotePath = this.plugin.vaultManager.getDailyNotePath();
            const file = this.app.vault.getAbstractFileByPath(dailyNotePath);
            if (file) {
                const content = await this.app.vault.read(file as any);
                if (content.includes('精力状态')) {
                    // Plan already exists, go straight to task input with pre-fill
                    const existingTasks = await this.getExistingTasks();
                    if (existingTasks.length > 0) {
                        this.addAIMessage('今天已有晨间计划。你可以修改或添加任务：');
                    } else {
                        this.addAIMessage('今天已有晨间计划。你可以继续添加任务：');
                    }
                    this.quickUpdateMode = true;
                    this.showTaskInput(existingTasks.length > 0 ? existingTasks : undefined);
                    return;
                }
            }
        } catch (e) {
            // If check fails, just proceed with full SOP
        }

        this.addAIMessage('开始晨间复盘...');
        await this.morningSOP.start(this.sopContext, (message) => {
            this.addAIMessage(message);
        });
    }

    /**
     * Start evening SOP
     */
    async startEveningSOP(): Promise<void> {
        this.addAIMessage('开始晚间复盘...');
        await this.eveningSOP.start(this.sopContext, (message) => {
            this.addAIMessage(message);
        });
    }

    /**
     * Start free chat mode
     */
    private startFreeChat(): void {
        this.sopContext = {
            type: 'none',
            currentStep: 0,
            responses: {},
        };

        this.messages = [];
        this.messagesContainer.empty();
        this.hideTaskInput();

        const messageEl = this.createMessageElement('ai');
        const contentDiv = messageEl.createDiv();
        MarkdownRenderer.render(
            this.app,
            `自由对话模式 💬

聊什么都可以 — 遇到的问题、想梳理的想法、想讨论的话题。

也可以用下方按钮生成洞察报告：`,
            contentDiv,
            '',
            this
        );

        // Insight generation buttons
        const btnGroup = messageEl.createDiv('tl-insight-buttons');

        const weeklyBtn = btnGroup.createEl('button', {
            cls: 'tl-insight-btn',
            text: '📊 本周洞察',
        });
        weeklyBtn.addEventListener('click', () => this.triggerInsight('weekly'));

        const monthlyBtn = btnGroup.createEl('button', {
            cls: 'tl-insight-btn',
            text: '📈 本月洞察',
        });
        monthlyBtn.addEventListener('click', () => this.triggerInsight('monthly'));

        const profileBtn = btnGroup.createEl('button', {
            cls: 'tl-insight-btn',
            text: '👤 画像建议',
        });
        profileBtn.addEventListener('click', () => this.triggerProfileSuggestion());

        this.scrollToBottom();
    }

    // =========================================================================
    // Task input — delegated to TaskInputManager
    // =========================================================================

    showTaskInput(prefillTasks?: { text: string; subtasks: string[] }[]): void {
        this.taskInputManager.showTaskInput(prefillTasks);
    }

    hideTaskInput(): void {
        this.taskInputManager.hideTaskInput();
    }

    async startQuickPlanUpdate(): Promise<void> {
        await this.taskInputManager.startQuickPlanUpdate();
    }

    async getExistingTasks(): Promise<{ text: string; subtasks: string[] }[]> {
        return this.taskInputManager.getExistingTasks();
    }

    // =========================================================================
    // Message handling — delegated to ChatController
    // =========================================================================

    private async sendMessage(): Promise<void> {
        await this.chatController.sendMessage();
    }

    // =========================================================================
    // Message rendering (stays in ChatView — core UI)
    // =========================================================================

    /**
     * Add a user message to the UI
     */
    addUserMessage(content: string): void {
        const messageEl = this.createMessageElement('user');
        messageEl.setText(content);
        this.scrollToBottom();
    }

    /**
     * Add an AI message to the UI
     */
    addAIMessage(content: string): void {
        const messageEl = this.createMessageElement('ai');
        MarkdownRenderer.render(this.app, content, messageEl, '', this);
        this.scrollToBottom();
    }

    /**
     * Stream an AI message (for SOP responses)
     */
    streamAIMessage(content: string): void {
        const messageEl = this.createMessageElement('ai');
        let currentIndex = 0;

        const typewriter = setInterval(() => {
            if (currentIndex < content.length) {
                currentIndex = Math.min(currentIndex + 3, content.length);
                messageEl.empty();
                MarkdownRenderer.render(this.app, content.substring(0, currentIndex), messageEl, '', this);
                this.scrollToBottom();
            } else {
                clearInterval(typewriter);
            }
        }, 15);
    }

    /**
     * Create a message element
     */
    createMessageElement(type: 'user' | 'ai'): HTMLElement {
        const wrapper = this.messagesContainer.createDiv(
            `tl-message tl-message-${type}`
        );

        const avatar = wrapper.createDiv('tl-message-avatar');
        if (type === 'user') {
            // User avatar — person silhouette with subtle wave
            avatar.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor">
<circle cx="12" cy="8" r="4"/>
<path d="M5 20 Q5 14 12 14 Q19 14 19 20z" opacity="0.7"/>
<path d="M3 22 Q7 19 12 22 Q17 19 21 22" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.4"/>
</svg>`;
        } else {
            // AI avatar — wave circle
            avatar.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
<circle cx="12" cy="12" r="9" stroke-width="1.8"/>
<path d="M5 12 Q8 8 11 12 Q14 16 17 12 Q19 10 20 11"/>
<path d="M5 16 Q8 12 11 16 Q14 20 17 16" opacity="0.4"/>
</svg>`;
        }

        const content = wrapper.createDiv('tl-message-content');

        return content;
    }

    /**
     * Scroll to bottom of messages
     */
    scrollToBottom(): void {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    // =========================================================================
    // Insight Generation — delegated to ChatController
    // =========================================================================

    /**
     * Trigger insight generation (public, called from main.ts)
     */
    triggerInsight(type: 'weekly' | 'monthly'): void {
        this.chatController.triggerInsight(type);
    }

    /**
     * Trigger profile suggestion generation
     */
    private triggerProfileSuggestion(): void {
        this.chatController.triggerProfileSuggestion();
    }

}
