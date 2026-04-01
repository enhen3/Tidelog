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
    Platform,
} from 'obsidian';

import TideLogPlugin from '../main';
import { t, getLanguage } from '../i18n';
import { ChatMessage, SOPContext, SOPType } from '../types';
import { MorningSOP } from '../sop/morning-sop';
import { EveningSOP } from '../sop/evening-sop';
import { PeriodicRenderer, PeriodicMode } from './periodic-renderer';
import { ReviewRenderer } from './review-renderer';

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

    // Chat sub-mode: track which Review sub-tab is active
    private chatMode: 'daily' | 'insight' = 'daily';
    private chatModeButtonsEl: HTMLElement | null = null;

    // SOP progress bar
    private progressBarEl: HTMLElement | null = null;

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

    private chatController!: ChatController;

    constructor(leaf: WorkspaceLeaf, plugin: TideLogPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.morningSOP = new MorningSOP(plugin);
        this.eveningSOP = new EveningSOP(plugin);
        this.periodicRenderer = new PeriodicRenderer(this);
        this.reviewRenderer = new ReviewRenderer(this);

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
        if (Platform.isMobile) container.addClass('is-mobile');

        // Tab bar (top-level navigation — no header)
        this.renderTabBar(container);

        // Tab content area
        this.tabContentEl = container.createDiv('tl-tab-content');

        // Chat panel (SOP buttons + messages + input)
        this.chatPanel = this.tabContentEl.createDiv('tl-tab-panel tl-tab-panel-chat');
        this.renderSOPButtons(this.chatPanel);
        this.progressBarEl = this.chatPanel.createDiv('tl-sop-progress');
        this.progressBarEl.addClass('tl-hidden');
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
        this.chatModeButtonsEl = buttons;

        const eveningBtn = buttons.createEl('button', {
            cls: 'tl-mode-btn tl-mode-btn-review',
            attr: { 'data-chat-mode': 'daily' },
        });
        setIcon(eveningBtn, 'moon');
        eveningBtn.createSpan({ text: 'Daily' });
        eveningBtn.addEventListener('click', () => {
            this.setChatMode('daily');
            this.startSOP('evening');
        });

        const insightBtn = buttons.createEl('button', {
            cls: 'tl-mode-btn tl-mode-btn-insight',
            attr: { 'data-chat-mode': 'insight' },
        });
        setIcon(insightBtn, 'lightbulb');
        insightBtn.createSpan({ text: 'Insight' });
        insightBtn.addEventListener('click', () => {
            this.setChatMode('insight');
            this.startFreeChat();
        });

        // Apply initial active state
        this.updateChatModeButtons();
    }

    /** Update visual active state on Daily / Insight sub-tab buttons */
    private setChatMode(mode: 'daily' | 'insight'): void {
        this.chatMode = mode;
        this.updateChatModeButtons();
    }

    private updateChatModeButtons(): void {
        if (!this.chatModeButtonsEl) return;
        this.chatModeButtonsEl.querySelectorAll('.tl-mode-btn').forEach(btn => {
            btn.removeClass('tl-mode-btn-active');
            if (btn.getAttribute('data-chat-mode') === this.chatMode) {
                btn.addClass('tl-mode-btn-active');
            }
        });
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
            { id: 'review', emoji: '🌓', label: 'Trends' },
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
        // Cancel any pending debounced refresh to prevent queued re-renders
        if (this.refreshTimer) { clearTimeout(this.refreshTimer); this.refreshTimer = null; }

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
            // Remove stale panels immediately to prevent double-calendar flash
            this.tabContentEl.querySelectorAll('.tl-tab-panel:not(.tl-tab-panel-chat)').forEach(el => el.remove());
            // Build new panel
            const panel = this.tabContentEl.createDiv('tl-tab-panel');
            if (animate) panel.addClass('tl-tab-panel-animate');
            // Suppress vault-modify re-renders while this render is in progress
            this._suppressRefresh = true;
            const render = (tab === 'kanban')
                ? this.renderKanbanTab(panel)
                : this.renderReviewTab(panel);
            void render.finally(() => {
                this._suppressRefresh = false;
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
     * For daily notes (files with a Plan section), inserts within the Plan section.
     * For other files (weekly/monthly plans), inserts after the last existing task line.
     */
    public async addMdTask(file: TFile, taskText: string, indent = 0): Promise<void> {
        this._suppressRefresh = true;
        try {
            let content = await this.app.vault.read(file);
            const prefix = '  '.repeat(indent);
            const newLine = `${prefix}- [ ] ${taskText}`;
            const lines = content.split('\n');

            // Detect Plan section (daily notes have ## 计划 or ## Plan)
            let planSectionIdx = -1;
            let planSectionEnd = -1;
            for (let i = 0; i < lines.length; i++) {
                const trimmed = lines[i].trim();
                if (trimmed === '## 计划' || trimmed === '## Plan' || trimmed === `## ${t('vault.sectionPlan')}`) {
                    planSectionIdx = i;
                    // Find the end of the Plan section (next ## heading or end of file)
                    planSectionEnd = lines.length;
                    for (let j = i + 1; j < lines.length; j++) {
                        if (lines[j].startsWith('## ')) {
                            planSectionEnd = j;
                            break;
                        }
                    }
                    break;
                }
            }

            if (planSectionIdx >= 0) {
                // Daily note: insert within the Plan section
                // Find last task line within the Plan section
                let lastTaskInSection = -1;
                for (let i = planSectionIdx + 1; i < planSectionEnd; i++) {
                    if (lines[i].match(/^\s*- \[[ x]\] /)) {
                        lastTaskInSection = i;
                    }
                }

                if (lastTaskInSection >= 0) {
                    // Insert after the last task in the Plan section
                    lines.splice(lastTaskInSection + 1, 0, newLine);
                } else {
                    // No tasks yet in Plan section — insert after the section header
                    // Skip any blank lines and HTML comments right after the header
                    let insertIdx = planSectionIdx + 1;
                    while (insertIdx < planSectionEnd) {
                        const line = lines[insertIdx].trim();
                        if (line === '' || line.startsWith('<!--')) {
                            insertIdx++;
                        } else {
                            break;
                        }
                    }
                    lines.splice(insertIdx, 0, newLine);
                }
            } else {
                // Non-daily file (weekly/monthly plans): insert after last task or append
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


    /**
     * Move a task from one plan file to another plan file (week→week or month→month)
     */
    public async moveTaskToPlan(sourceFile: TFile, taskText: string, targetPlanPath: string): Promise<void> {
        this._suppressRefresh = true;
        try {
            // Don't move if source and target are the same file
            if (sourceFile.path === targetPlanPath) return;

            // Ensure target file exists (auto-create with minimal template)
            let targetFile = this.app.vault.getAbstractFileByPath(targetPlanPath);
            if (!targetFile) {
                const folder = targetPlanPath.substring(0, targetPlanPath.lastIndexOf('/'));
                if (!this.app.vault.getAbstractFileByPath(folder)) {
                    await this.app.vault.createFolder(folder);
                }
                const basename = targetPlanPath.split('/').pop()?.replace('.md', '') || 'Plan';
                targetFile = await this.app.vault.create(targetPlanPath, `# ${basename}\n\n`);
            }

            if (targetFile instanceof TFile) {
                await this.addMdTask(targetFile, taskText);
            }

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

Here, record every rise and fall of your daily tides.

🌙 Daily — Review today's stories & emotions
💡 Insight — Discover your rhythms & patterns

Tap a button above, or just chat anytime ✨`
            : `你好 👋

在这里，记录每天的潮汐涨落。

🌙 Daily — 回顾今天的故事与心情
💡 Insight — 发现你的节奏与模式

点击上方按钮，或随时聊聊 ✨`);
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
                    this.addAIMessage(t('chat.planExistsModify'));
                    return;
                }
            }
        } catch {
            // If check fails, just proceed with full SOP
        }

        this.addAIMessage(t('chat.startMorning'));
        await this.morningSOP.start(this.sopContext, (message) => {
            this.addAIMessage(message);
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
        this.updateProgressBar();
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
        this.hideProgressBar();

        const messageEl = this.createMessageElement('ai');
        const contentDiv = messageEl.createDiv();
        void MarkdownRenderer.render(
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
        void MarkdownRenderer.render(this.app, content, messageEl, '', this);
        this.scrollToBottom();
    }

    /**
     * Stream an AI message (for SOP responses)
     */
    streamAIMessage(content: string): void {
        // Update progress bar whenever an AI message streams during evening SOP
        if (this.sopContext.type === 'evening') {
            this.updateProgressBar();
        }

        const messageEl = this.createMessageElement('ai');
        let currentIndex = 0;

        const typewriter = setInterval(() => {
            if (currentIndex < content.length) {
                currentIndex = Math.min(currentIndex + 3, content.length);
                messageEl.empty();
                void MarkdownRenderer.render(this.app, content.substring(0, currentIndex), messageEl, '', this);
                this.scrollToBottom();
            } else {
                clearInterval(typewriter);
            }
        }, 15);
    }

    /**
     * Update the SOP progress bar with current step info from the evening SOP.
     */
    updateProgressBar(): void {
        if (!this.progressBarEl) return;

        // Only show during evening SOP
        if (this.sopContext.type !== 'evening') {
            this.progressBarEl.addClass('tl-hidden');
            return;
        }

        const { current, total, currentLabel } = this.eveningSOP.getProgressInfo();
        if (total === 0) {
            this.progressBarEl.addClass('tl-hidden');
            return;
        }

        this.progressBarEl.removeClass('tl-hidden');
        this.progressBarEl.empty();

        // "Step 2/5 · 成功日记~"
        const isComplete = current >= total;
        const labelText = isComplete
            ? (getLanguage() === 'en' ? 'Review complete ✓' : '复盘完成 ✓')
            : (getLanguage() === 'en'
                ? `Step ${current + 1}/${total} · ${currentLabel}`
                : `第 ${current + 1}/${total} 步 · ${currentLabel}`);

        this.progressBarEl.createDiv({ cls: 'tl-sop-progress-label', text: labelText });

        // Segmented progress track
        const track = this.progressBarEl.createDiv('tl-sop-progress-track');
        for (let i = 0; i < total; i++) {
            const seg = track.createDiv('tl-sop-progress-seg');
            if (i < current) seg.addClass('tl-sop-progress-seg-done');
            else if (i === current && !isComplete) seg.addClass('tl-sop-progress-seg-active');
        }
    }

    /**
     * Hide the SOP progress bar (e.g. when SOP finishes).
     */
    hideProgressBar(): void {
        if (this.progressBarEl) this.progressBarEl.addClass('tl-hidden');
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
