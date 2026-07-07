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
import { InsightsMode, InsightsRenderer } from './insights-renderer';
import { loadDayLoopData } from './loop-utils';

import { ChatController } from './chat-controller';
import { replaceFile } from '../utils/vault-write';
import { isSectionHeading } from '../utils/md';
import { formatMonthlyPlanDocument, formatWeeklyPlanDocument } from '../utils/document-format';

type SidebarTab = 'chat' | 'kanban' | 'review';
type ReviewMode = 'home' | 'dialogue';

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

    // SOP progress bar
    private progressBarEl: HTMLElement | null = null;
    private reviewHomeEl: HTMLElement | null = null;
    private reviewHintEl: HTMLElement | null = null;
    private reviewMode: ReviewMode = 'home';

    // Tab system
    private activeTab: SidebarTab = 'kanban';
    private tabContentEl!: HTMLElement;
    private navWrapEl: HTMLElement | null = null;
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
    public periodicSelectorOpen = false;
    public insightsMode: InsightsMode = 'weekly';
    public reviewSelectedMonth: moment.Moment = moment();
    public reviewSelectedDate: moment.Moment = moment();
    private planDefaultDateAfterReview: moment.Moment | null = null;

    // Live refresh
    private vaultModifyRef: ReturnType<typeof this.app.vault.on> | null = null;
    private refreshTimer: number | null = null;
    private _suppressRefresh = false;

    public morningSOP!: MorningSOP;
    public eveningSOP!: EveningSOP;
    private periodicRenderer!: PeriodicRenderer;
    private insightsRenderer!: InsightsRenderer;

    private chatController!: ChatController;

    constructor(leaf: WorkspaceLeaf, plugin: TideLogPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.morningSOP = new MorningSOP(plugin);
        this.eveningSOP = new EveningSOP(plugin);
        this.periodicRenderer = new PeriodicRenderer(this);
        this.insightsRenderer = new InsightsRenderer(this);

        this.chatController = new ChatController(this);
    }

    getViewType(): string {
        return CHAT_VIEW_TYPE;
    }

    getDisplayText(): string {
        return t('view.chatDisplayText');
    }

    getIcon(): string {
        return 'tidelog-wave';
    }

    async onOpen(): Promise<void> {
        await Promise.resolve();
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
        this.reviewHomeEl = this.chatPanel.createDiv('tl-review-home');
        this.progressBarEl = this.chatPanel.createDiv('tl-sop-progress');
        this.progressBarEl.addClass('tl-hidden');
        this.messagesContainer = this.chatPanel.createDiv('tl-messages');
        this.reviewHintEl = this.chatPanel.createDiv('tl-review-input-hint');
        this.renderInputArea(this.chatPanel);

        // New users should land on the first-value path: old journals → profile.
        // Once the initial profile exists, the daily Plan tab becomes the natural home.
        if (this.shouldStartAtFirstInsight()) {
            this.insightsMode = 'profile';
            await this.switchTab('review');
        } else {
            await this.switchTab('kanban');
        }

        // Live refresh: re-render kanban when vault files change
        this.vaultModifyRef = this.app.vault.on('modify', (file) => {
            if (this._suppressRefresh) return;
            if (this.activeTab !== 'kanban' && this.activeTab !== 'review') return;
            if (!(file instanceof TFile) || file.extension !== 'md') return;
            // Debounce to avoid re-render storm
            if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
            this.refreshTimer = window.setTimeout(() => {
                void this.switchTab(this.activeTab, false);
            }, 500);
        });
        this.registerEvent(this.vaultModifyRef);
    }

    async onClose(): Promise<void> {
        await Promise.resolve();
        if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
    }

    // =========================================================================
    // Tab bar
    // =========================================================================

    private renderTabBar(container: HTMLElement): void {
        this.navWrapEl = container.createDiv('tl-tab-bar-wrap');
        this.renderNavigation();
    }

    private renderNavigation(): void {
        if (!this.navWrapEl) return;

        this.navWrapEl.empty();
        this.navWrapEl.setAttr('data-active-tab', this.activeTab);
        this.navWrapEl.setAttr(
            'data-has-subnav',
            this.activeTab === 'kanban' || this.activeTab === 'review' ? 'true' : 'false',
        );
        this.tabBarEl = this.navWrapEl.createDiv('tl-tab-bar');

        const tabs: { id: SidebarTab; icon: string; label: string }[] = [
            { id: 'kanban', icon: 'list-todo', label: t('chat.tabPlan') },
            { id: 'chat', icon: 'circle-check-big', label: t('chat.tabReview') },
            { id: 'review', icon: 'sparkles', label: t('chat.tabInsights') },
        ];

        for (const tab of tabs) {
            const btn = this.tabBarEl.createEl('button', {
                cls: `tl-tab-btn ${tab.id === this.activeTab ? 'tl-tab-btn-active' : ''}`,
                attr: { 'data-tab': tab.id, type: 'button' },
            });
            const icon = btn.createSpan({ cls: 'tl-tab-btn-icon' });
            setIcon(icon, tab.icon);
            btn.createSpan({ cls: 'tl-tab-btn-label', text: tab.label });
            btn.addEventListener('click', () => { void this.switchTab(tab.id, true); });
        }

        if (this.activeTab === 'kanban') {
            this.renderPlanSubnav(this.navWrapEl);
        } else if (this.activeTab === 'review') {
            this.renderInsightsSubnav(this.navWrapEl);
        }
    }

    private renderPlanSubnav(container: HTMLElement): void {
        const row = container.createDiv('tl-subnav-row tl-subnav-row-plan');
        const modes: { id: PeriodicMode; icon: string; label: string }[] = [
            { id: 'day', icon: 'sun', label: t('periodic.day') },
            { id: 'week', icon: 'calendar-range', label: t('periodic.week') },
            { id: 'month', icon: 'calendar-days', label: t('periodic.month') },
            { id: 'capture', icon: 'inbox', label: t('periodic.capture') },
        ];

        for (const mode of modes) {
            const isCapture = mode.id === 'capture';
            const btn = row.createEl('button', {
                cls: `tl-subnav-btn ${isCapture ? 'tl-subnav-btn-icon-only' : ''} ${this.periodicMode === mode.id ? 'tl-subnav-btn-active' : ''}`,
                attr: { type: 'button', 'data-mode': mode.id, title: mode.label, 'aria-label': mode.label },
            });
            const icon = btn.createSpan({ cls: 'tl-subnav-icon' });
            setIcon(icon, mode.icon);
            if (!isCapture) {
                btn.createSpan({ cls: 'tl-subnav-label', text: mode.label });
            }
            btn.addEventListener('click', () => {
                void (async () => {
                    this.periodicMode = mode.id;
                    this.periodicSelectedDate = mode.id === 'day'
                        ? await this.getDefaultPlanDate()
                        : moment();
                    this.periodicMonthOffset = 0;
                    this.periodicSelectorOpen = false;
                    this.invalidateTabCache('kanban');
                    void this.switchTab('kanban');
                })();
            });
        }
    }

    private renderInsightsSubnav(container: HTMLElement): void {
        const row = container.createDiv('tl-subnav-row tl-subnav-row-insights');
        const tabs: { id: InsightsMode; icon: string; label: string }[] = [
            { id: 'weekly', icon: 'bar-chart-3', label: t('insights.weeklyTab') },
            { id: 'monthly', icon: 'calendar-days', label: t('insights.monthlyTab') },
            { id: 'profile', icon: 'user-round-search', label: t('insights.profileTab') },
        ];

        for (const tab of tabs) {
            const btn = row.createEl('button', {
                cls: `tl-subnav-btn ${this.insightsMode === tab.id ? 'tl-subnav-btn-active' : ''}`,
                attr: { type: 'button', 'data-mode': tab.id },
            });
            const icon = btn.createSpan({ cls: 'tl-subnav-icon' });
            setIcon(icon, tab.icon);
            btn.createSpan({ cls: 'tl-subnav-label', text: tab.label });
            btn.addEventListener('click', () => {
                this.insightsMode = tab.id;
                this.invalidateTabCache('review');
                void this.switchTab('review');
            });
        }
    }

    public async switchTab(tab: SidebarTab, animate = false): Promise<void> {
        this.activeTab = tab;
        // Cancel any pending debounced refresh to prevent queued re-renders
        if (this.refreshTimer) { window.clearTimeout(this.refreshTimer); this.refreshTimer = null; }

        const isInitialPlanRender = tab === 'kanban'
            && !this.tabContentEl.querySelector('.tl-tab-panel:not(.tl-tab-panel-chat)');

        // When the user actively clicks a tab (animate=true), reset state to
        // the natural entry point for that tab. Plan also resolves its initial
        // date on first open so a completed review survives an Obsidian restart.
        if ((animate || isInitialPlanRender) && tab === 'kanban') {
            this.periodicMode = 'day';
            this.periodicSelectedDate = await this.getDefaultPlanDate();
            this.periodicMonthOffset = 0;
            this.periodicSelectorOpen = false;
        } else if (animate) {
            if (tab === 'review') {
                this.insightsMode = this.shouldStartAtFirstInsight() ? 'profile' : 'weekly';
            } else if (tab === 'chat') {
                this.reviewSelectedMonth = moment();
                this.reviewSelectedDate = moment();
            }
            // Review tab has no persistent navigation state to reset
        }

        this.renderNavigation();

        if (tab === 'chat') {
            this.chatPanel.removeClass('tl-hidden');
            // Remove non-chat panels
            this.tabContentEl.querySelectorAll('.tl-tab-panel:not(.tl-tab-panel-chat)').forEach(el => el.remove());
            if (animate) {
                this.reviewMode = 'home';
                this.sopContext = {
                    type: 'none',
                    currentStep: 0,
                    responses: {},
                };
            }
            this.renderReviewPanel();
        } else {
            this.chatPanel.addClass('tl-hidden');
            if (this.reviewHintEl) this.reviewHintEl.addClass('tl-hidden');
            // Remove stale panels immediately to prevent double-calendar flash
            this.tabContentEl.querySelectorAll('.tl-tab-panel:not(.tl-tab-panel-chat)').forEach(el => el.remove());
            // Build new panel
            const panel = this.tabContentEl.createDiv('tl-tab-panel');
            if (animate) panel.addClass('tl-tab-panel-animate');
            // Suppress vault-modify re-renders while this render is in progress
            this._suppressRefresh = true;
            const render = (tab === 'kanban')
                ? this.renderKanbanTab(panel)
                : this.renderInsightsTab(panel);
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
            // Support indented markdown task lines and numbered checkbox lines.
            const pat = new RegExp(`^(\\s*- \\[)${oldMark}(\\]\\s+)${escaped}$`, 'm');
            const match = content.match(pat);
            if (match) {
                content = content.replace(pat, `${match[1]}${newMark}${match[2]}${taskText}`);
            } else {
                const numberedCheckboxPat = new RegExp(`^(\\s*\\d+\\.\\s+\\[)${oldMark}(\\]\\s+)${escaped}$`, 'm');
                const numberedCheckboxMatch = content.match(numberedCheckboxPat);
                if (numberedCheckboxMatch) {
                    content = content.replace(numberedCheckboxPat, `${numberedCheckboxMatch[1]}${newMark}${numberedCheckboxMatch[2]}${taskText}`);
                } else {
                    // Try matching numbered list item and convert to checkbox.
                    const numPat = new RegExp(`^(\\s*)\\d+\\.\\s+${escaped}$`, 'm');
                    const numMatch = content.match(numPat);
                    if (numMatch) {
                        content = content.replace(numPat, `${numMatch[1]}- [${newMark}] ${taskText}`);
                    } else {
                        // Try matching plain bullet and convert to checkbox.
                        const bulletPat = new RegExp(`^(\\s*)- ${escaped}$`, 'm');
                        const bulletMatch = content.match(bulletPat);
                        if (bulletMatch) {
                            content = content.replace(bulletPat, `${bulletMatch[1]}- [${newMark}] ${taskText}`);
                        }
                    }
                }
            }
            await replaceFile(this.app, file, content);
        } finally {
            // Delay clearing the flag so the vault 'modify' event (async) is suppressed
            window.setTimeout(() => { this._suppressRefresh = false; }, 200);
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
                if (isSectionHeading(lines[i], '计划', 'Plan', t('vault.sectionPlan'))) {
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

            await replaceFile(this.app, file, lines.join('\n'));
        } finally {
            window.setTimeout(() => { this._suppressRefresh = false; }, 200);
        }
    }

    /** Insert a sub-task (indented) directly after a parent task */
    public async addSubTask(file: TFile, parentText: string, subTaskText: string, parentIndentLevel?: number): Promise<void> {
        this._suppressRefresh = true;
        try {
            const content = await this.app.vault.read(file);
            const lines = content.split('\n');
            const readTaskLine = (line: string): { indentText: string; indentWidth: number; text: string } | null => {
                const match = line.match(/^(\s*)(?:- \[[ x]\]|\d+\.\s+\[[ x]\])\s+(.+)$/);
                if (!match) return null;
                const indentText = match[1] ?? '';
                return {
                    indentText,
                    indentWidth: indentText.replace(/\t/g, '  ').length,
                    text: match[2].trim(),
                };
            };
            let parentIdx = -1;
            let parentIndentText = '';
            let parentIndentWidth = 0;
            for (let i = 0; i < lines.length; i++) {
                const task = readTaskLine(lines[i]);
                if (!task || task.text !== parentText) continue;
                const indentLevel = Math.floor(task.indentWidth / 2);
                if (parentIndentLevel !== undefined && indentLevel !== parentIndentLevel) continue;
                parentIdx = i;
                parentIndentText = task.indentText;
                parentIndentWidth = task.indentWidth;
                break;
            }
            if (parentIdx < 0) {
                throw new Error(`Parent task not found: ${parentText}`);
            }

            let insertIdx = parentIdx + 1;
            while (insertIdx < lines.length) {
                const line = lines[insertIdx];
                if (!line.trim() || line.startsWith('#')) break;
                const indent = (line.match(/^(\s*)/)?.[1] ?? '').replace(/\t/g, '  ').length;
                if (indent <= parentIndentWidth && readTaskLine(line)) break;
                insertIdx++;
            }
            lines.splice(insertIdx, 0, `${parentIndentText}  - [ ] ${subTaskText}`);
            await replaceFile(this.app, file, lines.join('\n'));
        } finally {
            window.setTimeout(() => { this._suppressRefresh = false; }, 200);
        }
    }

    /** Edit a task's text in a markdown file */
    public async editMdTask(file: TFile, oldText: string, newText: string): Promise<void> {
        this._suppressRefresh = true;
        try {
            let content = await this.app.vault.read(file);
            const escaped = oldText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pat = new RegExp(`^(\\s*(?:- \\[[ x]\\]|\\d+\\.\\s+\\[[ x]\\])\\s+)${escaped}$`, 'm');
            content = content.replace(pat, `$1${newText}`);
            await replaceFile(this.app, file, content);
        } finally {
            window.setTimeout(() => { this._suppressRefresh = false; }, 200);
        }
    }

    /** Delete a task line from a markdown file */
    public async deleteMdTask(file: TFile, taskText: string): Promise<void> {
        this._suppressRefresh = true;
        try {
            let content = await this.app.vault.read(file);
            const escaped = taskText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pat = new RegExp(`^\\s*(?:- \\[[ x]\\]|\\d+\\.\\s+\\[[ x]\\])\\s+${escaped}\\n?`, 'm');
            content = content.replace(pat, '');
            await replaceFile(this.app, file, content);
        } finally {
            window.setTimeout(() => { this._suppressRefresh = false; }, 200);
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
            const pat = new RegExp(`^\\s*(?:- \\[[ x]\\]|\\d+\\.\\s+\\[[ x]\\])\\s+${escaped}\\n?`, 'm');
            content = content.replace(pat, '');
            await replaceFile(this.app, sourceFile, content);

            // Refresh the view
            this.invalidateTabCache('kanban');
            void this.switchTab('kanban');
        } finally {
            window.setTimeout(() => { this._suppressRefresh = false; }, 200);
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
            const pat = new RegExp(`^\\s*(?:- \\[[ x]\\]|\\d+\\.\\s+\\[[ x]\\])\\s+${escaped}\\n?`, 'm');
            content = content.replace(pat, '');
            await replaceFile(this.app, sourceFile, content);

            this.invalidateTabCache('kanban');
            void this.switchTab('kanban');
        } finally {
            window.setTimeout(() => { this._suppressRefresh = false; }, 200);
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
                const rawContent = `# ${basename}\n\n`;
                const content = targetPlanPath.includes('/Monthly/')
                    ? formatMonthlyPlanDocument(`${rawContent}## Monthly goals\n\n`)
                    : formatWeeklyPlanDocument(`${rawContent}## Weekly goals\n\n`);
                targetFile = await this.app.vault.create(targetPlanPath, content);
            }

            if (targetFile instanceof TFile) {
                await this.addMdTask(targetFile, taskText);
            }

            // Remove from source file
            let content = await this.app.vault.read(sourceFile);
            const escaped = taskText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pat = new RegExp(`^\\s*(?:- \\[[ x]\\]|\\d+\\.\\s+\\[[ x]\\])\\s+${escaped}\\n?`, 'm');
            content = content.replace(pat, '');
            await replaceFile(this.app, sourceFile, content);

            this.invalidateTabCache('kanban');
            void this.switchTab('kanban');
        } finally {
            window.setTimeout(() => { this._suppressRefresh = false; }, 200);
        }
    }

    /** Change the indent level of a task (promote/demote) */
    public async setTaskIndent(file: TFile, taskText: string, newIndent: number): Promise<void> {
        this._suppressRefresh = true;
        try {
            const content = await this.app.vault.read(file);
            const lines = content.split('\n');
            const escaped = taskText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pat = new RegExp(`^(\\s*)(?:- |\\d+\\.\\s+)(\\[[ x]\\]\\s+)${escaped}$`);
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
            await replaceFile(this.app, file, lines.join('\n'));
        } finally {
            window.setTimeout(() => { this._suppressRefresh = false; }, 200);
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

            await replaceFile(this.app, file, lines.join('\n'));
        } finally {
            window.setTimeout(() => { this._suppressRefresh = false; }, 200);
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
    // Review home — monthly closed loop + Daily Review
    // =========================================================================

    private async renderReviewHome(): Promise<void> {
        if (!this.reviewHomeEl) return;

        const container = this.reviewHomeEl;
        container.empty();

        const selectedMonth = this.reviewSelectedMonth.clone();
        const monthStart = selectedMonth.clone().startOf('month');
        const monthEnd = selectedMonth.clone().endOf('month');
        if (!this.reviewSelectedDate.isSame(selectedMonth, 'month')) {
            this.reviewSelectedDate = selectedMonth.isSame(moment(), 'month')
                ? moment()
                : monthStart.clone();
        }
        const selectedDate = this.reviewSelectedDate.clone();
        const header = container.createDiv('tl-review-home-header');
        const title = getLanguage() === 'en'
            ? selectedMonth.format('MMMM loops')
            : `${selectedMonth.format('M')}月份闭环`;
        header.createDiv({ cls: 'tl-review-home-title', text: title });
        const nav = header.createDiv('tl-review-month-nav');
        const prevBtn = nav.createEl('button', {
            cls: 'tl-review-month-nav-btn',
            attr: { type: 'button', title: getLanguage() === 'en' ? 'Previous month' : '上个月' },
        });
        setIcon(prevBtn, 'chevron-left');
        const nextBtn = nav.createEl('button', {
            cls: 'tl-review-month-nav-btn',
            attr: { type: 'button', title: getLanguage() === 'en' ? 'Next month' : '下个月' },
        });
        setIcon(nextBtn, 'chevron-right');
        prevBtn.addEventListener('click', () => {
            this.reviewSelectedMonth = this.reviewSelectedMonth.clone().subtract(1, 'month');
            this.reviewSelectedDate = this.reviewSelectedMonth.isSame(moment(), 'month')
                ? moment()
                : this.reviewSelectedMonth.clone().startOf('month');
            void this.renderReviewHome();
        });
        nextBtn.addEventListener('click', () => {
            this.reviewSelectedMonth = this.reviewSelectedMonth.clone().add(1, 'month');
            this.reviewSelectedDate = this.reviewSelectedMonth.isSame(moment(), 'month')
                ? moment()
                : this.reviewSelectedMonth.clone().startOf('month');
            void this.renderReviewHome();
        });

        let fullLoops = 0;
        let anyRecord = false;
        const today = moment();
        const todayData = await loadDayLoopData(this.app, this.plugin.settings, today.format('YYYY-MM-DD'));
        const todayHasPlan = todayData?.hasPlan ?? false;
        const selectedData = await loadDayLoopData(this.app, this.plugin.settings, selectedDate.format('YYYY-MM-DD'));
        const selectedHasPlan = selectedData?.hasPlan ?? false;
        const selectedHasReview = selectedData?.hasReview ?? false;
        const selectedIsToday = selectedDate.isSame(today, 'day');
        const selectedIsPast = selectedDate.isBefore(today, 'day');
        const selectedIsFuture = selectedDate.isAfter(today, 'day');
        const dayEntries: Array<{
            day: moment.Moment;
            filePath?: string;
            hasPlan: boolean;
            hasReview: boolean;
        }> = [];
        const leadingDays = monthStart.isoWeekday() - 1;

        for (let i = 0; i < monthEnd.date(); i++) {
            const day = monthStart.clone().add(i, 'days');
            const dateStr = day.format('YYYY-MM-DD');
            const data = await loadDayLoopData(this.app, this.plugin.settings, dateStr);
            const hasPlan = data?.hasPlan ?? false;
            const hasReview = data?.hasReview ?? false;
            if (hasPlan || hasReview) anyRecord = true;
            if (hasPlan && hasReview) fullLoops++;
            dayEntries.push({ day, filePath: data?.filePath, hasPlan, hasReview });
        }

        const daysInMonth = monthEnd.date();
        const monthlyLoopTarget = Math.min(8, daysInMonth);
        const progress = Math.min(100, Math.round((fullLoops / Math.max(1, monthlyLoopTarget)) * 100));
        const progressAngle = Math.round((progress / 100) * 360);
        const hero = container.createDiv('tl-review-loop-hero');
        if (fullLoops > 0) hero.addClass('tl-review-loop-hero-lit');
        const orbit = hero.createDiv('tl-review-loop-orbit');
        orbit.style.setProperty('--tl-review-progress-angle', `${progressAngle}deg`);
        orbit.style.setProperty('--tl-review-progress-plan-angle', `${Math.round(progressAngle * 0.5)}deg`);
        orbit.createSpan({ cls: 'tl-review-loop-orbit-value', text: String(fullLoops) });
        const heroCopy = hero.createDiv('tl-review-loop-hero-copy');
        heroCopy.createDiv({ cls: 'tl-review-loop-hero-label', text: t('review.fullLoops', String(fullLoops)) });
        heroCopy.createDiv({
            cls: 'tl-review-loop-hero-subtitle',
            text: t('review.badgeProgress', String(Math.min(fullLoops, monthlyLoopTarget)), String(monthlyLoopTarget)),
        });
        const track = heroCopy.createDiv('tl-review-loop-progress-track');
        const fill = track.createDiv('tl-review-loop-progress-fill');
        fill.style.setProperty('--tl-review-progress', `${progress}%`);

        const grid = container.createDiv('tl-review-loop-grid');
        const weekdays = t('cal.weekdays').split(',');
        for (const wd of weekdays) {
            grid.createDiv({ cls: 'tl-review-loop-weekday-head', text: wd });
        }

        for (let i = 0; i < leadingDays; i++) {
            grid.createDiv('tl-review-loop-blank');
        }

        for (const entry of dayEntries) {
            const { day, hasPlan, hasReview } = entry;
            let stateClass = 'tl-review-loop-day-empty';
            if (hasPlan && hasReview) {
                stateClass = 'tl-review-loop-day-complete';
            } else if (hasPlan) {
                stateClass = 'tl-review-loop-day-plan';
            } else if (hasReview) {
                stateClass = 'tl-review-loop-day-review';
            }

            const card = grid.createDiv(`tl-review-loop-day ${day.isSame(today, 'day') ? 'tl-review-loop-day-today' : ''} ${day.isSame(selectedDate, 'day') ? 'tl-review-loop-day-selected' : ''}`);
            card.addClass(stateClass);
            if (day.isSame(today, 'day')) {
                card.setAttr('aria-label', getLanguage() === 'en' ? `${day.date()}, today` : `${day.date()}号，今天`);
                card.setAttr('title', getLanguage() === 'en' ? 'Today' : '今天');
            }
            this.renderLoopRing(card, hasPlan, hasReview, String(day.date()));
            card.addEventListener('click', () => {
                this.reviewSelectedDate = day.clone();
                this.reviewSelectedMonth = day.clone();
                void this.renderReviewHome();
            });
        }

        if (!anyRecord) {
            const empty = container.createDiv('tl-review-empty-week');
            empty.createDiv({ text: t('review.emptyWeek') });
        }

        const action = container.createDiv('tl-review-action-row');
        if (selectedHasReview) {
            const done = action.createDiv('tl-review-complete-state');
            const icon = done.createSpan({ cls: 'tl-review-complete-state-icon' });
            setIcon(icon, selectedHasPlan ? 'badge-check' : 'thumbs-up');
            done.createSpan({
                text: selectedIsToday
                    ? (todayHasPlan ? t('review.todayLoopComplete') : t('review.reviewDoneToday'))
                    : (selectedHasPlan ? t('review.selectedLoopComplete') : t('review.selectedReviewDone')),
            });
        } else if (selectedIsToday || selectedIsPast) {
            const startBtn = action.createEl('button', {
                cls: 'tl-review-start-btn',
                attr: { type: 'button' },
            });
            const icon = startBtn.createSpan({ cls: 'tl-review-start-btn-icon' });
            setIcon(icon, selectedIsToday ? 'moon-star' : 'history');
            startBtn.createSpan({ text: selectedIsToday ? t('review.startDailyReview') : t('review.backfillReview') });
            startBtn.addEventListener('click', () => this.startSOP('evening', selectedDate));
        } else {
            const empty = action.createDiv('tl-review-selected-state');
            const icon = empty.createSpan({ cls: 'tl-review-selected-state-icon' });
            setIcon(icon, selectedIsFuture ? 'calendar-clock' : 'calendar-minus');
            empty.createSpan({
                text: selectedIsFuture ? t('review.futureDateHint') : t('review.noPlanOnSelectedDate'),
            });
        }
    }

    private renderReviewPanel(): void {
        if (!this.reviewHomeEl || !this.messagesContainer || !this.inputContainer) return;

        if (this.reviewMode === 'home') {
            this.reviewHomeEl.removeClass('tl-hidden');
            this.messagesContainer.addClass('tl-hidden');
            this.inputContainer.addClass('tl-hidden');
            if (this.reviewHintEl) this.reviewHintEl.addClass('tl-hidden');
            this.hideProgressBar();
            this.messages = [];
            this.messagesContainer.empty();
            void this.renderReviewHome();
            return;
        }

        this.reviewHomeEl.addClass('tl-hidden');
        this.messagesContainer.removeClass('tl-hidden');
        this.inputContainer.removeClass('tl-hidden');
        void this.updateReviewInputHint();
        this.updateProgressBar();
    }

    private renderLoopRing(container: HTMLElement, hasPlan: boolean, hasReview: boolean, label: string): void {
        const ring = container.createDiv(`tl-review-loop-ring ${hasPlan && hasReview ? 'tl-review-loop-ring-complete' : ''}`);
        ring.style.setProperty('--tl-loop-plan-color', hasPlan ? 'var(--tl-plan)' : 'color-mix(in srgb, var(--tl-plan) 16%, var(--tl-surface-card))');
        ring.style.setProperty('--tl-loop-review-color', hasReview ? 'var(--tl-review)' : 'color-mix(in srgb, var(--tl-review) 18%, var(--tl-surface-card))');
        ring.createSpan({ cls: 'tl-review-loop-ring-label', text: label });
    }

    private async updateReviewInputHint(): Promise<void> {
        if (!this.reviewHintEl) return;
        if (this.reviewMode !== 'dialogue') {
            this.reviewHintEl.addClass('tl-hidden');
            return;
        }

        const completedReviews = await this.countCompletedReviews();
        if (completedReviews >= 3) {
            this.reviewHintEl.addClass('tl-hidden');
            this.reviewHintEl.empty();
            return;
        }

        this.reviewHintEl.removeClass('tl-hidden');
        this.reviewHintEl.empty();
        this.reviewHintEl.setText(t('review.dailyHint'));
    }

    private async countCompletedReviews(): Promise<number> {
        const files = this.plugin.vaultManager.getDailyNotesInRange(
            moment('1970-01-01', 'YYYY-MM-DD'),
            moment('2999-12-31', 'YYYY-MM-DD')
        );
        let count = 0;
        for (const file of files) {
            const data = await loadDayLoopData(this.app, this.plugin.settings, file.basename);
            if (data?.hasReview) count++;
        }
        return count;
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

    private async getDefaultPlanDate(): Promise<moment.Moment> {
        if (this.planDefaultDateAfterReview) {
            return this.planDefaultDateAfterReview.clone();
        }

        const today = moment();
        try {
            const loop = await loadDayLoopData(this.app, this.plugin.settings, today.format('YYYY-MM-DD'));
            if (loop?.hasReview) {
                return today.clone().add(1, 'day');
            }
        } catch {
            // If loop detection fails, keep the conservative default: today.
        }

        return today;
    }

    public markDailyReviewCompleted(): void {
        this.planDefaultDateAfterReview = moment().add(1, 'day');
        this.periodicSelectedDate = this.planDefaultDateAfterReview.clone();
        this.periodicMode = 'day';
        this.periodicMonthOffset = 0;
        this.periodicSelectorOpen = false;
        this.reviewSelectedMonth = moment();
        this.reviewSelectedDate = moment();
        if (this.reviewMode === 'home') {
            void this.renderReviewHome();
        }
    }

    // =========================================================================
    // Insights tab — delegated to InsightsRenderer
    // =========================================================================

    private async renderInsightsTab(panel: HTMLElement): Promise<void> {
        await this.insightsRenderer.render(panel);
    }

    private shouldStartAtFirstInsight(): boolean {
        return !this.plugin.settings.firstInsightCompleted;
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
     * Start SOP workflow
     */
    startSOP(type: SOPType, targetDate?: moment.Moment): void {
        if (type === 'evening') {
            this.reviewMode = 'dialogue';
            void this.switchTab('chat', false);
            this.renderReviewPanel();
        }

        this.sopContext = {
            type,
            currentStep: 0,
            responses: {},
            reviewTargetDate: targetDate ? moment(targetDate).format('YYYY-MM-DD') : undefined,
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
        await this.eveningSOP.start(this.sopContext, (message) => {
            this.addAIMessage(message);
        });
        this.updateProgressBar();
    }

    /**
     * Start chat with pre-filled context (called from dashboard)
     */
    public startChatWithContext(context: string): void {
        this.reviewMode = 'dialogue';
        void this.switchTab('chat', false);
        this.renderReviewPanel();
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

        // Respect reduced-motion (and trivial messages): render the final
        // markdown immediately without the typewriter pass.
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        if (reduceMotion || content.length === 0) {
            void MarkdownRenderer.render(this.app, content, messageEl, '', this);
            this.scrollToBottom();
            return;
        }

        // Phase 1 — reveal as plain text with a caret. setText is cheap, so we
        // avoid re-parsing markdown on every tick (the old loop's main jank).
        // Step scales with length to keep the reveal ~steady regardless of size.
        messageEl.addClass('tl-streaming');
        let currentIndex = 0;
        const step = Math.max(2, Math.ceil(content.length / 110));

        const typewriter = window.setInterval(() => {
            currentIndex = Math.min(currentIndex + step, content.length);
            messageEl.setText(content.substring(0, currentIndex));
            this.scrollToBottom();
            if (currentIndex >= content.length) {
                window.clearInterval(typewriter);
                // Phase 2 — render the final markdown exactly once.
                messageEl.removeClass('tl-streaming');
                messageEl.empty();
                void MarkdownRenderer.render(this.app, content, messageEl, '', this);
                this.scrollToBottom();
            }
        }, 16);
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

    /**
     * Trigger insight generation (public, called from main.ts)
     */
    triggerInsight(type: 'weekly' | 'monthly'): void {
        this.openInsights(type);
    }

    /**
     * Open the Insights tab without auto-generating a report.
     * Report generation stays behind the explicit Insights button gate.
     */
    openInsights(type: InsightsMode = 'weekly'): void {
        this.insightsMode = type;
        void this.switchTab('review', false);
    }

}
