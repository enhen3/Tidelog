/**
 * Kanban Renderer - Renders the pyramid-style Kanban tab
 * Extracted from chat-view.ts for maintainability.
 */

import { TFile, moment } from 'obsidian';
import type AIFlowManagerPlugin from '../main';
import type { App } from 'obsidian';

/** Minimal interface for the host view that owns this renderer. */
export interface KanbanHost {
    plugin: AIFlowManagerPlugin;
    app: App;
    kanbanMonthOffset: number;
    kanbanWeekOffset: number;
    kanbanDayOffset: number;
    parseMdTasks(content: string): { text: string; done: boolean; isTask: boolean; section: string; indent: number }[];
    toggleMdTask(file: TFile, taskText: string, wasDone: boolean): Promise<void>;
    invalidateTabCache(tab: string): void;
    switchTab(tab: string): void;
}

export class KanbanRenderer {
    constructor(private host: KanbanHost) { }

    async render(panel: HTMLElement): Promise<void> {
        panel.addClass('af-kanban-container');
        panel.addClass('af-pyramid');

        const targetDate = moment().add(this.host.kanbanWeekOffset, 'weeks');
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
        const h = this.host;
        const layer = panel.createDiv('af-pyramid-layer af-pyramid-month');

        // Compute target month
        const targetMonth = moment().add(h.kanbanMonthOffset, 'months');
        const monthLabel = targetMonth.format('M月');
        const monthRef = targetMonth.format('YYYY-MM');

        // Header with < > nav
        const header = layer.createDiv('af-pyramid-layer-header af-pyramid-month-header');
        const navLeft = header.createEl('button', { cls: 'af-pyramid-nav-btn', text: '‹' });
        navLeft.addEventListener('click', () => { h.kanbanMonthOffset--; h.invalidateTabCache('kanban'); h.switchTab('kanban'); });

        const titleArea = header.createDiv('af-pyramid-week-title-area');
        titleArea.createEl('span', { cls: 'af-pyramid-layer-icon', text: '🏔️' });
        titleArea.createEl('span', { cls: 'af-pyramid-layer-title', text: `${monthLabel}目标` });
        titleArea.style.cursor = 'pointer';

        const navRight = header.createEl('button', { cls: 'af-pyramid-nav-btn', text: '›' });
        navRight.addEventListener('click', () => { h.kanbanMonthOffset++; h.invalidateTabCache('kanban'); h.switchTab('kanban'); });

        if (h.kanbanMonthOffset !== 0) {
            const resetBtn = header.createEl('button', { cls: 'af-pyramid-today-btn', text: '本月' });
            resetBtn.addEventListener('click', () => { h.kanbanMonthOffset = 0; h.invalidateTabCache('kanban'); h.switchTab('kanban'); });
        }

        // Try to read monthly plan
        let file: TFile | null = null;
        try {
            const tmpl = h.plugin.templateManager.getMonthlyPlanTemplate(monthRef);
            file = await h.plugin.vaultManager.getOrCreateMonthlyPlan(targetMonth.toDate(), tmpl);
        } catch { /* skip */ }

        if (!file) {
            layer.createDiv({ cls: 'af-pyramid-empty', text: '暂无月计划' });
            return;
        }

        // Click title to open file
        titleArea.addEventListener('click', () => {
            if (file) h.app.workspace.getLeaf().openFile(file);
        });

        const content = await h.app.vault.read(file);
        const allItems = h.parseMdTasks(content);

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
            body.createDiv({ cls: 'af-pyramid-empty', text: '暂无本月目标' });
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
                    if (file) await h.toggleMdTask(file, goal.text, goal.done);
                    // Update UI in-place to avoid scroll reset
                    goal.done = !goal.done;
                    cb.checked = goal.done;
                    card.toggleClass('af-pyramid-task-done', goal.done);
                    label.style.textDecoration = goal.done ? 'line-through' : '';
                    label.style.opacity = goal.done ? '0.5' : '';
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
        const h = this.host;
        const layer = panel.createDiv('af-pyramid-layer af-pyramid-week');

        const weekEnd = moment(targetDate).endOf('isoWeek');
        const weekNum = targetDate.isoWeek();
        const weekLabel = `${weekStart.format('M月D日')}～${weekEnd.format('M月D日')} 第${weekNum}周目标`;
        const weekRef = `W${targetDate.format('ww')}`;

        // Header with < > nav — click title opens weekly plan
        const header = layer.createDiv('af-pyramid-layer-header af-pyramid-week-header');
        const navLeft = header.createEl('button', { cls: 'af-pyramid-nav-btn', text: '‹' });
        navLeft.addEventListener('click', () => { h.kanbanWeekOffset--; h.invalidateTabCache('kanban'); h.switchTab('kanban'); });

        const titleArea = header.createDiv('af-pyramid-week-title-area');
        titleArea.createEl('span', { cls: 'af-pyramid-layer-icon', text: '📅' });
        titleArea.createEl('span', { cls: 'af-pyramid-layer-title', text: weekLabel });
        titleArea.style.cursor = 'pointer';

        const navRight = header.createEl('button', { cls: 'af-pyramid-nav-btn', text: '›' });
        navRight.addEventListener('click', () => { h.kanbanWeekOffset++; h.invalidateTabCache('kanban'); h.switchTab('kanban'); });

        if (h.kanbanWeekOffset !== 0) {
            const todayBtn = header.createEl('button', { cls: 'af-pyramid-today-btn', text: '本周' });
            todayBtn.addEventListener('click', () => { h.kanbanWeekOffset = 0; h.invalidateTabCache('kanban'); h.switchTab('kanban'); });
        }

        // Read weekly plan
        let file: TFile | null = null;
        const ed = h.plugin.vaultManager.getEffectiveDate(targetDate.toDate());
        try {
            const tmpl = h.plugin.templateManager.getWeeklyPlanTemplate(weekRef, ed.format('YYYY-MM'));
            file = await h.plugin.vaultManager.getOrCreateWeeklyPlan(targetDate.toDate(), tmpl);
        } catch { /* skip */ }

        // Click title area to open file
        titleArea.addEventListener('click', () => {
            if (file) h.app.workspace.getLeaf().openFile(file);
        });

        const body = layer.createDiv('af-pyramid-week-body');

        if (!file) {
            body.createDiv({ cls: 'af-pyramid-empty', text: '暂无周计划' });
            return;
        }

        const content = await h.app.vault.read(file);
        const allItems = h.parseMdTasks(content);

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
                    if (file) await h.toggleMdTask(file, item.text, item.done);
                    // Update UI in-place to avoid scroll reset
                    item.done = !item.done;
                    cb.checked = item.done;
                    card.toggleClass('af-pyramid-task-done', item.done);
                    label.style.textDecoration = item.done ? 'line-through' : '';
                    label.style.opacity = item.done ? '0.5' : '';
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
        const h = this.host;
        const layer = panel.createDiv('af-pyramid-layer af-pyramid-daily');

        const DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
        const targetDay = moment().add(h.kanbanDayOffset, 'days');
        const dayIdx = targetDay.isoWeekday() - 1;
        const dayLabel = `${targetDay.format('M月D日')} ${DAY_LABELS[dayIdx]}任务`;
        const isToday = h.kanbanDayOffset === 0;

        // Header with < > nav (day-level)
        const header = layer.createDiv('af-pyramid-layer-header af-pyramid-daily-header');
        const navLeft = header.createEl('button', { cls: 'af-pyramid-nav-btn', text: '‹' });
        navLeft.addEventListener('click', () => { h.kanbanDayOffset--; h.invalidateTabCache('kanban'); h.switchTab('kanban'); });

        const titleArea = header.createDiv('af-pyramid-week-title-area');
        titleArea.createEl('span', { cls: 'af-pyramid-layer-icon', text: '📋' });
        titleArea.createEl('span', { cls: 'af-pyramid-layer-title', text: dayLabel });
        titleArea.style.cursor = 'pointer';

        const navRight = header.createEl('button', { cls: 'af-pyramid-nav-btn', text: '›' });
        navRight.addEventListener('click', () => { h.kanbanDayOffset++; h.invalidateTabCache('kanban'); h.switchTab('kanban'); });

        if (!isToday) {
            const resetBtn = header.createEl('button', { cls: 'af-pyramid-today-btn', text: '今天' });
            resetBtn.addEventListener('click', () => { h.kanbanDayOffset = 0; h.invalidateTabCache('kanban'); h.switchTab('kanban'); });
        }

        // Read tasks for the single day
        const folder = h.plugin.settings.dailyFolder;
        const dateStr = targetDay.format('YYYY-MM-DD');
        const filePath = `${folder}/${dateStr}.md`;
        const file = h.app.vault.getAbstractFileByPath(filePath);

        // Click title to open file
        titleArea.addEventListener('click', async () => {
            if (file && file instanceof TFile) {
                h.app.workspace.getLeaf().openFile(file);
            } else {
                const f = await h.plugin.vaultManager.getOrCreateDailyNote(targetDay.toDate());
                h.app.workspace.getLeaf().openFile(f);
            }
        });

        interface DayTask { text: string; done: boolean; indent: number }
        const tasks: DayTask[] = [];
        if (file && file instanceof TFile) {
            try {
                const content = await h.app.vault.read(file);
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
                    const f = h.app.vault.getAbstractFileByPath(filePath);
                    if (f && f instanceof TFile) {
                        await h.toggleMdTask(f, task.text, task.done);
                    }
                    // Update UI in-place to avoid scroll reset
                    task.done = !task.done;
                    cb.checked = task.done;
                    card.toggleClass('af-pyramid-task-done', task.done);
                    label.style.textDecoration = task.done ? 'line-through' : '';
                    label.style.opacity = task.done ? '0.5' : '';
                });
                const label = card.createEl('span', { cls: 'af-pyramid-task-text', text: task.text });
                if (task.done) { label.style.textDecoration = 'line-through'; label.style.opacity = '0.5'; }
            }
        }
    }
}
