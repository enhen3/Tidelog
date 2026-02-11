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

import AIFlowManagerPlugin from '../main';
import { ChatMessage, SOPContext, SOPType } from '../types';
import { MorningSOP } from '../sop/morning-sop';
import { EveningSOP } from '../sop/evening-sop';
import { KanbanRenderer } from './kanban-renderer';
import { ReviewRenderer } from './review-renderer';
import { TaskInputManager } from './task-input-manager';
import { ChatController } from './chat-controller';

type SidebarTab = 'chat' | 'kanban' | 'review';

export const CHAT_VIEW_TYPE = 'ai-flow-chat-view';

export class ChatView extends ItemView {
    public plugin: AIFlowManagerPlugin;
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

    // Live refresh
    private vaultModifyRef: ReturnType<typeof this.app.vault.on> | null = null;
    private refreshTimer: ReturnType<typeof setTimeout> | null = null;
    private _suppressRefresh = false;

    private morningSOP!: MorningSOP;
    private eveningSOP!: EveningSOP;
    private kanbanRenderer!: KanbanRenderer;
    private reviewRenderer!: ReviewRenderer;
    private taskInputManager!: TaskInputManager;
    private chatController!: ChatController;

    constructor(leaf: WorkspaceLeaf, plugin: AIFlowManagerPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.morningSOP = new MorningSOP(plugin);
        this.eveningSOP = new EveningSOP(plugin);
        this.kanbanRenderer = new KanbanRenderer(this);
        this.reviewRenderer = new ReviewRenderer(this);
        this.taskInputManager = new TaskInputManager(this);
        this.chatController = new ChatController(this);
    }

    getViewType(): string {
        return CHAT_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Dailot「小舵」';
    }

    getIcon(): string {
        return 'dailot-helm';
    }

    async onOpen(): Promise<void> {
        console.log('[Dailot] ChatView.onOpen() called');
        const container = this.contentEl;
        container.empty();
        container.addClass('ai-flow-chat-container');

        // Header (title only)
        this.renderHeader(container);

        // Tab bar
        this.renderTabBar(container);

        // Tab content area
        this.tabContentEl = container.createDiv('af-tab-content');

        // Chat panel (SOP buttons + messages + input)
        this.chatPanel = this.tabContentEl.createDiv('af-tab-panel af-tab-panel-chat');
        this.renderSOPButtons(this.chatPanel);
        this.messagesContainer = this.chatPanel.createDiv('ai-flow-messages');
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
        const header = container.createDiv('ai-flow-header');
        const title = header.createDiv('ai-flow-title');
        const iconSpan = title.createSpan('ai-flow-title-icon');
        iconSpan.innerHTML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="helmGrad" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="hsl(220,55%,55%)"/><stop offset="100%" stop-color="hsl(260,45%,50%)"/></linearGradient></defs>
<circle cx="12" cy="12" r="9.5" fill="url(#helmGrad)" opacity="0.12"/>
<circle cx="12" cy="12" r="7" fill="none" stroke="url(#helmGrad)" stroke-width="2.2"/>
<circle cx="12" cy="12" r="2.8" fill="url(#helmGrad)" opacity="0.35"/>
<circle cx="12" cy="12" r="2.8" fill="none" stroke="url(#helmGrad)" stroke-width="1.6"/>
<line x1="12" y1="5" x2="12" y2="1.2" stroke="url(#helmGrad)" stroke-width="1.8" stroke-linecap="round"/>
<line x1="12" y1="19" x2="12" y2="22.8" stroke="url(#helmGrad)" stroke-width="1.8" stroke-linecap="round"/>
<line x1="5" y1="12" x2="1.2" y2="12" stroke="url(#helmGrad)" stroke-width="1.8" stroke-linecap="round"/>
<line x1="19" y1="12" x2="22.8" y2="12" stroke="url(#helmGrad)" stroke-width="1.8" stroke-linecap="round"/>
<line x1="7.05" y1="7.05" x2="4.2" y2="4.2" stroke="url(#helmGrad)" stroke-width="1.8" stroke-linecap="round"/>
<line x1="16.95" y1="16.95" x2="19.8" y2="19.8" stroke="url(#helmGrad)" stroke-width="1.8" stroke-linecap="round"/>
<line x1="7.05" y1="16.95" x2="4.2" y2="19.8" stroke="url(#helmGrad)" stroke-width="1.8" stroke-linecap="round"/>
<line x1="16.95" y1="7.05" x2="19.8" y2="4.2" stroke="url(#helmGrad)" stroke-width="1.8" stroke-linecap="round"/>
<circle cx="12" cy="1.2" r="1.3" fill="url(#helmGrad)"/><circle cx="12" cy="22.8" r="1.3" fill="url(#helmGrad)"/>
<circle cx="1.2" cy="12" r="1.3" fill="url(#helmGrad)"/><circle cx="22.8" cy="12" r="1.3" fill="url(#helmGrad)"/>
<circle cx="4.2" cy="4.2" r="1.3" fill="url(#helmGrad)"/><circle cx="19.8" cy="19.8" r="1.3" fill="url(#helmGrad)"/>
<circle cx="4.2" cy="19.8" r="1.3" fill="url(#helmGrad)"/><circle cx="19.8" cy="4.2" r="1.3" fill="url(#helmGrad)"/>
</svg>`;
        title.createSpan({ text: 'Dailot「小舵」' });
    }

    /**
     * Render SOP buttons inside the chat panel only
     */
    private renderSOPButtons(container: HTMLElement): void {
        const buttons = container.createDiv('ai-flow-header-buttons');

        const morningBtn = buttons.createEl('button', {
            cls: 'ai-flow-mode-btn',
            attr: { 'aria-label': 'Plan：规划今日' },
        });
        setIcon(morningBtn, 'sun');
        morningBtn.createSpan({ text: 'Plan' });
        morningBtn.addEventListener('click', () => this.startSOP('morning'));

        const eveningBtn = buttons.createEl('button', {
            cls: 'ai-flow-mode-btn',
            attr: { 'aria-label': 'Review：回顾今天' },
        });
        setIcon(eveningBtn, 'moon');
        eveningBtn.createSpan({ text: 'Review' });
        eveningBtn.addEventListener('click', () => this.startSOP('evening'));

        const insightBtn = buttons.createEl('button', {
            cls: 'ai-flow-mode-btn',
            attr: { 'aria-label': 'Dailot Talk：自由对话' },
        });
        setIcon(insightBtn, 'lightbulb');
        insightBtn.createSpan({ text: 'Insight' });
        insightBtn.addEventListener('click', () => this.startFreeChat());
    }

    // =========================================================================
    // Tab bar
    // =========================================================================

    private renderTabBar(container: HTMLElement): void {
        const tabBarWrap = container.createDiv('af-tab-bar-wrap');
        this.tabBarEl = tabBarWrap.createDiv('af-tab-bar');

        const tabs: { id: SidebarTab; icon: string; label: string }[] = [
            { id: 'chat', icon: '💬', label: 'Dailot Talk' },
            { id: 'kanban', icon: '📋', label: '目标' },
            { id: 'review', icon: '📊', label: '仪表盘' },
        ];

        for (const tab of tabs) {
            const btn = this.tabBarEl.createEl('button', {
                cls: `af-tab-btn ${tab.id === this.activeTab ? 'af-tab-btn-active' : ''}`,
                attr: { 'data-tab': tab.id },
            });
            btn.createEl('span', { cls: 'af-tab-btn-icon', text: tab.icon });
            btn.createEl('span', { cls: 'af-tab-btn-label', text: tab.label });
            btn.addEventListener('click', () => this.switchTab(tab.id, true));
        }
    }

    public switchTab(tab: SidebarTab, animate = false): void {
        this.activeTab = tab;

        // Update tab bar active state
        this.tabBarEl.querySelectorAll('.af-tab-btn').forEach(btn => {
            btn.removeClass('af-tab-btn-active');
            if (btn.getAttribute('data-tab') === tab) {
                btn.addClass('af-tab-btn-active');
            }
        });

        if (tab === 'chat') {
            this.chatPanel.style.display = '';
            // Remove non-chat panels
            this.tabContentEl.querySelectorAll('.af-tab-panel:not(.af-tab-panel-chat)').forEach(el => el.remove());
        } else {
            this.chatPanel.style.display = 'none';
            // Build new panel first, THEN remove old to avoid white flash
            const panel = this.tabContentEl.createDiv('af-tab-panel');
            if (animate) panel.addClass('af-tab-panel-animate');
            const renderDone = (tab === 'kanban')
                ? this.renderKanbanTab(panel)
                : this.renderReviewTab(panel);
            renderDone.then(() => {
                // Remove stale panels (keep the new one and chat)
                this.tabContentEl.querySelectorAll('.af-tab-panel:not(.af-tab-panel-chat)').forEach(el => {
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
    // Kanban tab — delegated to KanbanRenderer
    // =========================================================================

    private async renderKanbanTab(panel: HTMLElement): Promise<void> {
        await this.kanbanRenderer.render(panel);
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
        this.inputContainer = container.createDiv('ai-flow-input-container');

        this.inputEl = this.inputContainer.createEl('textarea', {
            cls: 'ai-flow-input',
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

        const buttonContainer = this.inputContainer.createDiv('ai-flow-input-buttons');

        this.sendButton = buttonContainer.createEl('button', {
            cls: 'ai-flow-send-btn',
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
        const btnGroup = messageEl.createDiv('ai-flow-insight-buttons');

        const weeklyBtn = btnGroup.createEl('button', {
            cls: 'ai-flow-insight-btn',
            text: '📊 本周洞察',
        });
        weeklyBtn.addEventListener('click', () => this.triggerInsight('weekly'));

        const monthlyBtn = btnGroup.createEl('button', {
            cls: 'ai-flow-insight-btn',
            text: '📈 本月洞察',
        });
        monthlyBtn.addEventListener('click', () => this.triggerInsight('monthly'));

        const profileBtn = btnGroup.createEl('button', {
            cls: 'ai-flow-insight-btn',
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
            `ai-flow-message ai-flow-message-${type}`
        );

        const avatar = wrapper.createDiv('ai-flow-message-avatar');
        if (type === 'user') {
            // Naval officer peaked cap — white dome, visor band, anchor badge
            avatar.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor">
<ellipse cx="12" cy="17" rx="9.5" ry="2.5" opacity="0.4"/>
<ellipse cx="12" cy="15.5" rx="9" ry="1.5" opacity="0.9"/>
<path d="M5.5 15c0-2.5 1-4 2.5-5s3-1.5 4-1.5 2.5.5 4 1.5 2.5 2.5 2.5 5z"/>
<circle cx="12" cy="12" r="1.8" fill="var(--af-accent,hsl(260,50%,55%))"/>
<line x1="12" y1="10.5" x2="12" y2="14" stroke="var(--af-accent,hsl(260,50%,55%))" stroke-width="0.7"/>
<path d="M10.5 13c.4.5 1 .8 1.5.8s1.1-.3 1.5-.8" stroke="var(--af-accent,hsl(260,50%,55%))" stroke-width="0.5" fill="none"/>
</svg>`;
        } else {
            // Ship's wheel — same style as header helm
            avatar.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2.5"/><circle cx="12" cy="12" r="6.5" stroke-width="1.8"/><line x1="12" y1="5.5" x2="12" y2="2"/><circle cx="12" cy="2" r="1" fill="currentColor" stroke="none"/><line x1="12" y1="18.5" x2="12" y2="22"/><circle cx="12" cy="22" r="1" fill="currentColor" stroke="none"/><line x1="5.5" y1="12" x2="2" y2="12"/><circle cx="2" cy="12" r="1" fill="currentColor" stroke="none"/><line x1="18.5" y1="12" x2="22" y2="12"/><circle cx="22" cy="12" r="1" fill="currentColor" stroke="none"/><line x1="7.4" y1="7.4" x2="4.9" y2="4.9"/><circle cx="4.9" cy="4.9" r="1" fill="currentColor" stroke="none"/><line x1="16.6" y1="16.6" x2="19.1" y2="19.1"/><circle cx="19.1" cy="19.1" r="1" fill="currentColor" stroke="none"/><line x1="7.4" y1="16.6" x2="4.9" y2="19.1"/><circle cx="4.9" cy="19.1" r="1" fill="currentColor" stroke="none"/><line x1="16.6" y1="7.4" x2="19.1" y2="4.9"/><circle cx="19.1" cy="4.9" r="1" fill="currentColor" stroke="none"/></svg>`;
        }

        const content = wrapper.createDiv('ai-flow-message-content');

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
