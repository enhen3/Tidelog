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

type SidebarTab = 'chat' | 'kanban' | 'review';

export const CHAT_VIEW_TYPE = 'ai-flow-chat-view';

export class ChatView extends ItemView {
    private plugin: AIFlowManagerPlugin;
    private messages: ChatMessage[] = [];
    private sopContext: SOPContext = {
        type: 'none',
        currentStep: 0,
        responses: {},
    };

    private messagesContainer!: HTMLElement;
    private inputContainer!: HTMLElement;
    private inputEl!: HTMLTextAreaElement;
    private sendButton!: HTMLButtonElement;
    private isProcessing = false;

    // Task input mode
    private taskInputContainer: HTMLElement | null = null;
    private taskData: { field: HTMLInputElement; subtaskFields: HTMLInputElement[]; subtaskContainer: HTMLElement | null }[] = [];
    private isTaskInputMode = false;
    private quickUpdateMode = false;

    // Tab system
    private activeTab: SidebarTab = 'chat';
    private tabContentEl!: HTMLElement;
    private tabBarEl!: HTMLElement;
    private chatPanel!: HTMLElement;
    private kanbanWeekOffset = 0;
    private kanbanMonthOffset = 0;
    private kanbanDayOffset = 0;
    private calendarMonth: moment.Moment = moment();

    // Live refresh
    private vaultModifyRef: ReturnType<typeof this.app.vault.on> | null = null;
    private refreshTimer: ReturnType<typeof setTimeout> | null = null;
    private _suppressRefresh = false;

    private morningSOP!: MorningSOP;
    private eveningSOP!: EveningSOP;

    constructor(leaf: WorkspaceLeaf, plugin: AIFlowManagerPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.morningSOP = new MorningSOP(plugin);
        this.eveningSOP = new EveningSOP(plugin);
    }

    getViewType(): string {
        return CHAT_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Dailot「小舵」';
    }

    getIcon(): string {
        return 'message-circle';
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
                this.switchTab(this.activeTab);
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
        title.setText('Dailot「小舵」');
    }

    /**
     * Render SOP buttons inside the chat panel only
     */
    private renderSOPButtons(container: HTMLElement): void {
        const buttons = container.createDiv('ai-flow-header-buttons');

        const morningBtn = buttons.createEl('button', {
            cls: 'ai-flow-mode-btn',
            attr: { 'aria-label': '晨间复盘' },
        });
        setIcon(morningBtn, 'sun');
        morningBtn.createSpan({ text: '晨间' });
        morningBtn.addEventListener('click', () => this.startSOP('morning'));

        const eveningBtn = buttons.createEl('button', {
            cls: 'ai-flow-mode-btn',
            attr: { 'aria-label': '晚间复盘' },
        });
        setIcon(eveningBtn, 'moon');
        eveningBtn.createSpan({ text: '晚间' });
        eveningBtn.addEventListener('click', () => this.startSOP('evening'));

        const insightBtn = buttons.createEl('button', {
            cls: 'ai-flow-mode-btn',
            attr: { 'aria-label': '洞察分析' },
        });
        setIcon(insightBtn, 'lightbulb');
        insightBtn.createSpan({ text: '洞察' });
        insightBtn.addEventListener('click', () => this.startFreeChat());
    }

    // =========================================================================
    // Tab bar
    // =========================================================================

    private renderTabBar(container: HTMLElement): void {
        this.tabBarEl = container.createDiv('af-tab-bar');

        const tabs: { id: SidebarTab; icon: string; label: string }[] = [
            { id: 'chat', icon: '💬', label: '聊天' },
            { id: 'kanban', icon: '📋', label: '看板' },
            { id: 'review', icon: '📊', label: '回顾' },
        ];

        for (const tab of tabs) {
            const btn = this.tabBarEl.createEl('button', {
                cls: `af-tab-btn ${tab.id === this.activeTab ? 'af-tab-btn-active' : ''}`,
                attr: { 'data-tab': tab.id },
            });
            btn.createEl('span', { cls: 'af-tab-btn-icon', text: tab.icon });
            btn.createEl('span', { cls: 'af-tab-btn-label', text: tab.label });
            btn.addEventListener('click', () => this.switchTab(tab.id));
        }
    }

    private switchTab(tab: SidebarTab): void {
        this.activeTab = tab;

        // Update tab bar active state
        this.tabBarEl.querySelectorAll('.af-tab-btn').forEach(btn => {
            btn.removeClass('af-tab-btn-active');
            if (btn.getAttribute('data-tab') === tab) {
                btn.addClass('af-tab-btn-active');
            }
        });

        // Remove non-chat panels (keep chat panel)
        this.tabContentEl.querySelectorAll('.af-tab-panel:not(.af-tab-panel-chat)').forEach(el => el.remove());

        if (tab === 'chat') {
            this.chatPanel.style.display = '';
        } else {
            this.chatPanel.style.display = 'none';
            const panel = this.tabContentEl.createDiv('af-tab-panel');

            if (tab === 'kanban') this.renderKanbanTab(panel);
            else if (tab === 'review') this.renderReviewTab(panel);
        }
    }

    // =========================================================================
    // Shared helpers for task parsing / toggling
    // =========================================================================

    /**
     * Parse markdown content into structured items.
     * Filters out empty/placeholder items (e.g. "第一周：" with no content).
     */
    private parseMdTasks(content: string): { text: string; done: boolean; isTask: boolean; section: string; indent: number }[] {
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
                items.push({ text: numM[2].trim(), done: false, isTask: false, section, indent: calcIndent(numM[1]) });
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

    private async toggleMdTask(file: TFile, taskText: string, wasDone: boolean): Promise<void> {
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
    private parseNoteScores(content: string): number | null {
        // 1. Try evening emotion section: "### 开心事与情绪" followed by a number
        const emotionSectionMatch = content.match(/###\s*开心事与情绪[\s\S]*?\n\s*(\d+)/m);
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
    // Kanban tab — Pyramid View
    // =========================================================================

    private async renderKanbanTab(panel: HTMLElement): Promise<void> {
        panel.addClass('af-kanban-container');
        panel.addClass('af-pyramid');

        const targetDate = moment().add(this.kanbanWeekOffset, 'weeks');
        const weekStart = moment(targetDate).startOf('isoWeek');

        // Layer 1 — Monthly Goals (top)
        await this.renderPyramidMonth(panel);

        // Layer 2 — Weekly Tasks (middle)
        await this.renderPyramidWeek(panel, targetDate, weekStart);

        // Layer 3 — Daily Tasks (bottom)
        await this.renderPyramidDaily(panel);
    }

    // ──────────────────────────────────────────────────────
    // Layer 1: Monthly Goals
    // ──────────────────────────────────────────────────────

    private async renderPyramidMonth(panel: HTMLElement): Promise<void> {
        const layer = panel.createDiv('af-pyramid-layer af-pyramid-month');

        // Compute target month
        const targetMonth = moment().add(this.kanbanMonthOffset, 'months');
        const monthLabel = targetMonth.format('M月');
        const monthRef = targetMonth.format('YYYY-MM');

        // Header with < > nav
        const header = layer.createDiv('af-pyramid-layer-header af-pyramid-month-header');
        const navLeft = header.createEl('button', { cls: 'af-pyramid-nav-btn', text: '‹' });
        navLeft.addEventListener('click', () => { this.kanbanMonthOffset--; this.switchTab('kanban'); });

        const titleArea = header.createDiv('af-pyramid-week-title-area');
        titleArea.createEl('span', { cls: 'af-pyramid-layer-icon', text: '🏔️' });
        titleArea.createEl('span', { cls: 'af-pyramid-layer-title', text: `${monthLabel}目标` });
        titleArea.style.cursor = 'pointer';

        const navRight = header.createEl('button', { cls: 'af-pyramid-nav-btn', text: '›' });
        navRight.addEventListener('click', () => { this.kanbanMonthOffset++; this.switchTab('kanban'); });

        if (this.kanbanMonthOffset !== 0) {
            const resetBtn = header.createEl('button', { cls: 'af-pyramid-today-btn', text: '本月' });
            resetBtn.addEventListener('click', () => { this.kanbanMonthOffset = 0; this.switchTab('kanban'); });
        }

        // Try to read monthly plan
        let file: TFile | null = null;
        try {
            const tmpl = this.plugin.templateManager.getMonthlyPlanTemplate(monthRef);
            file = await this.plugin.vaultManager.getOrCreateMonthlyPlan(targetMonth.toDate(), tmpl);
        } catch { /* skip */ }

        if (!file) {
            layer.createDiv({ cls: 'af-pyramid-empty', text: '暂无月计划' });
            return;
        }

        // Click title to open file
        titleArea.addEventListener('click', () => {
            if (file) this.app.workspace.getLeaf().openFile(file);
        });

        const content = await this.app.vault.read(file);
        const allItems = this.parseMdTasks(content);

        // Filter for goal/milestone sections
        const goalSections = ['月度目标', '关键里程碑'];
        const goals = allItems.filter(i => goalSections.some(s => i.section.includes(s)));

        // Progress bar for monthly goals (count ALL items)
        if (goals.length > 0) {
            const doneCount = goals.filter(g => g.done).length;
            const progressWrap = layer.createDiv('af-pyramid-progress-wrap');
            progressWrap.style.padding = '0 12px';
            const progressBar = progressWrap.createDiv('af-pyramid-progress-bar');
            const progressFill = progressBar.createDiv('af-pyramid-progress-fill');
            progressFill.style.width = `${(doneCount / goals.length) * 100}%`;
            progressWrap.createEl('span', { cls: 'af-pyramid-progress-label', text: `${doneCount}/${goals.length} 完成` });
        }

        // Task list body (same pattern as weekly/daily)
        const body = layer.createDiv('af-pyramid-month-detail');
        if (goals.length === 0) {
            body.createDiv({ cls: 'af-pyramid-empty', text: '点击设定月度目标 →' });
        } else {
            for (const goal of goals) {
                const card = body.createDiv({ cls: `af-pyramid-task ${goal.done ? 'af-pyramid-task-done' : ''}` });
                if (goal.indent > 0) {
                    card.style.marginLeft = `${goal.indent * 20}px`;
                    card.style.fontSize = '12px';
                    card.style.opacity = '0.7';
                    card.style.padding = '5px 8px';
                }
                const cb = card.createEl('input', { type: 'checkbox' });
                cb.checked = goal.done;
                cb.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (file) await this.toggleMdTask(file, goal.text, goal.done);
                    this.switchTab('kanban');
                });
                const label = card.createEl('span', { cls: 'af-pyramid-task-text', text: goal.text });
                if (goal.done) { label.style.textDecoration = 'line-through'; label.style.opacity = '0.5'; }
            }
        }
    }

    // ──────────────────────────────────────────────────────
    // Layer 2: Weekly Tasks
    // ──────────────────────────────────────────────────────

    private async renderPyramidWeek(panel: HTMLElement, targetDate: ReturnType<typeof moment>, weekStart: ReturnType<typeof moment>): Promise<void> {
        const layer = panel.createDiv('af-pyramid-layer af-pyramid-week');

        const weekEnd = moment(targetDate).endOf('isoWeek');
        const weekNum = targetDate.isoWeek();
        const weekLabel = `${weekStart.format('M月D日')}～${weekEnd.format('M月D日')} 第${weekNum}周目标`;
        const weekRef = `W${targetDate.format('ww')}`;

        // Header with < > nav — click title opens weekly plan
        const header = layer.createDiv('af-pyramid-layer-header af-pyramid-week-header');
        const navLeft = header.createEl('button', { cls: 'af-pyramid-nav-btn', text: '‹' });
        navLeft.addEventListener('click', () => { this.kanbanWeekOffset--; this.switchTab('kanban'); });

        const titleArea = header.createDiv('af-pyramid-week-title-area');
        titleArea.createEl('span', { cls: 'af-pyramid-layer-icon', text: '📅' });
        titleArea.createEl('span', { cls: 'af-pyramid-layer-title', text: weekLabel });
        titleArea.style.cursor = 'pointer';

        const navRight = header.createEl('button', { cls: 'af-pyramid-nav-btn', text: '›' });
        navRight.addEventListener('click', () => { this.kanbanWeekOffset++; this.switchTab('kanban'); });

        if (this.kanbanWeekOffset !== 0) {
            const todayBtn = header.createEl('button', { cls: 'af-pyramid-today-btn', text: '本周' });
            todayBtn.addEventListener('click', () => { this.kanbanWeekOffset = 0; this.switchTab('kanban'); });
        }

        // Read weekly plan
        let file: TFile | null = null;
        const ed = this.plugin.vaultManager.getEffectiveDate(targetDate.toDate());
        try {
            const tmpl = this.plugin.templateManager.getWeeklyPlanTemplate(weekRef, ed.format('YYYY-MM'));
            file = await this.plugin.vaultManager.getOrCreateWeeklyPlan(targetDate.toDate(), tmpl);
        } catch { /* skip */ }

        // Click title area to open file
        titleArea.addEventListener('click', () => {
            if (file) this.app.workspace.getLeaf().openFile(file);
        });

        const body = layer.createDiv('af-pyramid-week-body');

        if (!file) {
            body.createDiv({ cls: 'af-pyramid-empty', text: '暂无周计划' });
            return;
        }

        const content = await this.app.vault.read(file);
        const allItems = this.parseMdTasks(content);

        // Merge 本周目标 + 关键任务 + 本周重点 into one view
        const weekSections = ['关键任务', '本周目标', '本周重点'];
        const keyItems = allItems.filter(i => weekSections.some(s => i.section.includes(s)));

        if (keyItems.length === 0) {
            body.createDiv({ cls: 'af-pyramid-empty', text: '暂无本周任务' });
        } else {
            // Progress bar (count all items)
            const doneCount = keyItems.filter(t => t.done).length;
            if (keyItems.length > 0) {
                const progressWrap = body.createDiv('af-pyramid-progress-wrap');
                const progressBar = progressWrap.createDiv('af-pyramid-progress-bar');
                const progressFill = progressBar.createDiv('af-pyramid-progress-fill');
                progressFill.style.width = `${(doneCount / keyItems.length) * 100}%`;
                progressWrap.createEl('span', { cls: 'af-pyramid-progress-label', text: `${doneCount}/${keyItems.length} 完成` });
            }

            // Render all items with checkboxes
            for (const item of keyItems) {
                const card = body.createDiv({ cls: `af-pyramid-task ${item.done ? 'af-pyramid-task-done' : ''}` });
                if (item.indent > 0) {
                    card.style.marginLeft = `${item.indent * 20}px`;
                    card.style.fontSize = '12px';
                    card.style.opacity = '0.7';
                    card.style.padding = '5px 8px';
                }
                const cb = card.createEl('input', { type: 'checkbox' });
                cb.checked = item.done;
                cb.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (file) await this.toggleMdTask(file, item.text, item.done);
                    this.switchTab('kanban');
                });
                const label = card.createEl('span', { cls: 'af-pyramid-task-text', text: item.text });
                if (item.done) { label.style.textDecoration = 'line-through'; label.style.opacity = '0.5'; }
            }
        }
    }

    // ──────────────────────────────────────────────────────
    // Layer 3: Daily Tasks
    // ──────────────────────────────────────────────────────

    private async renderPyramidDaily(panel: HTMLElement): Promise<void> {
        const layer = panel.createDiv('af-pyramid-layer af-pyramid-daily');

        const DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
        const targetDay = moment().add(this.kanbanDayOffset, 'days');
        const dayIdx = targetDay.isoWeekday() - 1;
        const dayLabel = `${targetDay.format('M月D日')} ${DAY_LABELS[dayIdx]}任务`;
        const isToday = this.kanbanDayOffset === 0;

        // Header with < > nav (day-level)
        const header = layer.createDiv('af-pyramid-layer-header af-pyramid-daily-header');
        const navLeft = header.createEl('button', { cls: 'af-pyramid-nav-btn', text: '‹' });
        navLeft.addEventListener('click', () => { this.kanbanDayOffset--; this.switchTab('kanban'); });

        const titleArea = header.createDiv('af-pyramid-week-title-area');
        titleArea.createEl('span', { cls: 'af-pyramid-layer-icon', text: '📋' });
        titleArea.createEl('span', { cls: 'af-pyramid-layer-title', text: dayLabel });
        titleArea.style.cursor = 'pointer';

        const navRight = header.createEl('button', { cls: 'af-pyramid-nav-btn', text: '›' });
        navRight.addEventListener('click', () => { this.kanbanDayOffset++; this.switchTab('kanban'); });

        if (!isToday) {
            const resetBtn = header.createEl('button', { cls: 'af-pyramid-today-btn', text: '今天' });
            resetBtn.addEventListener('click', () => { this.kanbanDayOffset = 0; this.switchTab('kanban'); });
        }

        // Read tasks for the single day
        const folder = this.plugin.settings.dailyFolder;
        const dateStr = targetDay.format('YYYY-MM-DD');
        const filePath = `${folder}/${dateStr}.md`;
        const file = this.app.vault.getAbstractFileByPath(filePath);

        // Click title to open file
        titleArea.addEventListener('click', async () => {
            if (file && file instanceof TFile) {
                this.app.workspace.getLeaf().openFile(file);
            } else {
                const f = await this.plugin.vaultManager.getOrCreateDailyNote(targetDay.toDate());
                this.app.workspace.getLeaf().openFile(f);
            }
        });

        interface DayTask { text: string; done: boolean; indent: number }
        const tasks: DayTask[] = [];
        if (file && file instanceof TFile) {
            try {
                const content = await this.app.vault.read(file);
                for (const line of content.split('\n')) {
                    const m = line.match(/^(\s*)- \[([\sx])\] (.+)$/);
                    if (m) {
                        // Count indent: each tab = 1 level, every 2 spaces = 1 level
                        const raw = m[1];
                        const tabCount = (raw.match(/\t/g) || []).length;
                        const spaceCount = raw.replace(/\t/g, '').length;
                        const indent = tabCount + Math.floor(spaceCount / 2);
                        tasks.push({ done: m[2] === 'x', text: m[3].trim(), indent });
                    }
                }
            } catch { /* skip */ }
        }

        // Progress bar
        if (tasks.length > 0) {
            const doneCount = tasks.filter(t => t.done).length;
            const progressWrap = layer.createDiv('af-pyramid-progress-wrap');
            progressWrap.style.padding = '0 12px';
            const progressBar = progressWrap.createDiv('af-pyramid-progress-bar');
            const progressFill = progressBar.createDiv('af-pyramid-progress-fill');
            progressFill.style.width = `${(doneCount / tasks.length) * 100}%`;
            progressWrap.createEl('span', { cls: 'af-pyramid-progress-label', text: `${doneCount}/${tasks.length} 完成` });
        }

        // Task list body
        const body = layer.createDiv('af-pyramid-daily-body');
        if (tasks.length === 0) {
            body.createDiv({ cls: 'af-pyramid-empty', text: '暂无任务' });
        } else {
            for (const task of tasks) {
                const card = body.createDiv({ cls: `af-pyramid-task ${task.done ? 'af-pyramid-task-done' : ''}` });
                if (task.indent > 0) {
                    card.style.marginLeft = `${task.indent * 20}px`;
                    card.style.fontSize = '12px';
                    card.style.opacity = '0.7';
                    card.style.padding = '5px 8px';
                }
                const cb = card.createEl('input', { type: 'checkbox' });
                cb.checked = task.done;
                cb.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    const f = this.app.vault.getAbstractFileByPath(filePath);
                    if (f && f instanceof TFile) {
                        await this.toggleMdTask(f, task.text, task.done);
                    }
                    this.switchTab('kanban');
                });
                const label = card.createEl('span', { cls: 'af-pyramid-task-text', text: task.text });
                if (task.done) { label.style.textDecoration = 'line-through'; label.style.opacity = '0.5'; }
            }
        }
    }

    // =========================================================================
    // Review tab (merged calendar + dashboard)
    // =========================================================================

    private async renderReviewTab(panel: HTMLElement): Promise<void> {
        panel.addClass('af-review-scroll');
        await this.renderReviewCalendar(panel);
        await this.renderReviewDashboard(panel);
    }

    // --- Calendar section ---

    private async renderReviewCalendar(panel: HTMLElement): Promise<void> {
        const layer = panel.createDiv('af-pyramid-layer af-pyramid-review-cal');
        // Header
        const header = layer.createDiv('af-pyramid-layer-header af-cal-header');
        const prevBtn = header.createEl('button', { cls: 'af-cal-nav-btn', text: '‹' });
        prevBtn.addEventListener('click', () => {
            this.calendarMonth.subtract(1, 'month');
            this.switchTab('review');
        });
        header.createEl('span', { cls: 'af-cal-title', text: this.calendarMonth.format('YYYY年 M月') });
        const nextBtn = header.createEl('button', { cls: 'af-cal-nav-btn', text: '›' });
        nextBtn.addEventListener('click', () => {
            this.calendarMonth.add(1, 'month');
            this.switchTab('review');
        });

        // Body with legend + grid
        const body = layer.createDiv('af-pyramid-review-cal-body');

        // Legend
        const legend = body.createDiv('af-cal-legend');
        legend.createEl('span', { cls: 'af-cal-legend-item', text: '情绪：' });
        const grad = legend.createDiv('af-cal-legend-gradient');
        grad.createEl('span', { text: '低' });
        grad.createEl('div', { cls: 'af-cal-gradient-bar' });
        grad.createEl('span', { text: '高' });

        // Weekday row
        const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
        const grid = body.createDiv('af-cal-grid');
        for (const wd of weekdays) {
            grid.createEl('div', { cls: 'af-cal-weekday', text: wd });
        }

        // Gather data
        const folder = this.plugin.settings.dailyFolder;
        const yearMonth = this.calendarMonth.format('YYYY-MM');
        const files = this.app.vault.getFiles().filter(f => f.path.startsWith(folder + '/') && f.name.startsWith(yearMonth));

        interface CalData { emotionScore: number | null; taskCount: number; completedCount: number; status: string; filePath: string }
        const dataMap = new Map<string, CalData>();

        for (const file of files) {
            try {
                const content = await this.app.vault.read(file);
                const dm = file.name.match(/(\d{4}-\d{2}-\d{2})/);
                if (!dm) continue;
                const emotionScore = this.parseNoteScores(content);
                let status = 'todo';
                // Check YAML status if frontmatter exists
                if (content.startsWith('---')) {
                    const end = content.indexOf('---', 3);
                    if (end > 0) {
                        const sm = content.substring(4, end).match(/status:\s*(\S+)/);
                        if (sm) status = sm[1];
                    }
                }
                const allT = content.match(/^- \[[ x]\] /gm);
                const doneT = content.match(/^- \[x\] /gm);
                dataMap.set(dm[1], {
                    emotionScore,
                    taskCount: allT ? allT.length : 0,
                    completedCount: doneT ? doneT.length : 0,
                    status,
                    filePath: file.path,
                });
            } catch { /* skip */ }
        }

        // Pad
        const firstDay = moment(this.calendarMonth).startOf('month');
        const startPad = firstDay.isoWeekday() - 1;
        for (let i = 0; i < startPad; i++) grid.createDiv('af-cal-cell af-cal-cell-empty');

        const daysInMonth = this.calendarMonth.daysInMonth();
        const todayStr = moment().format('YYYY-MM-DD');

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = moment(this.calendarMonth).date(d).format('YYYY-MM-DD');
            const data = dataMap.get(dateStr);
            const isToday = dateStr === todayStr;

            const cell = grid.createDiv(`af-cal-cell ${isToday ? 'af-cal-cell-today' : ''}`);
            cell.createEl('div', { cls: 'af-cal-date', text: `${d}` });

            if (data?.emotionScore) {
                const hue = Math.round(((data.emotionScore - 1) / 9) * 120);
                cell.style.backgroundColor = `hsla(${hue}, 55%, 75%, 0.35)`;
            }

            if (data && data.taskCount > 0) {
                const dots = cell.createDiv('af-cal-dots');
                for (let i = 0; i < Math.min(data.taskCount, 5); i++) {
                    const dot = dots.createEl('span', { cls: 'af-cal-dot' });
                    if (data.completedCount > i) dot.addClass('af-cal-dot-done');
                }
            }

            if (data?.status === 'completed') {
                cell.createEl('div', { cls: 'af-cal-status-badge af-cal-status-done', text: '✓' });
            }

            if (data?.filePath) {
                cell.addClass('af-cal-cell-clickable');
                cell.addEventListener('click', () => {
                    const f = this.app.vault.getAbstractFileByPath(data.filePath);
                    if (f && f instanceof TFile) this.app.workspace.getLeaf().openFile(f);
                });
            }
        }
    }

    // --- Dashboard section ---

    private async renderReviewDashboard(panel: HTMLElement): Promise<void> {

        // Dashboard cards rendered as individual pyramid layers

        // Gather week data
        const folder = this.plugin.settings.dailyFolder;
        const weekStart = moment().startOf('isoWeek');
        let totalTasks = 0, completedTasks = 0;
        const days: { date: string; emotionScore: number | null }[] = [];

        for (let i = 0; i < 7; i++) {
            const d = moment(weekStart).add(i, 'days');
            const dateStr = d.format('YYYY-MM-DD');
            const path = `${folder}/${dateStr}.md`;
            const file = this.app.vault.getAbstractFileByPath(path);
            let emotionScore: number | null = null;

            if (file && file instanceof TFile) {
                try {
                    const content = await this.app.vault.read(file);
                    emotionScore = this.parseNoteScores(content);
                    const allT = content.match(/^- \[[ x]\] /gm);
                    const doneT = content.match(/^- \[x\] /gm);
                    totalTasks += allT ? allT.length : 0;
                    completedTasks += doneT ? doneT.length : 0;
                } catch { /* skip */ }
            }
            days.push({ date: dateStr, emotionScore });
        }

        // Card 1: Progress
        const progressCard = panel.createDiv('af-pyramid-layer af-dash-card af-dash-card-progress');
        const progressHeader = progressCard.createDiv('af-pyramid-layer-header');
        progressHeader.createEl('span', { cls: 'af-pyramid-layer-icon', text: '📋' });
        progressHeader.createEl('span', { cls: 'af-pyramid-layer-title', text: '本周进度' });
        const progressBody = progressCard.createDiv('af-dash-card-body');
        const pct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
        const pInfo = progressBody.createDiv('af-dash-progress-info');
        pInfo.createEl('span', { cls: 'af-dash-progress-number', text: `${completedTasks}/${totalTasks}` });
        pInfo.createEl('span', { cls: 'af-dash-progress-pct', text: `${pct}%` });
        const barOuter = progressBody.createDiv('af-dash-progress-bar-outer');
        const barInner = barOuter.createDiv('af-dash-progress-bar-inner');
        barInner.style.width = `${pct}%`;

        // Card 2: Emotion trend
        const emotionCard = panel.createDiv('af-pyramid-layer af-dash-card af-dash-card-emotion');
        const emotionHeader = emotionCard.createDiv('af-pyramid-layer-header');
        emotionHeader.createEl('span', { cls: 'af-pyramid-layer-icon', text: '💭' });
        emotionHeader.createEl('span', { cls: 'af-pyramid-layer-title', text: '本周情绪' });
        const emotionBody = emotionCard.createDiv('af-dash-card-body');
        const chart = emotionBody.createDiv('af-dash-chart');
        const dayLabels = ['一', '二', '三', '四', '五', '六', '日'];
        const today = moment();

        for (let i = 0; i < 7; i++) {
            const dayStart = moment(today).startOf('isoWeek').add(i, 'days');
            const dayData = days.find(dd => dd.date === dayStart.format('YYYY-MM-DD'));
            const barCol = chart.createDiv('af-dash-chart-col');
            const score = dayData?.emotionScore;

            const bWrap = barCol.createDiv('af-dash-chart-bar-wrap');
            if (score) {
                const barH = (score / 10) * 100;
                const bar = bWrap.createDiv('af-dash-chart-bar');
                bar.style.height = `${barH}%`;
                const hue = Math.round(((score - 1) / 9) * 120);
                bar.style.backgroundColor = `hsl(${hue}, 55%, 60%)`;
                bWrap.createEl('span', { cls: 'af-dash-chart-score', text: `${score}` });
            }

            barCol.createEl('span', {
                cls: `af-dash-chart-label ${dayStart.isSame(today, 'day') ? 'af-dash-chart-label-today' : ''}`,
                text: dayLabels[i],
            });
        }

        // Card 3: Principle + Pattern (combined)
        const insightCard = panel.createDiv('af-pyramid-layer af-dash-card af-dash-card-insight');
        const insightHeader = insightCard.createDiv('af-pyramid-layer-header');
        insightHeader.createEl('span', { cls: 'af-pyramid-layer-icon', text: '💡' });
        insightHeader.createEl('span', { cls: 'af-pyramid-layer-title', text: '洞察' });
        const insightBody = insightCard.createDiv('af-dash-card-body');

        // Principle section
        let principle: string | null = null;
        const pPath = `${this.plugin.settings.archiveFolder}/Insights/principles.md`;
        const pFile = this.app.vault.getAbstractFileByPath(pPath);
        if (pFile && pFile instanceof TFile) {
            try {
                const content = await this.app.vault.read(pFile);
                const lines = content.split('\n').filter(l => l.startsWith('- ')).map(l => l.substring(2).trim());
                if (lines.length) principle = lines[Math.floor(Math.random() * lines.length)];
            } catch { /* skip */ }
        }
        insightBody.createEl('blockquote', { cls: 'af-dash-quote', text: principle || '尚无原则数据' });

        // Pattern section
        let pattern: string | null = null;
        const ptPath = `${this.plugin.settings.archiveFolder}/Insights/patterns.md`;
        const ptFile = this.app.vault.getAbstractFileByPath(ptPath);
        if (ptFile && ptFile instanceof TFile) {
            try {
                const content = await this.app.vault.read(ptFile);
                const lines = content.split('\n').filter(l => l.startsWith('- ')).map(l => l.substring(2).trim());
                if (lines.length) pattern = lines[lines.length - 1];
            } catch { /* skip */ }
        }
        if (pattern) {
            insightBody.createEl('p', { cls: 'af-dash-pattern', text: `🔄 ${pattern}` });
        }

        // Card 4: Quick links
        const linksCard = panel.createDiv('af-pyramid-layer af-dash-card af-dash-card-links');
        const linksHeader = linksCard.createDiv('af-pyramid-layer-header');
        linksHeader.createEl('span', { cls: 'af-pyramid-layer-icon', text: '🚀' });
        linksHeader.createEl('span', { cls: 'af-pyramid-layer-title', text: '快速入口' });
        const linkGrid = linksCard.createDiv('af-dash-link-grid');

        const makeLink = (icon: string, label: string, onClick: () => void) => {
            const link = linkGrid.createDiv('af-dash-link');
            link.createEl('span', { cls: 'af-dash-link-icon', text: icon });
            link.createEl('span', { cls: 'af-dash-link-label', text: label });
            link.addEventListener('click', onClick);
        };

        makeLink('📝', '今日日记', async () => {
            const f = await this.plugin.vaultManager.getOrCreateDailyNote();
            this.app.workspace.getLeaf().openFile(f);
        });
        makeLink('📅', '周计划', async () => {
            try {
                const ed = this.plugin.vaultManager.getEffectiveDate();
                const tmpl = this.plugin.templateManager.getWeeklyPlanTemplate(`W${ed.format('ww')}`, ed.format('YYYY-MM'));
                const f = await this.plugin.vaultManager.getOrCreateWeeklyPlan(undefined, tmpl);
                this.app.workspace.getLeaf().openFile(f);
            } catch { /* skip */ }
        });
        makeLink('📆', '月计划', async () => {
            try {
                const ed = this.plugin.vaultManager.getEffectiveDate();
                const tmpl = this.plugin.templateManager.getMonthlyPlanTemplate(ed.format('YYYY-MM'));
                const f = await this.plugin.vaultManager.getOrCreateMonthlyPlan(undefined, tmpl);
                this.app.workspace.getLeaf().openFile(f);
            } catch { /* skip */ }
        });
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

**☀️ 晨间** — 对标计划，规划今日任务
**🌙 晚间** — 回顾一天，记录成就与情绪
**💡 洞察** — 生成洞察报告，随时聊

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
    private async startMorningSOP(): Promise<void> {
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
    private async startEveningSOP(): Promise<void> {
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
    // Multi-task input UI
    // =========================================================================

    /**
     * Show the multi-task input UI, replacing the normal textarea
     */
    showTaskInput(prefillTasks?: { text: string; subtasks: string[] }[]): void {
        if (this.isTaskInputMode) return;

        this.isTaskInputMode = true;
        this.taskData = [];

        // Hide normal input
        this.inputContainer.style.display = 'none';

        // Create task input container after messages
        this.taskInputContainer = this.containerEl.children[1].createDiv('ai-flow-task-input-container');

        // Header
        const header = this.taskInputContainer.createDiv('ai-flow-task-input-header');
        header.createSpan({ text: '📋 输入今日任务' });

        // Task rows container
        const rowsContainer = this.taskInputContainer.createDiv('ai-flow-task-rows');

        // Add rows: pre-filled or 3 empty
        if (prefillTasks && prefillTasks.length > 0) {
            for (const task of prefillTasks) {
                this.addTaskRow(rowsContainer, task.text, task.subtasks);
            }
            this.addTaskRow(rowsContainer);
        } else {
            for (let i = 0; i < 3; i++) {
                this.addTaskRow(rowsContainer);
            }
        }

        // Add task button
        const addBtn = this.taskInputContainer.createEl('button', {
            cls: 'ai-flow-task-add-btn',
            text: '＋ 添加任务',
        });
        addBtn.addEventListener('click', () => {
            this.addTaskRow(rowsContainer);
            const lastData = this.taskData[this.taskData.length - 1];
            if (lastData) lastData.field.focus();
        });

        // Submit button
        const submitBtn = this.taskInputContainer.createEl('button', {
            cls: 'ai-flow-task-submit-btn',
            text: '✅ 确认提交',
        });
        submitBtn.addEventListener('click', () => this.submitTasks());

        // Focus first empty input
        const firstEmpty = this.taskData.find((d) => !d.field.value);
        if (firstEmpty) {
            firstEmpty.field.focus();
        } else if (this.taskData[0]) {
            this.taskData[0].field.focus();
        }

        this.scrollToBottom();
    }

    /**
     * Add a single task input row with optional sub-task toggle
     */
    private addTaskRow(container: HTMLElement, prefillValue?: string, prefillSubtasks?: string[]): void {
        const row = container.createDiv('ai-flow-task-row');

        const index = this.taskData.length + 1;
        row.createSpan({ cls: 'ai-flow-task-label', text: `${index}.` });

        const input = row.createEl('input', {
            cls: 'ai-flow-task-field',
            attr: {
                type: 'text',
                placeholder: `任务 ${index}...`,
            },
        });

        if (prefillValue) {
            input.value = prefillValue;
        }

        // Action buttons container
        const actions = row.createDiv('ai-flow-task-actions');

        // Sub-task toggle button
        const subtaskBtn = actions.createEl('button', {
            cls: 'ai-flow-task-subtask-btn',
            attr: { 'aria-label': '子任务' },
        });
        setIcon(subtaskBtn, 'list-tree');

        // Remove button
        const removeBtn = actions.createEl('button', {
            cls: 'ai-flow-task-remove-btn',
            attr: { 'aria-label': '删除' },
        });
        setIcon(removeBtn, 'x');

        // Data for this task
        const taskEntry = {
            field: input,
            subtaskFields: [] as HTMLInputElement[],
            subtaskContainer: null as HTMLElement | null,
        };
        this.taskData.push(taskEntry);

        // Sub-task toggle logic
        subtaskBtn.addEventListener('click', () => {
            if (taskEntry.subtaskContainer) {
                // Collapse sub-tasks
                taskEntry.subtaskContainer.remove();
                taskEntry.subtaskContainer = null;
                taskEntry.subtaskFields = [];
                subtaskBtn.removeClass('is-expanded');
            } else {
                // Expand sub-tasks
                subtaskBtn.addClass('is-expanded');
                const subContainer = container.createDiv('ai-flow-subtask-container');
                taskEntry.subtaskContainer = subContainer;

                // Insert after this row
                row.after(subContainer);

                const subRows = subContainer.createDiv('ai-flow-subtask-rows');
                this.addSubtaskRow(taskEntry, subRows);

                const addSubBtn = subContainer.createEl('button', {
                    cls: 'ai-flow-subtask-add-btn',
                });
                setIcon(addSubBtn, 'plus');
                addSubBtn.createSpan({ text: '添加子任务' });
                addSubBtn.addEventListener('click', () => {
                    this.addSubtaskRow(taskEntry, subRows);
                    const lastSub = taskEntry.subtaskFields[taskEntry.subtaskFields.length - 1];
                    if (lastSub) lastSub.focus();
                });
            }
        });

        // Enter key: add new row if this is the last one
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const idx = this.taskData.indexOf(taskEntry);
                if (idx === this.taskData.length - 1) {
                    this.addTaskRow(container);
                    this.taskData[this.taskData.length - 1].field.focus();
                    this.updateTaskLabels();
                } else {
                    this.taskData[idx + 1].field.focus();
                }
            }
        });

        // Remove button logic
        removeBtn.addEventListener('click', () => {
            if (this.taskData.length <= 1) return;
            const idx = this.taskData.indexOf(taskEntry);
            // Also remove sub-task container
            if (taskEntry.subtaskContainer) {
                taskEntry.subtaskContainer.remove();
            }
            this.taskData.splice(idx, 1);
            row.remove();
            this.updateTaskLabels();
        });

        // Auto-expand sub-tasks if there are pre-filled subtasks
        if (prefillSubtasks && prefillSubtasks.length > 0) {
            subtaskBtn.click();
            // Fill in the first row that was auto-created
            if (taskEntry.subtaskFields[0] && prefillSubtasks[0]) {
                taskEntry.subtaskFields[0].value = prefillSubtasks[0];
            }
            // Add remaining subtask rows
            const subRows = taskEntry.subtaskContainer?.querySelector('.ai-flow-subtask-rows') as HTMLElement;
            if (subRows) {
                for (let i = 1; i < prefillSubtasks.length; i++) {
                    this.addSubtaskRow(taskEntry, subRows, prefillSubtasks[i]);
                }
            }
        }
    }

    /**
     * Add a sub-task row
     */
    private addSubtaskRow(
        taskEntry: { subtaskFields: HTMLInputElement[] },
        container: HTMLElement,
        prefillValue?: string
    ): void {
        const subRow = container.createDiv('ai-flow-subtask-row');
        subRow.createSpan({ cls: 'ai-flow-subtask-bullet', text: '◦' });

        const subInput = subRow.createEl('input', {
            cls: 'ai-flow-subtask-field',
            attr: {
                type: 'text',
                placeholder: '子任务...',
            },
        });

        if (prefillValue) {
            subInput.value = prefillValue;
        }

        const subRemoveBtn = subRow.createEl('button', {
            cls: 'ai-flow-subtask-remove-btn',
            attr: { 'aria-label': '删除子任务' },
        });
        setIcon(subRemoveBtn, 'x');
        subRemoveBtn.addEventListener('click', () => {
            const idx = taskEntry.subtaskFields.indexOf(subInput);
            taskEntry.subtaskFields.splice(idx, 1);
            subRow.remove();
        });

        // Enter key: add new sub-task row
        subInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.addSubtaskRow(taskEntry, container);
                const lastSub = taskEntry.subtaskFields[taskEntry.subtaskFields.length - 1];
                if (lastSub) lastSub.focus();
            }
        });

        taskEntry.subtaskFields.push(subInput);
    }

    /**
     * Update task row labels after add/remove
     */
    private updateTaskLabels(): void {
        this.taskData.forEach((entry, i) => {
            const row = entry.field.parentElement;
            if (row) {
                const label = row.querySelector('.ai-flow-task-label');
                if (label) label.textContent = `${i + 1}.`;
                entry.field.placeholder = `任务 ${i + 1}...`;
            }
        });
    }

    /**
     * Submit tasks from the multi-task input
     */
    private async submitTasks(): Promise<void> {
        // Collect task data with sub-tasks
        const taskItems: { text: string; subtasks: string[] }[] = [];
        for (const entry of this.taskData) {
            const text = entry.field.value.trim();
            if (!text) continue;
            const subtasks = entry.subtaskFields
                .map((f) => f.value.trim())
                .filter((s) => s.length > 0);
            taskItems.push({ text, subtasks });
        }

        if (taskItems.length === 0) return;

        // Format display text
        const displayLines: string[] = [];
        taskItems.forEach((item, i) => {
            displayLines.push(`${i + 1}. ${item.text}`);
            item.subtasks.forEach((sub) => {
                displayLines.push(`   ◦ ${sub}`);
            });
        });
        this.addUserMessage(displayLines.join('\n'));

        // Hide task input
        this.hideTaskInput();

        try {
            // Format for daily note
            const lines: string[] = [];
            for (const item of taskItems) {
                lines.push(`- [ ] ${item.text}`);
                for (const sub of item.subtasks) {
                    lines.push(`  - [ ] ${sub}`);
                }
            }
            const formattedTasks = lines.join('\n');
            const dailyNote = await this.plugin.vaultManager.getOrCreateDailyNote();

            if (this.sopContext.type === 'morning' && !this.quickUpdateMode) {
                const energyLevel = this.sopContext.responses['energy_level'] || '?';
                const content = `**精力状态**: ${energyLevel}/10\n\n${formattedTasks}\n\n---`;
                await this.plugin.vaultManager.replaceSectionContent(
                    dailyNote.path,
                    '晨间计划',
                    content
                );
                this.streamAIMessage(`✅ 完美！今日计划已写入到你的日记中。\n\n祝你度过高效的一天！🌟`);
            } else {
                // Quick update: read existing energy level, then replace entire section
                let energyLine = '';
                try {
                    const noteFile = this.app.vault.getAbstractFileByPath(dailyNote.path);
                    if (noteFile) {
                        const noteContent = await this.app.vault.read(noteFile as any);
                        const match = noteContent.match(/\*\*精力状态\*\*: .+/);
                        if (match) {
                            energyLine = match[0] + '\n\n';
                        }
                    }
                } catch { /* ignore */ }

                const content = energyLine + formattedTasks + '\n\n---';
                await this.plugin.vaultManager.replaceSectionContent(
                    dailyNote.path,
                    '晨间计划',
                    content
                );
                this.streamAIMessage('✅ 任务已更新到今日计划中！');
            }
        } catch (error) {
            this.addAIMessage(`❌ 写入失败：${error}`);
        }

        // Sync to kanban board
        try {
            if (this.plugin.kanbanService) {
                await this.plugin.kanbanService.syncFromDailyNote();
            }
        } catch (e) {
            console.error('[ChatView] Failed to sync kanban:', e);
        }

        // Reset state
        this.quickUpdateMode = false;
        this.sopContext = { type: 'none', currentStep: 0, responses: {} };
    }

    /**
     * Hide the multi-task input and restore normal input
     */
    hideTaskInput(): void {
        if (this.taskInputContainer) {
            this.taskInputContainer.remove();
            this.taskInputContainer = null;
        }
        this.taskData = [];
        this.isTaskInputMode = false;
        this.inputContainer.style.display = '';
    }

    // =========================================================================
    // Intent detection for plan updates
    // =========================================================================

    /**
     * Start a quick plan update (skip energy question, go straight to task input)
     */
    private async startQuickPlanUpdate(): Promise<void> {
        // Read existing tasks from today's daily note
        const existingTasks = await this.getExistingTasks();
        if (existingTasks.length > 0) {
            this.addAIMessage('你可以修改或添加任务：');
        } else {
            this.addAIMessage('请输入要添加的任务：');
        }
        this.quickUpdateMode = true;
        this.showTaskInput(existingTasks.length > 0 ? existingTasks : undefined);
    }

    /**
     * Read existing tasks from today's daily note
     */
    private async getExistingTasks(): Promise<{ text: string; subtasks: string[] }[]> {
        try {
            const dailyNotePath = this.plugin.vaultManager.getDailyNotePath();
            const file = this.app.vault.getAbstractFileByPath(dailyNotePath);
            if (!file) return [];
            const content = await this.app.vault.read(file as any);
            const tasks: { text: string; subtasks: string[] }[] = [];
            const lines = content.split('\n');
            for (const line of lines) {
                // Main task: - [ ] text
                const mainMatch = line.match(/^- \[ \] (.+)$/);
                if (mainMatch) {
                    tasks.push({ text: mainMatch[1].trim(), subtasks: [] });
                    continue;
                }
                // Sub-task: (2+ spaces)- [ ] text
                const subMatch = line.match(/^\s{2,}- \[ \] (.+)$/);
                if (subMatch && tasks.length > 0) {
                    tasks[tasks.length - 1].subtasks.push(subMatch[1].trim());
                }
            }
            return tasks;
        } catch {
            return [];
        }
    }

    /**
     * Detect if the user wants to update a plan
     */
    private detectPlanUpdateIntent(content: string): boolean {
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
    private showPlanUpdateOptions(): void {
        const messageEl = this.createMessageElement('ai');

        const text = messageEl.createDiv();
        text.textContent = '你想更新哪个计划？';

        const buttons = messageEl.createDiv('ai-flow-plan-buttons');

        const todayBtn = buttons.createEl('button', {
            cls: 'ai-flow-plan-option-btn',
            text: '📋 更新今日计划',
        });
        todayBtn.addEventListener('click', () => {
            this.startQuickPlanUpdate();
        });

        const weekBtn = buttons.createEl('button', {
            cls: 'ai-flow-plan-option-btn',
            text: '📅 更新周计划',
        });
        weekBtn.addEventListener('click', async () => {
            try {
                const effectiveDate = this.plugin.vaultManager.getEffectiveDate();
                const weekNumber = `W${effectiveDate.format('ww')}`;
                const monthRef = effectiveDate.format('YYYY-MM');
                const template = this.plugin.templateManager.getWeeklyPlanTemplate(weekNumber, monthRef);
                const file = await this.plugin.vaultManager.getOrCreateWeeklyPlan(undefined, template);
                const leaf = this.app.workspace.getLeaf();
                await leaf.openFile(file);
                this.addAIMessage('✅ 已打开本周计划！');
            } catch (e) {
                this.addAIMessage(`❌ 创建周计划失败：${e}`);
            }
        });

        const monthBtn = buttons.createEl('button', {
            cls: 'ai-flow-plan-option-btn',
            text: '📆 更新月计划',
        });
        monthBtn.addEventListener('click', async () => {
            try {
                const effectiveDate = this.plugin.vaultManager.getEffectiveDate();
                const yearMonth = effectiveDate.format('YYYY-MM');
                const template = this.plugin.templateManager.getMonthlyPlanTemplate(yearMonth);
                const file = await this.plugin.vaultManager.getOrCreateMonthlyPlan(undefined, template);
                const leaf = this.app.workspace.getLeaf();
                await leaf.openFile(file);
                this.addAIMessage('✅ 已打开本月计划！');
            } catch (e) {
                this.addAIMessage(`❌ 创建月计划失败：${e}`);
            }
        });

        this.scrollToBottom();
    }

    // =========================================================================
    // Message handling
    // =========================================================================

    /**
     * Send a message
     */
    private async sendMessage(): Promise<void> {
        const content = this.inputEl.value.trim();
        if (!content || this.isProcessing) return;

        // Add user message
        this.addUserMessage(content);
        this.inputEl.value = '';
        this.inputEl.style.height = 'auto';
        this.inputEl.dispatchEvent(new Event('input'));

        // Check for plan update / adjust intent (works in ANY mode)
        const adjustKeywords = ['调整计划', '修改计划', '调整任务', '修改任务', '改一下', '调整一下'];
        const isAdjust = adjustKeywords.some((k) => content.includes(k));
        if (isAdjust) {
            this.addAIMessage('好的，请重新输入任务：');
            this.quickUpdateMode = true;
            this.sopContext = { type: 'none', currentStep: 0, responses: {} };
            const existingTasks = await this.getExistingTasks();
            this.showTaskInput(existingTasks.length > 0 ? existingTasks : undefined);
            return;
        }

        // Check for plan update intent in free chat mode (e.g. "更新计划")
        if (this.sopContext.type === 'none' && this.detectPlanUpdateIntent(content)) {
            this.showPlanUpdateOptions();
            return;
        }

        // Process based on SOP context
        if (this.sopContext.type === 'morning') {
            await this.morningSOP.handleResponse(content, this.sopContext, (message) => {
                this.streamAIMessage(message);
            }, () => {
                // Callback to show task input UI
                this.showTaskInput();
            });
        } else if (this.sopContext.type === 'evening') {
            await this.eveningSOP.handleResponse(content, this.sopContext, (message) => {
                this.streamAIMessage(message);
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
        this.isProcessing = true;
        this.sendButton.disabled = true;

        // Add user message to history
        this.messages.push({
            role: 'user',
            content,
            timestamp: Date.now(),
        });

        // Get AI response
        const messageEl = this.createMessageElement('ai');
        let fullResponse = '';

        try {
            const provider = this.plugin.getAIProvider();

            // Check if API key is configured
            const activeProvider = this.plugin.settings.activeProvider;
            const providerConfig = this.plugin.settings.providers[activeProvider];
            if (!providerConfig.apiKey) {
                messageEl.empty();
                MarkdownRenderer.render(
                    this.app,
                    `⚠️ **未配置 API Key**\n\n请先在 Obsidian 设置 → Dailot 中配置 ${activeProvider.toUpperCase()} 的 API Key。\n\n配置完成后即可开始对话。`,
                    messageEl,
                    '',
                    this
                );
                this.isProcessing = false;
                this.sendButton.disabled = false;
                return;
            }

            const userProfile = await this.plugin.vaultManager.getUserProfileContent();

            const systemPrompt = `你是一位温暖、有洞察力的生活教练和思考伙伴。

你的职责是：
1. 倾听用户的想法，给予理解和支持
2. 通过提问帮助用户深入思考
3. 在适当的时候提供建议和新视角
4. 帮助用户发现自己的模式和成长机会

重要：如果用户提到想要"更新计划"、"修改计划"、"调整任务"等，请告诉他们点击上方的"晨间"按钮来重新规划今日任务，或者直接说"更新计划"让系统引导操作。

${userProfile ? `用户背景：\n${userProfile}` : ''}

请用中文回复，保持温暖友善的语气。`;

            await provider.sendMessage(this.messages, systemPrompt, (chunk) => {
                fullResponse += chunk;
                messageEl.empty();
                MarkdownRenderer.render(this.app, fullResponse, messageEl, '', this);
                this.scrollToBottom();
            });

            // Add to message history
            this.messages.push({
                role: 'assistant',
                content: fullResponse,
                timestamp: Date.now(),
            });
        } catch (error) {
            messageEl.empty();
            const errMsg = String(error);
            if (errMsg.includes('401') || errMsg.includes('403') || errMsg.includes('Unauthorized')) {
                MarkdownRenderer.render(
                    this.app,
                    `🔑 **API Key 无效或已过期**\n\n请检查 Obsidian 设置 → Dailot 中的 API Key 是否正确。`,
                    messageEl,
                    '',
                    this
                );
            } else if (errMsg.includes('429') || errMsg.includes('rate')) {
                MarkdownRenderer.render(
                    this.app,
                    `⏳ **请求过于频繁**\n\n请稍后再试，或切换到其他 AI 提供商。`,
                    messageEl,
                    '',
                    this
                );
            } else if (errMsg.includes('network') || errMsg.includes('fetch') || errMsg.includes('Failed to fetch')) {
                MarkdownRenderer.render(
                    this.app,
                    `🌐 **网络连接失败**\n\n请检查网络连接后重试。如果使用代理，请确认代理设置正确。`,
                    messageEl,
                    '',
                    this
                );
            } else {
                messageEl.createSpan({ text: `抱歉，发生了错误：${error}` });
            }
            messageEl.addClass('ai-flow-message-error');
        }

        this.isProcessing = false;
        this.sendButton.disabled = false;
    }

    /**
     * Add a user message to the UI
     */
    private addUserMessage(content: string): void {
        const messageEl = this.createMessageElement('user');
        messageEl.setText(content);
        this.scrollToBottom();
    }

    /**
     * Add an AI message to the UI
     */
    private addAIMessage(content: string): void {
        const messageEl = this.createMessageElement('ai');
        MarkdownRenderer.render(this.app, content, messageEl, '', this);
        this.scrollToBottom();
    }

    /**
     * Stream an AI message (for SOP responses)
     */
    private streamAIMessage(content: string): void {
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
    private createMessageElement(type: 'user' | 'ai'): HTMLElement {
        const wrapper = this.messagesContainer.createDiv(
            `ai-flow-message ai-flow-message-${type}`
        );

        const avatar = wrapper.createDiv('ai-flow-message-avatar');
        setIcon(avatar, type === 'user' ? 'user' : 'sparkles');

        const content = wrapper.createDiv('ai-flow-message-content');

        return content;
    }

    /**
     * Scroll to bottom of messages
     */
    private scrollToBottom(): void {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    // =========================================================================
    // Insight Generation
    // =========================================================================

    /**
     * Trigger insight generation (public, called from main.ts)
     */
    triggerInsight(type: 'weekly' | 'monthly'): void {
        const label = type === 'weekly' ? '本周' : '本月';
        this.addAIMessage(`📊 正在生成${label}洞察报告，请稍候...`);

        const messageEl = this.createMessageElement('ai');
        const insightService = this.plugin.insightService;

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
                MarkdownRenderer.render(this.app, newContent, messageEl, '', this);
                this.scrollToBottom();
            },
            (fullReport: string) => {
                if (fullReport) {
                    // Final render
                    messageEl.empty();
                    MarkdownRenderer.render(this.app, fullReport, messageEl, '', this);
                    this.addAIMessage('📁 报告已保存到 `03-Archive/Insights/` 目录。');
                }
                this.scrollToBottom();
            }
        );
    }

    /**
     * Trigger profile suggestion generation
     */
    private triggerProfileSuggestion(): void {
        this.addAIMessage('👤 正在分析你的日记数据，生成用户画像建议...');

        const messageEl = this.createMessageElement('ai');
        const insightService = this.plugin.insightService;

        insightService.generateProfileSuggestions((chunk: string) => {
            messageEl.empty();
            const existing = messageEl.getAttribute('data-content') || '';
            const newContent = existing + chunk;
            messageEl.setAttribute('data-content', newContent);
            MarkdownRenderer.render(this.app, newContent, messageEl, '', this);
            this.scrollToBottom();
        });
    }
}
