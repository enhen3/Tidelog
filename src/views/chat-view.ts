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
import { t, getLanguage } from '../i18n';
import { ChatMessage, SOPContext, SOPType } from '../types';
import { MorningSOP } from '../sop/morning-sop';
import { EveningSOP } from '../sop/evening-sop';
import { PeriodicRenderer, PeriodicMode } from './periodic-renderer';
import { ReviewRenderer } from './review-renderer';
import { TaskInputManager } from './task-input-manager';
import { ChatController } from './chat-controller';
import { ProModal } from './pro-modal';

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

    public morningSOP!: MorningSOP;
    public eveningSOP!: EveningSOP;
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
        return 'TideLog';
    }

    getIcon(): string {
        return 'tidelog-wave';
    }

    async onOpen(): Promise<void> {
        const container = this.contentEl;
        container.empty();
        container.addClass('tl-chat-container');

        // Tab bar (top-level navigation — no header)
        this.renderTabBar(container);

        // Tab content area
        this.tabContentEl = container.createDiv('tl-tab-content');

        // Chat panel (SOP buttons + messages + input)
        this.chatPanel = this.tabContentEl.createDiv('tl-tab-panel tl-tab-panel-chat');
        this.renderSOPButtons(this.chatPanel);
        this.messagesContainer = this.chatPanel.createDiv('tl-messages');
        this.renderInputArea(this.chatPanel);
        this.showWelcomeMessage();

        // Switch to Plan tab by default
        this.switchTab('kanban');

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
        setIcon(iconSpan, 'tidelog-wave');
        title.createSpan({ text: 'TideLog' });
    }

    /**
     * Render SOP buttons inside the chat panel only
     */
    private renderSOPButtons(container: HTMLElement): void {
        const buttons = container.createDiv('tl-header-buttons');

        const eveningBtn = buttons.createEl('button', {
            cls: 'tl-mode-btn tl-mode-btn-review',
        });
        setIcon(eveningBtn, 'moon');
        eveningBtn.createSpan({ text: 'Review' });
        eveningBtn.addEventListener('click', () => this.startSOP('evening'));

        const insightBtn = buttons.createEl('button', {
            cls: 'tl-mode-btn tl-mode-btn-insight',
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

        const tabs: { id: SidebarTab; emoji: string; label: string }[] = [
            { id: 'kanban', emoji: '☀️', label: 'Plan' },
            { id: 'chat', emoji: '🌙', label: 'Review' },
            { id: 'review', emoji: '🌓', label: 'Insights' },
        ];

        for (const tab of tabs) {
            const btn = this.tabBarEl.createEl('button', {
                cls: `tl-tab-btn ${tab.id === this.activeTab ? 'tl-tab-btn-active' : ''}`,
                attr: { 'data-tab': tab.id },
            });
            btn.createEl('span', { cls: 'tl-tab-btn-icon', text: tab.emoji });
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
            this.chatPanel.removeClass('tl-hidden');
            // Remove non-chat panels
            this.tabContentEl.querySelectorAll('.tl-tab-panel:not(.tl-tab-panel-chat)').forEach(el => el.remove());
        } else {
            this.chatPanel.addClass('tl-hidden');
            // Build new panel first, THEN remove old to avoid white flash
            const panel = this.tabContentEl.createDiv('tl-tab-panel');
            if (animate) panel.addClass('tl-tab-panel-animate');
            const renderDone = (tab === 'kanban')
                ? this.renderKanbanTab(panel)
                : this.renderReviewTab(panel);
            void renderDone.then(() => {
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
     * Append a new task to a markdown file.
     * Inserts after the last existing task line, or at the end.
     */
    public async addMdTask(file: TFile, taskText: string, indent = 0): Promise<void> {
        this._suppressRefresh = true;
        try {
            let content = await this.app.vault.read(file);
            const prefix = '  '.repeat(indent);
            const newLine = `${prefix}- [ ] ${taskText}`;
            const lines = content.split('\n');

            // Find the last task line index
            let lastTaskIdx = -1;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].match(/^\s*- \[[ x]\] /)) {
                    lastTaskIdx = i;
                }
            }

            if (lastTaskIdx >= 0) {
                lines.splice(lastTaskIdx + 1, 0, newLine);
            } else {
                lines.push(newLine);
            }

            await this.app.vault.modify(file, lines.join('\n'));
        } finally {
            setTimeout(() => { this._suppressRefresh = false; }, 200);
        }
    }

    /** Insert a sub-task (indented) directly after a parent task */
    public async addSubTask(file: TFile, parentText: string, subTaskText: string): Promise<void> {
        this._suppressRefresh = true;
        try {
            const content = await this.app.vault.read(file);
            const lines = content.split('\n');
            const escaped = parentText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pat = new RegExp(`^(\\s*- \\[[ x]\\] )${escaped}$`);
            let parentIdx = -1;
            for (let i = 0; i < lines.length; i++) {
                if (pat.test(lines[i])) { parentIdx = i; break; }
            }
            if (parentIdx >= 0) {
                lines.splice(parentIdx + 1, 0, `  - [ ] ${subTaskText}`);
                await this.app.vault.modify(file, lines.join('\n'));
            }
        } finally {
            setTimeout(() => { this._suppressRefresh = false; }, 200);
        }
    }

    /** Edit a task's text in a markdown file */
    public async editMdTask(file: TFile, oldText: string, newText: string): Promise<void> {
        this._suppressRefresh = true;
        try {
            let content = await this.app.vault.read(file);
            const escaped = oldText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pat = new RegExp(`^(\\s*- \\[[ x]\\] )${escaped}$`, 'm');
            content = content.replace(pat, `$1${newText}`);
            await this.app.vault.modify(file, content);
        } finally {
            setTimeout(() => { this._suppressRefresh = false; }, 200);
        }
    }

    /** Delete a task line from a markdown file */
    public async deleteMdTask(file: TFile, taskText: string): Promise<void> {
        this._suppressRefresh = true;
        try {
            let content = await this.app.vault.read(file);
            const escaped = taskText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pat = new RegExp(`^\\s*- \\[[ x]\\] ${escaped}\\n?`, 'm');
            content = content.replace(pat, '');
            await this.app.vault.modify(file, content);
        } finally {
            setTimeout(() => { this._suppressRefresh = false; }, 200);
        }
    }

    /** Defer a task from a source file to today's daily note */
    public async deferTaskToToday(sourceFile: TFile, taskText: string): Promise<void> {
        this._suppressRefresh = true;
        try {
            // Get or create today's daily note
            const todayNote = await this.plugin.vaultManager.getOrCreateDailyNote();

            // Add the task to today's note
            await this.addMdTask(todayNote, taskText);

            // Remove from source file
            let content = await this.app.vault.read(sourceFile);
            const escaped = taskText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pat = new RegExp(`^\\s*- \\[[ x]\\] ${escaped}\\n?`, 'm');
            content = content.replace(pat, '');
            await this.app.vault.modify(sourceFile, content);

            // Refresh the view
            this.invalidateTabCache('kanban');
            this.switchTab('kanban');
        } finally {
            setTimeout(() => { this._suppressRefresh = false; }, 200);
        }
    }

    /** Move a task from a source file to a specific target date's daily note */
    public async moveTaskToDate(sourceFile: TFile, taskText: string, targetDate: Date): Promise<void> {
        this._suppressRefresh = true;
        try {
            const targetNote = await this.plugin.vaultManager.getOrCreateDailyNote(targetDate);

            // Don't move if source and target are the same file
            if (sourceFile.path === targetNote.path) return;

            await this.addMdTask(targetNote, taskText);

            // Remove from source file
            let content = await this.app.vault.read(sourceFile);
            const escaped = taskText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pat = new RegExp(`^\\s*- \\[[ x]\\] ${escaped}\\n?`, 'm');
            content = content.replace(pat, '');
            await this.app.vault.modify(sourceFile, content);

            this.invalidateTabCache('kanban');
            this.switchTab('kanban');
        } finally {
            setTimeout(() => { this._suppressRefresh = false; }, 200);
        }
    }

    /** Change the indent level of a task (promote/demote) */
    public async setTaskIndent(file: TFile, taskText: string, newIndent: number): Promise<void> {
        this._suppressRefresh = true;
        try {
            const content = await this.app.vault.read(file);
            const lines = content.split('\n');
            const escaped = taskText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pat = new RegExp(`^(\\s*)- (\\[[ x]\\] )${escaped}$`);
            const indent = Math.max(0, newIndent);
            const prefix = '  '.repeat(indent);
            for (let i = 0; i < lines.length; i++) {
                if (pat.test(lines[i])) {
                    const m = lines[i].match(pat);
                    if (m) {
                        lines[i] = `${prefix}- ${m[2]}${taskText}`;
                        break;
                    }
                }
            }
            await this.app.vault.modify(file, lines.join('\n'));
        } finally {
            setTimeout(() => { this._suppressRefresh = false; }, 200);
        }
    }

    /** Reorder all task lines in a markdown file by the given text order */
    public async reorderMdTasks(file: TFile, orderedTexts: string[]): Promise<void> {
        this._suppressRefresh = true;
        try {
            const content = await this.app.vault.read(file);
            const lines = content.split('\n');

            // Collect all task lines and their positions
            const taskEntries: { idx: number; line: string; text: string }[] = [];
            for (let i = 0; i < lines.length; i++) {
                const m = lines[i].match(/^(\s*- \[[ x]\] )(.+)$/);
                if (m) taskEntries.push({ idx: i, line: lines[i], text: m[2] });
            }
            if (taskEntries.length < 2) return;

            // Build reordered lines following the requested text order
            const reordered: string[] = [];
            for (const txt of orderedTexts) {
                const found = taskEntries.find(t => t.text === txt && !reordered.includes(t.line));
                if (found) reordered.push(found.line);
            }
            // Append any tasks not in the ordered list
            for (const t of taskEntries) {
                if (!reordered.includes(t.line)) reordered.push(t.line);
            }

            // Replace task lines in-place
            for (let i = 0; i < taskEntries.length && i < reordered.length; i++) {
                lines[taskEntries[i].idx] = reordered[i];
            }

            await this.app.vault.modify(file, lines.join('\n'));
        } finally {
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
                placeholder: t('chat.inputPlaceholder'),
                rows: '3',
            },
        });

        // Handle Enter key (Shift+Enter for new line)
        this.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void this.sendMessage();
            }
        });

        // Auto-resize
        this.inputEl.addEventListener('input', () => {
            this.inputEl.setCssProps({ '--tl-input-height': 'auto' });
            this.inputEl.setCssProps({ '--tl-input-height': `${Math.min(this.inputEl.scrollHeight, 150)}px` });
        });

        const buttonContainer = this.inputContainer.createDiv('tl-input-buttons');

        this.sendButton = buttonContainer.createEl('button', {
            cls: 'tl-send-btn',
            text: t('chat.send'),
        });
        this.sendButton.addEventListener('click', () => { void this.sendMessage(); });
    }

    /**
     * Show welcome message
     */
    private showWelcomeMessage(): void {
        this.addAIMessage(getLanguage() === 'en'
            ? `Hello 👋

I'm your AI coach, helping you build habits for continuous growth.

**🌙 Review** — Review your day, record achievements & emotions
**💡 Insight** — Insight analysis, generate reports

Click a button above to start, or type your thoughts.`
            : `你好 👋

我是你的 AI 教练，帮助你建立持续成长的习惯。

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
            void this.startMorningSOP();
        } else if (type === 'evening') {
            void this.startEveningSOP();
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
            if (file instanceof TFile) {
                const content = await this.app.vault.read(file);
                if (content.includes('精力状态') || content.includes('energy')) {
                    // Plan already exists, go straight to task input with pre-fill
                    const existingTasks = await this.getExistingTasks();
                    if (existingTasks.length > 0) {
                        this.addAIMessage(t('chat.planExistsModify'));
                    } else {
                        this.addAIMessage(t('chat.planExistsAdd'));
                    }
                    this.quickUpdateMode = true;
                    this.showTaskInput(existingTasks.length > 0 ? existingTasks : undefined);
                    return;
                }
            }
        } catch {
            // If check fails, just proceed with full SOP
        }

        this.addAIMessage(t('chat.startMorning'));
        await this.morningSOP.start(this.sopContext, (message) => {
            this.addAIMessage(message);
        }, () => {
            this.taskInputManager.showTaskInput();
        });
    }

    /**
     * Start evening SOP
     */
    async startEveningSOP(): Promise<void> {
        this.addAIMessage(t('chat.startEvening'));
        await this.eveningSOP.start(this.sopContext, (message) => {
            this.addAIMessage(message);
        });
    }

    /**
     * Start chat with pre-filled context (called from dashboard)
     */
    public startChatWithContext(context: string): void {
        this.switchTab('chat', true);
        this.sopContext = {
            type: 'none',
            currentStep: 0,
            responses: {},
        };
        this.messages = [];
        this.messagesContainer.empty();
        this.hideTaskInput();
        this.addAIMessage(t('chat.dashboardChat'));
        // Inject context as system-level background for the AI
        this.messages.push({
            role: 'system',
            content: getLanguage() === 'en'
                ? `The following is the user's dashboard summary data. Please answer the user's questions based on this data:\n\n${context}`
                : `以下是用户仪表盘上的摘要数据，请基于这些数据回答用户的问题：\n\n${context}`,
            timestamp: Date.now(),
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
            getLanguage() === 'en'
                ? `Free Chat Mode 💬

Talk about anything — problems you're facing, ideas to organize, topics to discuss.

You can also use the buttons below to generate insight reports:`
                : `自由对话模式 💬

聊什么都可以 — 遇到的问题、想梳理的想法、想讨论的话题。

也可以用下方按钮生成洞察报告：`,
            contentDiv,
            '',
            this
        );

        // Insight generation buttons
        const btnGroup = messageEl.createDiv('tl-insight-buttons');

        const isPro = this.plugin.licenseManager.isPro();

        const weeklyBtn = btnGroup.createEl('button', {
            cls: `tl-insight-btn ${!isPro ? 'tl-pro-locked-btn' : ''}`,
            text: `📊 ${t('chat.weeklyInsight')}${!isPro ? ' 🔒' : ''}`,
        });
        weeklyBtn.addEventListener('click', () => {
            if (!isPro) {
                new ProModal(this.app, t('chat.weeklyInsight'), this.plugin.licenseManager).open();
                return;
            }
            this.triggerInsight('weekly');
        });

        const monthlyBtn = btnGroup.createEl('button', {
            cls: `tl-insight-btn ${!isPro ? 'tl-pro-locked-btn' : ''}`,
            text: `📈 ${t('chat.monthlyInsight')}${!isPro ? ' 🔒' : ''}`,
        });
        monthlyBtn.addEventListener('click', () => {
            if (!isPro) {
                new ProModal(this.app, t('chat.monthlyInsight'), this.plugin.licenseManager).open();
                return;
            }
            this.triggerInsight('monthly');
        });

        const profileBtn = btnGroup.createEl('button', {
            cls: `tl-insight-btn ${!isPro ? 'tl-pro-locked-btn' : ''}`,
            text: `👤 ${t('chat.profileSuggestion')}${!isPro ? ' 🔒' : ''}`,
        });
        profileBtn.addEventListener('click', () => {
            if (!isPro) {
                new ProModal(this.app, t('chat.profileSuggestion'), this.plugin.licenseManager).open();
                return;
            }
            this.triggerProfileSuggestion();
        });

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
            setIcon(avatar, 'user');
        } else {
            setIcon(avatar, 'tidelog-wave');
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

    /**
     * Show a thinking indicator (animated dots) while AI is processing
     */
    showThinkingIndicator(): void {
        this.hideThinkingIndicator(); // Remove any existing indicator
        const wrapper = this.messagesContainer.createDiv('tl-message tl-message-ai tl-thinking-indicator');
        const avatar = wrapper.createDiv('tl-message-avatar');
        setIcon(avatar, 'tidelog-wave');
        const content = wrapper.createDiv('tl-message-content');
        content.createDiv('tl-thinking-dots');
        this.scrollToBottom();
    }

    /**
     * Hide the thinking indicator
     */
    hideThinkingIndicator(): void {
        this.messagesContainer.querySelectorAll('.tl-thinking-indicator').forEach(el => el.remove());
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
