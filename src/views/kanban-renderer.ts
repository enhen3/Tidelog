/**
 * Kanban Renderer - Renders the pyramid-style Kanban tab
 * Extracted from chat-view.ts for maintainability.
 */

import { TFile, moment } from 'obsidian';
import type TideLogPlugin from '../main';
import type { App } from 'obsidian';

/** Minimal interface for the host view that owns this renderer. */
export interface KanbanHost {
    plugin: TideLogPlugin;
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
        panel.addClass('tl-kanban-container');
        panel.addClass('tl-pyramid');

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
        const layer = panel.createDiv('tl-pyramid-layer tl-pyramid-month');

        // Compute target month
        const targetMonth = moment().add(h.kanbanMonthOffset, 'months');
        const monthLabel = targetMonth.format('M月');
        const monthRef = targetMonth.format('YYYY-MM');

        // Header with < > nav
        const header = layer.createDiv('tl-pyramid-layer-header tl-pyramid-month-header');
        const navLeft = header.createEl('button', { cls: 'tl-pyramid-nav-btn', text: '‹' });
        navLeft.addEventListener('click', () => { h.kanbanMonthOffset--; h.invalidateTabCache('kanban'); h.switchTab('kanban'); });

        const titleArea = header.createDiv('tl-pyramid-week-title-area');
        titleArea.createEl('span', { cls: 'tl-pyramid-layer-icon', text: '🏔️' });
        titleArea.createEl('span', { cls: 'tl-pyramid-layer-title', text: `${monthLabel}目标` });
        titleArea.addClass('tl-clickable');

        const navRight = header.createEl('button', { cls: 'tl-pyramid-nav-btn', text: '›' });
        navRight.addEventListener('click', () => { h.kanbanMonthOffset++; h.invalidateTabCache('kanban'); h.switchTab('kanban'); });

        if (h.kanbanMonthOffset !== 0) {
            const resetBtn = header.createEl('button', { cls: 'tl-pyramid-today-btn', text: '本月' });
            resetBtn.addEventListener('click', () => { h.kanbanMonthOffset = 0; h.invalidateTabCache('kanban'); h.switchTab('kanban'); });
        }

        // Try to read monthly plan
        let file: TFile | null = null;
        try {
            const tmpl = h.plugin.templateManager.getMonthlyPlanTemplate(monthRef);
            file = await h.plugin.vaultManager.getOrCreateMonthlyPlan(targetMonth.toDate(), tmpl);
        } catch { /* skip */ }

        if (!file) {
            layer.createDiv({ cls: 'tl-pyramid-empty', text: '暂无月计划' });
            return;
        }

        // Click title to open file
        titleArea.addEventListener('click', () => {
            if (file) void h.app.workspace.getLeaf().openFile(file);
        });

        const content = await h.app.vault.read(file);
        const allItems = h.parseMdTasks(content);

        // Filter for goal/milestone sections
        const goalSections = ['月度目标', '关键里程碑'];
        const goals = allItems.filter(i => goalSections.some(s => i.section.includes(s)));

        // Progress bar for monthly goals (count ALL items)
        if (goals.length > 0) {
            const doneCount = goals.filter(g => g.done).length;
            const progressWrap = layer.createDiv('tl-pyramid-progress-wrap');
            progressWrap.addClass('tl-pyramid-progress-inline');
            const progressBar = progressWrap.createDiv('tl-pyramid-progress-bar');
            const progressFill = progressBar.createDiv('tl-pyramid-progress-fill tl-dynamic-width');
            progressFill.style.setProperty('--tl-width', `${(doneCount / goals.length) * 100}%`);
            progressWrap.createEl('span', { cls: 'tl-pyramid-progress-label', text: `${doneCount}/${goals.length} 完成` });
        }

        // Task list body (same pattern as weekly/daily)
        const body = layer.createDiv('tl-pyramid-month-detail');
        if (goals.length === 0) {
            body.createDiv({ cls: 'tl-pyramid-empty', text: '暂无本月目标' });
        } else {
            for (const goal of goals) {
                const card = body.createDiv({ cls: `tl-pyramid-task ${goal.done ? 'tl-pyramid-task-done' : ''}` });
                if (goal.indent > 0) {
                    const indentLevel = Math.min(goal.indent, 3);
                    card.addClass(`tl-indent-${indentLevel}`);
                    card.addClass('tl-pyramid-task-sub');
                }
                const cb = card.createEl('input', { type: 'checkbox' });
                cb.checked = goal.done;
                cb.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    void (async () => {
                        if (file) await h.toggleMdTask(file, goal.text, goal.done);
                        // Update UI in-place to avoid scroll reset
                        goal.done = !goal.done;
                        cb.checked = goal.done;
                        card.toggleClass('tl-pyramid-task-done', goal.done);
                        label.toggleClass('tl-text-done', goal.done);
                    })();
                });
                const label = card.createEl('span', { cls: 'tl-pyramid-task-text', text: goal.text });
                if (goal.done) { label.addClass('tl-text-done'); }
            }
        }
    }

    // ──────────────────────────────────────────────────────
    // Layer 2: Weekly Tasks
    // ──────────────────────────────────────────────────────

    private async renderPyramidWeek(panel: HTMLElement, targetDate: ReturnType<typeof moment>, weekStart: ReturnType<typeof moment>): Promise<void> {
        const h = this.host;
        const layer = panel.createDiv('tl-pyramid-layer tl-pyramid-week');

        const weekEnd = moment(targetDate).endOf('isoWeek');
        const weekNum = targetDate.isoWeek();
        const weekLabel = `${weekStart.format('M月D日')}～${weekEnd.format('M月D日')} 第${weekNum}周目标`;
        const weekRef = `W${targetDate.format('ww')}`;

        // Header with < > nav — click title opens weekly plan
        const header = layer.createDiv('tl-pyramid-layer-header tl-pyramid-week-header');
        const navLeft = header.createEl('button', { cls: 'tl-pyramid-nav-btn', text: '‹' });
        navLeft.addEventListener('click', () => { h.kanbanWeekOffset--; h.invalidateTabCache('kanban'); h.switchTab('kanban'); });

        const titleArea = header.createDiv('tl-pyramid-week-title-area');
        titleArea.createEl('span', { cls: 'tl-pyramid-layer-icon', text: '📅' });
        titleArea.createEl('span', { cls: 'tl-pyramid-layer-title', text: weekLabel });
        titleArea.addClass('tl-clickable');

        const navRight = header.createEl('button', { cls: 'tl-pyramid-nav-btn', text: '›' });
        navRight.addEventListener('click', () => { h.kanbanWeekOffset++; h.invalidateTabCache('kanban'); h.switchTab('kanban'); });

        if (h.kanbanWeekOffset !== 0) {
            const todayBtn = header.createEl('button', { cls: 'tl-pyramid-today-btn', text: '本周' });
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
            if (file) void h.app.workspace.getLeaf().openFile(file);
        });

        const body = layer.createDiv('tl-pyramid-week-body');

        if (!file) {
            body.createDiv({ cls: 'tl-pyramid-empty', text: '暂无周计划' });
            return;
        }

        const content = await h.app.vault.read(file);
        const allItems = h.parseMdTasks(content);

        // Merge 本周目标 + 关键任务 + 本周重点 into one view
        const weekSections = ['关键任务', '本周目标', '本周重点'];
        const keyItems = allItems.filter(i => weekSections.some(s => i.section.includes(s)));

        if (keyItems.length === 0) {
            body.createDiv({ cls: 'tl-pyramid-empty', text: '暂无本周任务' });
        } else {
            // Progress bar (count all items)
            const doneCount = keyItems.filter(t => t.done).length;
            if (keyItems.length > 0) {
                const progressWrap = body.createDiv('tl-pyramid-progress-wrap');
                const progressBar = progressWrap.createDiv('tl-pyramid-progress-bar');
                const progressFill = progressBar.createDiv('tl-pyramid-progress-fill tl-dynamic-width');
                progressFill.style.setProperty('--tl-width', `${(doneCount / keyItems.length) * 100}%`);
                progressWrap.createEl('span', { cls: 'tl-pyramid-progress-label', text: `${doneCount}/${keyItems.length} 完成` });
            }

            // Render all items with checkboxes
            for (const item of keyItems) {
                const card = body.createDiv({ cls: `tl-pyramid-task ${item.done ? 'tl-pyramid-task-done' : ''}` });
                if (item.indent > 0) {
                    const indentLevel = Math.min(item.indent, 3);
                    card.addClass(`tl-indent-${indentLevel}`);
                    card.addClass('tl-pyramid-task-sub');
                }
                const cb = card.createEl('input', { type: 'checkbox' });
                cb.checked = item.done;
                cb.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    void (async () => {
                        if (file) await h.toggleMdTask(file, item.text, item.done);
                        // Update UI in-place to avoid scroll reset
                        item.done = !item.done;
                        cb.checked = item.done;
                        card.toggleClass('tl-pyramid-task-done', item.done);
                        label.toggleClass('tl-text-done', item.done);
                    })();
                });
                const label = card.createEl('span', { cls: 'tl-pyramid-task-text', text: item.text });
                if (item.done) { label.addClass('tl-text-done'); }
            }
        }
    }

    // ──────────────────────────────────────────────────────
    // Layer 3: Daily Tasks
    // ──────────────────────────────────────────────────────

    private async renderPyramidDaily(panel: HTMLElement): Promise<void> {
        const h = this.host;
        const layer = panel.createDiv('tl-pyramid-layer tl-pyramid-daily');

        const DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
        const targetDay = moment().add(h.kanbanDayOffset, 'days');
        const dayIdx = targetDay.isoWeekday() - 1;
        const dayLabel = `${targetDay.format('M月D日')} ${DAY_LABELS[dayIdx]}任务`;
        const isToday = h.kanbanDayOffset === 0;

        // Header with < > nav (day-level)
        const header = layer.createDiv('tl-pyramid-layer-header tl-pyramid-daily-header');
        const navLeft = header.createEl('button', { cls: 'tl-pyramid-nav-btn', text: '‹' });
        navLeft.addEventListener('click', () => { h.kanbanDayOffset--; h.invalidateTabCache('kanban'); h.switchTab('kanban'); });

        const titleArea = header.createDiv('tl-pyramid-week-title-area');
        titleArea.createEl('span', { cls: 'tl-pyramid-layer-icon', text: '📋' });
        titleArea.createEl('span', { cls: 'tl-pyramid-layer-title', text: dayLabel });
        titleArea.addClass('tl-clickable');

        const navRight = header.createEl('button', { cls: 'tl-pyramid-nav-btn', text: '›' });
        navRight.addEventListener('click', () => { h.kanbanDayOffset++; h.invalidateTabCache('kanban'); h.switchTab('kanban'); });

        if (!isToday) {
            const resetBtn = header.createEl('button', { cls: 'tl-pyramid-today-btn', text: '今天' });
            resetBtn.addEventListener('click', () => { h.kanbanDayOffset = 0; h.invalidateTabCache('kanban'); h.switchTab('kanban'); });
        }

        // Read tasks for the single day
        const folder = h.plugin.settings.dailyFolder;
        const dateStr = targetDay.format('YYYY-MM-DD');
        const filePath = `${folder}/${dateStr}.md`;
        const file = h.app.vault.getAbstractFileByPath(filePath);

        // Click title to open file
        titleArea.addEventListener('click', () => {
            void (async () => {
                if (file && file instanceof TFile) {
                    void h.app.workspace.getLeaf().openFile(file);
                } else {
                    const f = await h.plugin.vaultManager.getOrCreateDailyNote(targetDay.toDate());
                    void h.app.workspace.getLeaf().openFile(f);
                }
            })();
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
            const progressWrap = layer.createDiv('tl-pyramid-progress-wrap');
            progressWrap.addClass('tl-pyramid-progress-inline');
            const progressBar = progressWrap.createDiv('tl-pyramid-progress-bar');
            const progressFill = progressBar.createDiv('tl-pyramid-progress-fill tl-dynamic-width');
            progressFill.style.setProperty('--tl-width', `${(doneCount / tasks.length) * 100}%`);
            progressWrap.createEl('span', { cls: 'tl-pyramid-progress-label', text: `${doneCount}/${tasks.length} 完成` });
        }

        // Task list body
        const body = layer.createDiv('tl-pyramid-daily-body');

        // Carry-forward: show unfinished tasks from past days (only for today)
        if (isToday) {
            try {
                const unfinished = await h.plugin.vaultManager.getUnfinishedTasks(3);
                // Exclude tasks that already exist in today's list
                const todayTexts = new Set(tasks.map(t => t.text));
                const carryTasks = unfinished.filter(u => !todayTexts.has(u.text));

                if (carryTasks.length > 0) {
                    const carrySection = body.createDiv('tl-carry-forward');
                    const carryHeader = carrySection.createDiv('tl-carry-forward-header');
                    carryHeader.createEl('span', { text: `📌 待继承 (${carryTasks.length})` });

                    for (const ct of carryTasks) {
                        const row = carrySection.createDiv('tl-carry-forward-row');
                        row.createEl('span', { cls: 'tl-carry-forward-text', text: ct.text });
                        row.createEl('span', { cls: 'tl-carry-forward-date', text: ct.date.substring(5) });
                        const addBtn = row.createEl('button', { cls: 'tl-carry-forward-add', text: '+' });
                        addBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            void (async () => {
                                await h.plugin.vaultManager.addTaskToDaily(ct.text);
                                row.remove();
                                h.invalidateTabCache('kanban');
                                h.switchTab('kanban');
                            })();
                        });
                    }
                }
            } catch { /* skip */ }
        }

        if (tasks.length === 0) {
            body.createDiv({ cls: 'tl-pyramid-empty', text: '暂无任务' });
        } else {
            const inProgress = tasks.filter(t => !t.done);
            const completed = tasks.filter(t => t.done);

            // In-progress section
            if (inProgress.length > 0) {
                const section = body.createDiv('tl-task-group');
                section.createDiv({ cls: 'tl-task-group-header', text: `⏳ 进行中 (${inProgress.length})` });
                for (const task of inProgress) {
                    this.renderTaskCard(section, task, filePath);
                }
            }

            // Completed section (collapsible)
            if (completed.length > 0) {
                const section = body.createDiv('tl-task-group tl-task-group-done');
                const doneHeader = section.createDiv({ cls: 'tl-task-group-header tl-task-group-header-done' });
                doneHeader.setText(`✅ 已完成 (${completed.length})`);
                const doneBody = section.createDiv('tl-task-group-body tl-task-group-collapsed');
                doneHeader.addEventListener('click', () => {
                    doneBody.toggleClass('tl-task-group-collapsed', !doneBody.hasClass('tl-task-group-collapsed'));
                    doneHeader.toggleClass('tl-task-group-header-expanded', !doneBody.hasClass('tl-task-group-collapsed'));
                });
                for (const task of completed) {
                    this.renderTaskCard(doneBody, task, filePath);
                }
            }
        }
    }

    private renderTaskCard(container: HTMLElement, task: { text: string; done: boolean; indent: number }, filePath: string): void {
        const h = this.host;
        const card = container.createDiv({ cls: `tl-pyramid-task ${task.done ? 'tl-pyramid-task-done' : ''}` });
        if (task.indent > 0) {
            const indentLevel = Math.min(task.indent, 3);
            card.addClass(`tl-indent-${indentLevel}`);
            card.addClass('tl-pyramid-task-sub');
        }
        const cb = card.createEl('input', { type: 'checkbox' });
        cb.checked = task.done;
        cb.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            void (async () => {
                const f = h.app.vault.getAbstractFileByPath(filePath);
                if (f && f instanceof TFile) {
                    await h.toggleMdTask(f, task.text, task.done);
                }
                task.done = !task.done;
                cb.checked = task.done;
                card.toggleClass('tl-pyramid-task-done', task.done);
                label.toggleClass('tl-text-done', task.done);
            })();
        });
        const label = card.createEl('span', { cls: 'tl-pyramid-task-text', text: task.text });
        if (task.done) { label.addClass('tl-text-done'); }
    }
}
