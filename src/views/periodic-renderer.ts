/**
 * Periodic Renderer - LifeOS-style periodic navigator
 * Replaces the old kanban-renderer with a day/week/month period selector + content preview.
 */

import { TFile, moment, setIcon } from 'obsidian';
import type TideLogPlugin from '../main';
import type { App } from 'obsidian';

export type PeriodicMode = 'day' | 'week' | 'month';

/** Host view interface */
export interface PeriodicHost {
    plugin: TideLogPlugin;
    app: App;
    periodicMode: PeriodicMode;
    periodicSelectedDate: moment.Moment;
    periodicMonthOffset: number;
    parseMdTasks(content: string): { text: string; done: boolean; isTask: boolean; section: string; indent: number }[];
    toggleMdTask(file: TFile, taskText: string, wasDone: boolean): Promise<void>;
    addMdTask(file: TFile, taskText: string, indent?: number): Promise<void>;
    addSubTask(file: TFile, parentText: string, subTaskText: string): Promise<void>;
    editMdTask(file: TFile, oldText: string, newText: string): Promise<void>;
    deleteMdTask(file: TFile, taskText: string): Promise<void>;
    setTaskIndent(file: TFile, taskText: string, newIndent: number): Promise<void>;
    reorderMdTasks(file: TFile, orderedTexts: string[]): Promise<void>;
    invalidateTabCache(tab: string): void;
    switchTab(tab: string): void;
}

export class PeriodicRenderer {
    constructor(private host: PeriodicHost) { }

    async render(panel: HTMLElement): Promise<void> {
        panel.addClass('tl-periodic');

        // Sub-tab bar: 日 | 周 | 月
        this.renderModeBar(panel);

        // Period selector + content preview
        const body = panel.createDiv('tl-periodic-body');
        const mode = this.host.periodicMode;

        if (mode === 'day') {
            await this.renderDayMode(body);
        } else if (mode === 'week') {
            await this.renderWeekMode(body);
        } else {
            await this.renderMonthMode(body);
        }
    }

    // ──────────────────────────────────────────────────────
    // Mode bar: 日 | 周 | 月
    // ──────────────────────────────────────────────────────

    private renderModeBar(panel: HTMLElement): void {
        const h = this.host;
        const bar = panel.createDiv('tl-periodic-mode-bar');
        const modes: { id: PeriodicMode; icon: string; label: string }[] = [
            { id: 'day', icon: 'sun', label: '日' },
            { id: 'week', icon: 'calendar-range', label: '周' },
            { id: 'month', icon: 'calendar', label: '月' },
        ];
        for (const m of modes) {
            const btn = bar.createEl('button', {
                cls: `tl-periodic-mode-btn ${h.periodicMode === m.id ? 'tl-periodic-mode-btn-active' : ''}`,
            });
            setIcon(btn, m.icon);
            btn.createSpan({ text: m.label });
            btn.addEventListener('click', () => {
                h.periodicMode = m.id;
                // Reset to current period when switching
                h.periodicSelectedDate = moment();
                h.periodicMonthOffset = 0;
                h.invalidateTabCache('kanban');
                h.switchTab('kanban');
            });
        }
    }

    // ──────────────────────────────────────────────────────
    // Day Mode: mini calendar + daily note preview
    // ──────────────────────────────────────────────────────

    private async renderDayMode(body: HTMLElement): Promise<void> {
        const h = this.host;
        const sel = h.periodicSelectedDate;
        const calMonth = moment(sel).startOf('month').add(h.periodicMonthOffset, 'months');

        // Calendar nav
        const calSection = body.createDiv('tl-periodic-selector');
        const calNav = calSection.createDiv('tl-periodic-cal-nav');
        const prevBtn = calNav.createEl('button', { cls: 'tl-periodic-nav-btn', text: '‹' });
        calNav.createEl('span', { cls: 'tl-periodic-cal-title', text: calMonth.format('YYYY年 M月') });
        const nextBtn = calNav.createEl('button', { cls: 'tl-periodic-nav-btn', text: '›' });
        prevBtn.addEventListener('click', () => { h.periodicMonthOffset--; h.invalidateTabCache('kanban'); h.switchTab('kanban'); });
        nextBtn.addEventListener('click', () => { h.periodicMonthOffset++; h.invalidateTabCache('kanban'); h.switchTab('kanban'); });

        // Mini calendar grid
        const grid = calSection.createDiv('tl-periodic-mini-cal');
        const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
        for (const wd of weekdays) {
            grid.createEl('div', { cls: 'tl-periodic-cal-wd', text: wd });
        }

        const firstDay = moment(calMonth).startOf('month');
        const startPad = firstDay.isoWeekday() - 1;
        for (let i = 0; i < startPad; i++) grid.createDiv('tl-periodic-cal-cell tl-periodic-cal-cell-empty');

        const todayStr = moment().format('YYYY-MM-DD');
        const selStr = sel.format('YYYY-MM-DD');

        for (let d = 1; d <= calMonth.daysInMonth(); d++) {
            const dateStr = moment(calMonth).date(d).format('YYYY-MM-DD');
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selStr;

            // Check if note exists
            const notePath = `${h.plugin.settings.dailyFolder}/${dateStr}.md`;
            const hasNote = !!h.app.vault.getAbstractFileByPath(notePath);

            const cell = grid.createDiv(`tl-periodic-cal-cell ${isToday ? 'tl-periodic-cal-cell-today' : ''} ${isSelected ? 'tl-periodic-cal-cell-selected' : ''} ${hasNote ? 'tl-periodic-cal-cell-has-note' : ''}`);
            cell.setText(`${d}`);
            cell.addEventListener('click', () => {
                h.periodicSelectedDate = moment(calMonth).date(d);
                h.invalidateTabCache('kanban');
                h.switchTab('kanban');
            });
        }

        // Preview area
        await this.renderDayPreview(body, sel);
    }

    private async renderDayPreview(body: HTMLElement, date: moment.Moment): Promise<void> {
        const h = this.host;
        const dateStr = date.format('YYYY-MM-DD');
        const dayName = date.format('dddd');
        const path = `${h.plugin.settings.dailyFolder}/${dateStr}.md`;
        const file = h.app.vault.getAbstractFileByPath(path);

        const preview = body.createDiv('tl-periodic-preview');
        const previewHeader = preview.createDiv('tl-periodic-preview-header');
        previewHeader.createEl('span', { cls: 'tl-periodic-preview-date', text: `${dateStr} ${dayName}` });

        if (!file || !(file instanceof TFile)) {
            // Show task input even for future/empty dates — auto-create file
            this.renderTaskInputForDate(preview, date);
            // AI suggestion for today / future
            if (date.isSameOrAfter(moment(), 'day')) {
                this.renderPlanSuggestion(preview, date);
            }
            const createBtn = preview.createEl('button', { cls: 'tl-periodic-open-btn', text: '+ 创建日记' });
            createBtn.addEventListener('click', async () => {
                const f = await h.plugin.vaultManager.getOrCreateDailyNote(date.toDate());
                h.app.workspace.getLeaf().openFile(f);
            });
            return;
        }

        // Parse content (skip frontmatter for task extraction)
        const content = await h.app.vault.read(file);

        // Tasks
        const tasks = h.parseMdTasks(content).filter(t => t.isTask);
        if (tasks.length > 0) {
            const taskSection = preview.createDiv('tl-periodic-task-section');
            const inProgress = tasks.filter(t => !t.done);
            const completed = tasks.filter(t => t.done);

            if (inProgress.length > 0) {
                taskSection.createDiv({ cls: 'tl-periodic-task-group-label', text: `⏳ 进行中 (${inProgress.length})` });
                for (const task of inProgress) {
                    this.renderTask(taskSection, task, file);
                }
            }
            if (completed.length > 0) {
                const doneLabel = taskSection.createDiv({ cls: 'tl-periodic-task-group-label tl-periodic-task-group-done-label' });
                const indicator = doneLabel.createEl('span', { cls: 'tl-periodic-toggle-indicator', text: '▾' });
                doneLabel.appendText(` ✅ 已完成 (${completed.length})`);
                const doneBody = taskSection.createDiv('tl-periodic-task-done-body');
                doneLabel.addEventListener('click', () => {
                    const collapsed = !doneBody.hasClass('tl-periodic-collapsed');
                    doneBody.toggleClass('tl-periodic-collapsed', collapsed);
                    indicator.setText(collapsed ? '▸' : '▾');
                });
                for (const task of completed) {
                    this.renderTask(doneBody, task, file);
                }
            }
        } else {
            preview.createDiv({ cls: 'tl-periodic-preview-empty', text: '暂无任务' });
        }

        // Add task input
        if (file instanceof TFile) {
            this.renderTaskInput(preview, file);
        }

        // AI planning suggestion for today / future dates
        const isCurrentOrFuture = date.isSameOrAfter(moment(), 'day');
        if (isCurrentOrFuture) {
            this.renderPlanSuggestion(preview, date);
        }

        // Open note button
        const openBtn = preview.createDiv('tl-periodic-open-btn');
        openBtn.setText('打开日记 →');
        openBtn.addEventListener('click', () => {
            h.app.workspace.getLeaf().openFile(file);
        });
    }

    /** Show planning suggestion — AI cache for today, date-seeded tips for future */
    private renderPlanSuggestion(container: HTMLElement, date: moment.Moment): void {
        const h = this.host;
        const isToday = date.isSame(moment(), 'day');
        const section = container.createDiv('tl-plan-suggestion');

        if (isToday) {
            // Today: try loading AI-generated suggestions from last night's review
            section.createDiv({ cls: 'tl-plan-suggestion-header', text: '🤖 基于昨日复盘的建议' });
            const path = `${h.plugin.settings.archiveFolder}/plan_suggestions.md`;
            const file = h.app.vault.getAbstractFileByPath(path);
            if (file && file instanceof TFile) {
                h.app.vault.read(file).then(content => {
                    let body = content;
                    if (body.startsWith('---')) {
                        const end = body.indexOf('---', 3);
                        if (end > 0) body = body.substring(end + 3);
                    }
                    const lines = body.trim().split('\n').filter(l => l.trim());
                    if (lines.length > 0) {
                        section.empty();
                        section.createDiv({ cls: 'tl-plan-suggestion-header', text: '🤖 基于昨日复盘的建议' });
                        for (const line of lines) {
                            section.createDiv({ cls: 'tl-plan-suggestion-line', text: line.trim() });
                        }
                        return;
                    }
                    this.showFallbackTip(section, date);
                }).catch(() => this.showFallbackTip(section, date));
            } else {
                this.showFallbackTip(section, date);
            }
        } else {
            // Future dates: show a planning prompt seeded by date
            section.createDiv({ cls: 'tl-plan-suggestion-header', text: '💡 计划小贴士' });
            this.showFallbackTip(section, date);
        }
    }

    private showFallbackTip(section: HTMLElement, date: moment.Moment): void {
        const tips = [
            '🎯 今天最重要的一件事是什么？先把它写下来',
            '⏰ 为每个任务设定一个具体的时间段，而不是「今天做」',
            '🐸 哪个任务你最不想做？把它排在第一个',
            '📦 大目标太模糊？试着拆成 3 个具体的小步骤',
            '🔋 根据精力安排任务：上午做创造性工作，下午做事务性工作',
            '✂️ 任务超过 3 个？砍掉最不重要的，专注真正重要的事',
            '🎯 想象今天结束时，你最希望完成什么？从它开始',
            '📝 给今天设一个主题词：专注？创造？整理？',
            '⚡ 留出一个 90 分钟的「深度工作」时段，关掉所有通知',
            '🔄 昨天未完成的任务，今天还需要做吗？重新评估优先级',
            '🌟 在任务中加一件「想做的事」，而不是全部「必须做的事」',
            '🧘 别排满整天——留出 20% 的时间应对意外和休息',
        ];
        // Use date as seed so each day shows a consistent but different tip
        const dayOfYear = date.dayOfYear();
        const tip = tips[dayOfYear % tips.length];
        section.createDiv({ cls: 'tl-plan-suggestion-line', text: tip });
    }

    /** Extract and render 晚间复盘 sections from daily note content */
    private renderReviewSection(preview: HTMLElement, content: string): void {
        // Find 晚间复盘 section — handle optional blank lines
        const reviewIdx = content.indexOf('## 晚间复盘');
        if (reviewIdx < 0) return;

        // Get everything after "## 晚间复盘" until next --- or end
        let reviewContent = content.substring(reviewIdx + '## 晚间复盘'.length);
        const endIdx = reviewContent.indexOf('\n---');
        if (endIdx > 0) reviewContent = reviewContent.substring(0, endIdx);

        if (!reviewContent.trim()) return;

        const section = preview.createDiv('tl-periodic-review-section');
        section.createDiv({ cls: 'tl-periodic-review-label', text: '📝 复盘' });

        // Extract sub-sections — use indexOf-based approach for robustness
        const subSections: { icon: string; title: string; heading: string }[] = [
            { icon: '🎯', title: '目标对标', heading: '### 目标对标' },
            { icon: '🏆', title: '成功日记', heading: '### 成功日记' },
            { icon: '😟', title: '焦虑觉察', heading: '### 焦虑觉察' },
            { icon: '📌', title: '明日计划', heading: '### 明日计划' },
        ];

        for (const sub of subSections) {
            const idx = reviewContent.indexOf(sub.heading);
            if (idx < 0) continue;

            // Get text between this heading and next ### or end
            let subText = reviewContent.substring(idx + sub.heading.length);
            const nextH = subText.indexOf('\n###');
            if (nextH > 0) subText = subText.substring(0, nextH);

            const lines = subText.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
            if (lines.length === 0) continue;

            const item = section.createDiv('tl-periodic-review-item');
            item.createEl('span', { cls: 'tl-periodic-review-icon', text: sub.icon });
            const textDiv = item.createDiv('tl-periodic-review-text');
            textDiv.createEl('div', { cls: 'tl-periodic-review-title', text: sub.title });
            for (const line of lines.slice(0, 2)) {
                textDiv.createEl('div', { cls: 'tl-periodic-review-line', text: line.replace(/^\d+\.\s*\*\*.*?\*\*[:：]\s*/, '').replace(/^[-*]\s*/, '') });
            }
        }
    }

    // ──────────────────────────────────────────────────────
    // Week Mode: week selector + weekly plan preview
    // ──────────────────────────────────────────────────────

    private async renderWeekMode(body: HTMLElement): Promise<void> {
        const h = this.host;
        const sel = h.periodicSelectedDate;
        const calMonth = moment(sel).startOf('month').add(h.periodicMonthOffset, 'months');

        // Calendar nav
        const calSection = body.createDiv('tl-periodic-selector');
        const calNav = calSection.createDiv('tl-periodic-cal-nav');
        const prevBtn = calNav.createEl('button', { cls: 'tl-periodic-nav-btn', text: '‹' });
        calNav.createEl('span', { cls: 'tl-periodic-cal-title', text: calMonth.format('YYYY年 M月') });
        const nextBtn = calNav.createEl('button', { cls: 'tl-periodic-nav-btn', text: '›' });
        prevBtn.addEventListener('click', () => { h.periodicMonthOffset--; h.invalidateTabCache('kanban'); h.switchTab('kanban'); });
        nextBtn.addEventListener('click', () => { h.periodicMonthOffset++; h.invalidateTabCache('kanban'); h.switchTab('kanban'); });

        // Mini calendar with week highlights
        const grid = calSection.createDiv('tl-periodic-mini-cal');
        const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
        for (const wd of weekdays) {
            grid.createEl('div', { cls: 'tl-periodic-cal-wd', text: wd });
        }

        const firstDay = moment(calMonth).startOf('month');
        const startPad = firstDay.isoWeekday() - 1;
        for (let i = 0; i < startPad; i++) grid.createDiv('tl-periodic-cal-cell tl-periodic-cal-cell-empty');

        const selWeekStart = moment(sel).startOf('isoWeek').format('YYYY-MM-DD');
        const todayStr = moment().format('YYYY-MM-DD');

        for (let d = 1; d <= calMonth.daysInMonth(); d++) {
            const dayMoment = moment(calMonth).date(d);
            const dateStr = dayMoment.format('YYYY-MM-DD');
            const weekStartStr = moment(dayMoment).startOf('isoWeek').format('YYYY-MM-DD');
            const isInSelectedWeek = weekStartStr === selWeekStart;
            const isToday = dateStr === todayStr;

            const cell = grid.createDiv(`tl-periodic-cal-cell ${isInSelectedWeek ? 'tl-periodic-cal-cell-week-highlight' : ''} ${isToday ? 'tl-periodic-cal-cell-today' : ''}`);
            cell.setText(`${d}`);
            cell.addEventListener('click', () => {
                h.periodicSelectedDate = moment(dayMoment);
                h.invalidateTabCache('kanban');
                h.switchTab('kanban');
            });
        }

        // Preview area: Week plan
        const weekStart = moment(sel).startOf('isoWeek');
        await this.renderWeekPreview(body, weekStart);
    }

    private async renderWeekPreview(body: HTMLElement, weekStart: moment.Moment): Promise<void> {
        const h = this.host;
        const weekNum = weekStart.format('ww');
        const weekLabel = `W${weekNum}`;

        const preview = body.createDiv('tl-periodic-preview');
        const previewHeader = preview.createDiv('tl-periodic-preview-header');
        previewHeader.createEl('span', {
            cls: 'tl-periodic-preview-date',
            text: `${weekStart.format('YYYY')}-${weekLabel} (${weekStart.format('M/D')}—${moment(weekStart).add(6, 'days').format('M/D')})`,
        });

        // Try load weekly plan file
        const weeklyPath = `${h.plugin.settings.planFolder}/Weekly/${weekStart.format('YYYY')}-${weekLabel}.md`;
        const weekFile = h.app.vault.getAbstractFileByPath(weeklyPath);

        if (weekFile && weekFile instanceof TFile) {
            const content = await h.app.vault.read(weekFile);
            // Extract goals section (lines until first task)
            const lines = content.split('\n');
            const goalLines: string[] = [];
            let inGoals = false;
            for (const line of lines) {
                if (line.startsWith('## ') || line.startsWith('# ')) {
                    if (inGoals) break;
                    inGoals = true;
                    continue;
                }
                if (inGoals && line.trim() && !line.startsWith('---')) {
                    goalLines.push(line);
                }
            }

            if (goalLines.length > 0) {
                const goalsDiv = preview.createDiv('tl-periodic-goals');
                goalsDiv.createEl('div', { cls: 'tl-periodic-goals-label', text: '📋 周目标' });
                for (const g of goalLines.slice(0, 5)) {
                    goalsDiv.createEl('div', { cls: 'tl-periodic-goal-line', text: g.replace(/^[-*]\s*/, '') });
                }
            }

            // Tasks from weekly plan
            const tasks = h.parseMdTasks(content).filter(t => t.isTask);
            const taskSection = preview.createDiv('tl-periodic-task-section');
            if (tasks.length > 0) {
                taskSection.createDiv({ cls: 'tl-periodic-task-group-label', text: `📝 周任务 (${tasks.length})` });
                for (const task of tasks) {
                    this.renderTask(taskSection, task, weekFile);
                }
            }
            this.renderTaskInput(taskSection, weekFile);
        } else {
            // No weekly file — show task input that auto-creates file
            const taskSection = preview.createDiv('tl-periodic-task-section');
            this.renderTaskInputForWeek(taskSection, weekStart, weekLabel);
        }

        // Aggregate daily tasks for this week
        const dailyTasks: { text: string; done: boolean; date: string }[] = [];
        for (let i = 0; i < 7; i++) {
            const d = moment(weekStart).add(i, 'days');
            const dateStr = d.format('YYYY-MM-DD');
            const dayPath = `${h.plugin.settings.dailyFolder}/${dateStr}.md`;
            const dayFile = h.app.vault.getAbstractFileByPath(dayPath);
            if (dayFile && dayFile instanceof TFile) {
                try {
                    const content = await h.app.vault.read(dayFile);
                    const tasks = h.parseMdTasks(content).filter(t => t.isTask);
                    for (const t of tasks) {
                        dailyTasks.push({ text: t.text, done: t.done, date: dateStr.substring(5) });
                    }
                } catch { /* skip */ }
            }
        }

        if (dailyTasks.length > 0) {
            const aggSection = preview.createDiv('tl-periodic-task-section');
            const undone = dailyTasks.filter(t => !t.done);
            const done = dailyTasks.filter(t => t.done);

            aggSection.createDiv({ cls: 'tl-periodic-task-group-label', text: `📅 本周日记任务 (${undone.length} 进行中 / ${done.length} 完成)` });
            for (const t of undone.slice(0, 10)) {
                const row = aggSection.createDiv('tl-periodic-task-row');
                row.createEl('span', { cls: 'tl-periodic-task-check', text: '○' });
                row.createEl('span', { cls: 'tl-periodic-task-text', text: t.text });
                row.createEl('span', { cls: 'tl-periodic-task-date-badge', text: t.date });
            }
            if (undone.length > 10) {
                aggSection.createEl('span', { cls: 'tl-periodic-task-more', text: `+${undone.length - 10} 更多...` });
            }
        }

        if (!weekFile && dailyTasks.length === 0) {
            preview.createDiv({ cls: 'tl-periodic-preview-empty', text: '暂无周计划' });
        }

        // AI Insight summary for this week
        await this.renderWeeklyInsight(preview, weekStart);

        // Open / Create button
        const openBtn = preview.createDiv('tl-periodic-open-btn');
        if (weekFile) {
            openBtn.setText('打开周计划 →');
            openBtn.addEventListener('click', () => {
                h.app.workspace.getLeaf().openFile(weekFile as TFile);
            });
        } else {
            openBtn.setText('+ 创建周计划');
            openBtn.addEventListener('click', async () => {
                const tmpl = h.plugin.templateManager.getWeeklyPlanTemplate(weekLabel, weekStart.format('YYYY-MM'));
                const f = await h.plugin.vaultManager.getOrCreateWeeklyPlan(weekStart.toDate(), tmpl);
                h.app.workspace.getLeaf().openFile(f);
            });
        }
    }

    /** Load and render the AI weekly insight report summary */
    private async renderWeeklyInsight(preview: HTMLElement, weekStart: moment.Moment): Promise<void> {
        const h = this.host;
        const weekNum = weekStart.format('ww');
        const year = weekStart.format('YYYY');
        // Try various naming patterns
        const patterns = [
            `${h.plugin.settings.archiveFolder}/Insights/${year}-W${weekNum}-周报.md`,
            `${h.plugin.settings.archiveFolder}/Insights/${year}-W${parseInt(weekNum, 10)}-周报.md`,
        ];

        let insightContent: string | null = null;
        let insightFile: TFile | null = null;
        for (const p of patterns) {
            const f = h.app.vault.getAbstractFileByPath(p);
            if (f && f instanceof TFile) {
                insightContent = await h.app.vault.read(f);
                insightFile = f;
                break;
            }
        }

        if (!insightContent) return;

        const section = preview.createDiv('tl-periodic-insight-section');
        section.createDiv({ cls: 'tl-periodic-insight-label', text: '🤖 AI 周报摘要' });

        // Extract key sections from insight report
        const extracts: { icon: string; pattern: RegExp }[] = [
            { icon: '📊', pattern: /### \d+\.\s*本周概览\n([\s\S]*?)(?=###|$)/ },
            { icon: '🏆', pattern: /### \d+\.\s*成功模式\n([\s\S]*?)(?=###|$)/ },
            { icon: '💡', pattern: /### \d+\.\s*下周建议\n([\s\S]*?)(?=###|$)/ },
        ];

        for (const ex of extracts) {
            const m = insightContent.match(ex.pattern);
            if (m && m[1].trim()) {
                const lines = m[1].trim().split('\n').filter(l => l.trim()).slice(0, 3);
                for (const line of lines) {
                    const itemDiv = section.createDiv('tl-periodic-insight-item');
                    itemDiv.setText(line.replace(/^[-*]\s*\*\*.*?\*\*[:：]?\s*/, '').replace(/^[-*]\s*/, '').replace(/^\d+\.\s*\*\*.*?\*\*[:：]?\s*/, ''));
                }
            }
        }

        // Link to full report
        if (insightFile) {
            const link = section.createDiv('tl-periodic-insight-link');
            link.setText('查看完整周报 →');
            link.addEventListener('click', () => {
                h.app.workspace.getLeaf().openFile(insightFile!);
            });
        }
    }

    // ──────────────────────────────────────────────────────
    // Month Mode: month grid + monthly plan preview
    // ──────────────────────────────────────────────────────

    private async renderMonthMode(body: HTMLElement): Promise<void> {
        const h = this.host;
        const sel = h.periodicSelectedDate;
        const year = sel.year();

        // Year nav
        const calSection = body.createDiv('tl-periodic-selector');
        const calNav = calSection.createDiv('tl-periodic-cal-nav');
        const prevBtn = calNav.createEl('button', { cls: 'tl-periodic-nav-btn', text: '‹' });
        calNav.createEl('span', { cls: 'tl-periodic-cal-title', text: `${year}年` });
        const nextBtn = calNav.createEl('button', { cls: 'tl-periodic-nav-btn', text: '›' });
        prevBtn.addEventListener('click', () => {
            h.periodicSelectedDate = moment(sel).subtract(1, 'year');
            h.invalidateTabCache('kanban');
            h.switchTab('kanban');
        });
        nextBtn.addEventListener('click', () => {
            h.periodicSelectedDate = moment(sel).add(1, 'year');
            h.invalidateTabCache('kanban');
            h.switchTab('kanban');
        });

        // 3×4 month grid
        const grid = calSection.createDiv('tl-periodic-month-grid');
        const selectedMonth = sel.format('YYYY-MM');
        const currentMonth = moment().format('YYYY-MM');

        for (let m = 1; m <= 12; m++) {
            const monthStr = `${year}-${String(m).padStart(2, '0')}`;
            const isSelected = monthStr === selectedMonth;
            const isCurrent = monthStr === currentMonth;

            // Check if monthly plan exists
            const monthPath = `${h.plugin.settings.planFolder}/Monthly/${monthStr}.md`;
            const hasNote = !!h.app.vault.getAbstractFileByPath(monthPath);

            const cell = grid.createDiv(`tl-periodic-month-cell ${isSelected ? 'tl-periodic-month-cell-selected' : ''} ${isCurrent ? 'tl-periodic-month-cell-current' : ''} ${hasNote ? 'tl-periodic-month-cell-has-note' : ''}`);
            cell.setText(`${m}月`);
            cell.addEventListener('click', () => {
                h.periodicSelectedDate = moment(`${year}-${String(m).padStart(2, '0')}-01`);
                h.invalidateTabCache('kanban');
                h.switchTab('kanban');
            });
        }

        // Preview area
        await this.renderMonthPreview(body, sel);
    }

    private async renderMonthPreview(body: HTMLElement, date: moment.Moment): Promise<void> {
        const h = this.host;
        const monthStr = date.format('YYYY-MM');

        const preview = body.createDiv('tl-periodic-preview');
        const previewHeader = preview.createDiv('tl-periodic-preview-header');
        previewHeader.createEl('span', { cls: 'tl-periodic-preview-date', text: `${monthStr} 月计划` });

        // Load monthly plan
        const monthPath = `${h.plugin.settings.planFolder}/Monthly/${monthStr}.md`;
        const monthFile = h.app.vault.getAbstractFileByPath(monthPath);

        if (monthFile && monthFile instanceof TFile) {
            const content = await h.app.vault.read(monthFile);

            // Extract goals
            const lines = content.split('\n');
            const goalLines: string[] = [];
            let inGoals = false;
            for (const line of lines) {
                if (line.startsWith('## ') || line.startsWith('# ')) {
                    if (inGoals) break;
                    inGoals = true;
                    continue;
                }
                if (inGoals && line.trim() && !line.startsWith('---')) {
                    goalLines.push(line);
                }
            }

            if (goalLines.length > 0) {
                const goalsDiv = preview.createDiv('tl-periodic-goals');
                goalsDiv.createEl('div', { cls: 'tl-periodic-goals-label', text: '🎯 月目标' });
                for (const g of goalLines.slice(0, 8)) {
                    goalsDiv.createEl('div', { cls: 'tl-periodic-goal-line', text: g.replace(/^[-*]\s*/, '') });
                }
            }

            // Tasks from monthly plan
            const tasks = h.parseMdTasks(content).filter(t => t.isTask);
            const taskSection = preview.createDiv('tl-periodic-task-section');
            if (tasks.length > 0) {
                taskSection.createDiv({ cls: 'tl-periodic-task-group-label', text: `📝 月任务 (${tasks.length})` });
                for (const task of tasks) {
                    this.renderTask(taskSection, task, monthFile);
                }
            }
            this.renderTaskInput(taskSection, monthFile);
        } else {
            // No monthly file — show task input that auto-creates file
            const taskSection = preview.createDiv('tl-periodic-task-section');
            this.renderTaskInputForMonth(taskSection, date);
        }

        // Monthly stats: count daily notes + tasks in this month
        const dailyFolder = h.plugin.settings.dailyFolder;
        const allFiles = h.app.vault.getFiles().filter(f => f.path.startsWith(dailyFolder + '/') && f.name.startsWith(monthStr));
        if (allFiles.length > 0) {
            const statsDiv = preview.createDiv('tl-periodic-stats');
            statsDiv.createEl('span', { text: `📅 ${allFiles.length} 篇日记` });
        }

        if (!monthFile && allFiles.length === 0) {
            preview.createDiv({ cls: 'tl-periodic-preview-empty', text: '暂无月计划' });
        }

        // Open / Create button
        const openBtn = preview.createDiv('tl-periodic-open-btn');
        if (monthFile) {
            openBtn.setText('打开月计划 →');
            openBtn.addEventListener('click', () => {
                h.app.workspace.getLeaf().openFile(monthFile as TFile);
            });
        } else {
            openBtn.setText('+ 创建月计划');
            openBtn.addEventListener('click', async () => {
                const tmpl = h.plugin.templateManager.getMonthlyPlanTemplate(monthStr);
                const f = await h.plugin.vaultManager.getOrCreateMonthlyPlan(date.toDate(), tmpl);
                h.app.workspace.getLeaf().openFile(f);
            });
        }
    }

    // ──────────────────────────────────────────────────────
    // Shared task renderer & input (Things/TickTick style)
    // ──────────────────────────────────────────────────────

    private renderTask(container: HTMLElement, task: { text: string; done: boolean; indent: number }, file: TFile): void {
        const h = this.host;
        const row = container.createDiv(`tl-periodic-task-row ${task.done ? 'tl-periodic-task-row-done' : ''}`);
        row.dataset.taskText = task.text;
        row.dataset.taskIndent = String(task.indent);
        row.setAttribute('draggable', 'true');
        if (task.indent > 0) {
            row.addClass('tl-periodic-task-subtask');
            row.style.setProperty('--tl-indent-pad', `${20 + task.indent * 20}px`);
        }

        // Drag handle
        const handle = row.createEl('span', { cls: 'tl-task-drag-handle', text: '⡇' });
        handle.addEventListener('mousedown', () => row.setAttribute('draggable', 'true'));

        // Checkbox
        const cb = row.createEl('input', { type: 'checkbox' });
        cb.checked = task.done;
        cb.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();
            await h.toggleMdTask(file, task.text, task.done);
            task.done = !task.done;
            cb.checked = task.done;
            row.toggleClass('tl-periodic-task-row-done', task.done);
            label.toggleClass('tl-text-done', task.done);
        });

        // Label (double-click to edit)
        const label = row.createEl('span', { cls: 'tl-periodic-task-text', text: task.text });
        if (task.done) {
            label.addClass('tl-text-done');
        }
        label.addEventListener('dblclick', () => {
            const input = document.createElement('input');
            input.type = 'text';
            input.value = task.text;
            input.className = 'tl-task-edit-input';
            label.replaceWith(input);
            input.focus();
            input.select();
            const save = async () => {
                const newText = input.value.trim();
                if (newText && newText !== task.text) {
                    await h.editMdTask(file, task.text, newText);
                    task.text = newText;
                }
                const newLabel = document.createElement('span');
                newLabel.className = 'tl-periodic-task-text';
                newLabel.textContent = task.text;
                input.replaceWith(newLabel);
                // Re-attach dblclick listener
                newLabel.addEventListener('dblclick', () => label.dispatchEvent(new Event('dblclick')));
            };
            input.addEventListener('blur', save);
            input.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
                if (e.key === 'Escape') { input.value = task.text; input.blur(); }
            });
        });

        // Delete button
        const delBtn = row.createEl('span', { cls: 'tl-task-delete-btn', text: '×' });
        delBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await h.deleteMdTask(file, task.text);
            row.remove();
        });

        // Add sub-task button
        const subBtn = row.createEl('span', { cls: 'tl-task-sub-btn', text: '+' });
        subBtn.setAttribute('title', '添加子任务');
        subBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (row.nextElementSibling?.hasClass('tl-subtask-input-row')) return;
            const subRow = document.createElement('div');
            subRow.className = 'tl-subtask-input-row';
            const subInput = document.createElement('input');
            subInput.type = 'text';
            subInput.className = 'tl-periodic-task-input tl-subtask-input';
            subInput.placeholder = '添加子任务...';
            subRow.appendChild(subInput);
            row.after(subRow);
            subInput.focus();

            const doAddSub = async () => {
                const text = subInput.value.trim();
                subRow.remove();
                if (!text) return;
                await h.addSubTask(file, task.text, text);
                h.invalidateTabCache('kanban');
                h.switchTab('kanban');
            };
            subInput.addEventListener('blur', doAddSub);
            subInput.addEventListener('keydown', (ke: KeyboardEvent) => {
                if (ke.key === 'Enter') { ke.preventDefault(); subInput.blur(); }
                if (ke.key === 'Escape') { subInput.value = ''; subInput.blur(); }
            });
        });

        // Drag & drop with hover-to-nest / drag-left-to-promote
        let nestTimer: ReturnType<typeof setTimeout> | null = null;
        let nestMode = false;
        let promoteMode = false;
        let currentZone: 'left' | 'right' | null = null;

        const clearTimers = () => {
            if (nestTimer) { clearTimeout(nestTimer); nestTimer = null; }
            nestMode = false;
            promoteMode = false;
            currentZone = null;
            row.removeClass('tl-task-row-dragover');
            row.removeClass('tl-task-row-nest-hint');
            row.removeClass('tl-task-row-promote-hint');
        };

        row.addEventListener('dragstart', (e) => {
            e.dataTransfer?.setData('text/plain', task.text);
            row.addClass('tl-task-row-dragging');
        });
        row.addEventListener('dragend', () => {
            row.removeClass('tl-task-row-dragging');
        });
        row.addEventListener('dragover', (e) => {
            e.preventDefault();
            const rect = row.getBoundingClientRect();
            const offsetX = e.clientX - rect.left;
            const zone: 'left' | 'right' = offsetX < 30 ? 'left' : 'right';

            // If already in a mode or same zone, just keep it
            if (nestMode || promoteMode) return;
            if (zone === currentZone) return;

            // Zone changed — clear old timer and start new one
            if (nestTimer) { clearTimeout(nestTimer); nestTimer = null; }
            row.removeClass('tl-task-row-dragover');
            row.removeClass('tl-task-row-nest-hint');
            row.removeClass('tl-task-row-promote-hint');
            currentZone = zone;

            if (zone === 'left') {
                nestTimer = setTimeout(() => {
                    promoteMode = true;
                    row.addClass('tl-task-row-promote-hint');
                }, 300);
            } else {
                row.addClass('tl-task-row-dragover');
                nestTimer = setTimeout(() => {
                    nestMode = true;
                    row.removeClass('tl-task-row-dragover');
                    row.addClass('tl-task-row-nest-hint');
                }, 300);
            }
        });
        row.addEventListener('dragleave', () => {
            clearTimers();
        });
        row.addEventListener('drop', async (e) => {
            e.preventDefault();
            const wasNest = nestMode;
            const wasPromote = promoteMode;
            clearTimers();
            const draggedText = e.dataTransfer?.getData('text/plain');
            if (!draggedText || draggedText === task.text) return;

            if (wasPromote) {
                // Promote: make dragged task a top-level task
                await h.setTaskIndent(file, draggedText, 0);
                h.invalidateTabCache('kanban');
                h.switchTab('kanban');
            } else if (wasNest) {
                // Nest: make dragged task a sub-task of this task
                await h.deleteMdTask(file, draggedText);
                await h.addSubTask(file, task.text, draggedText);
                h.invalidateTabCache('kanban');
                h.switchTab('kanban');
            } else {
                // Quick drop: reorder
                const parent = row.parentElement;
                if (!parent) return;
                const rows = Array.from(parent.querySelectorAll('.tl-periodic-task-row'));
                const texts = rows.map(r => (r as HTMLElement).dataset.taskText || '').filter(t => t);
                const fromIdx = texts.indexOf(draggedText);
                const toIdx = texts.indexOf(task.text);
                if (fromIdx >= 0 && toIdx >= 0) {
                    texts.splice(fromIdx, 1);
                    texts.splice(toIdx, 0, draggedText);
                    await h.reorderMdTasks(file, texts);
                    h.invalidateTabCache('kanban');
                    h.switchTab('kanban');
                }
            }
        });
    }

    /** Inline task-add input */
    private renderTaskInput(container: HTMLElement, file: TFile): void {
        const h = this.host;
        const row = container.createDiv('tl-periodic-task-input-row');
        const input = row.createEl('input', {
            type: 'text',
            cls: 'tl-periodic-task-input',
            attr: { placeholder: '添加任务...' },
        });
        const addBtn = row.createEl('button', {
            cls: 'tl-periodic-task-add-btn',
            text: '+',
        });

        const doAdd = async () => {
            const text = input.value.trim();
            if (!text) return;
            input.value = '';
            await h.addMdTask(file, text);
            h.invalidateTabCache('kanban');
            h.switchTab('kanban');
        };

        addBtn.addEventListener('click', doAdd);
        input.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') { e.preventDefault(); doAdd(); }
        });
    }

    /** Task input that auto-creates the daily note file */
    private renderTaskInputForDate(container: HTMLElement, date: moment.Moment): void {
        const h = this.host;
        const row = container.createDiv('tl-periodic-task-input-row');
        const input = row.createEl('input', {
            type: 'text',
            cls: 'tl-periodic-task-input',
            attr: { placeholder: '添加任务...' },
        });
        const addBtn = row.createEl('button', {
            cls: 'tl-periodic-task-add-btn',
            text: '+',
        });

        const doAdd = async () => {
            const text = input.value.trim();
            if (!text) return;
            input.value = '';
            // Auto-create daily note if needed
            const file = await h.plugin.vaultManager.getOrCreateDailyNote(date.toDate());
            await h.addMdTask(file, text);
            h.invalidateTabCache('kanban');
            h.switchTab('kanban');
        };

        addBtn.addEventListener('click', doAdd);
        input.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') { e.preventDefault(); doAdd(); }
        });
    }

    /** Task input that auto-creates the weekly plan file */
    private renderTaskInputForWeek(container: HTMLElement, weekStart: moment.Moment, weekLabel: string): void {
        const h = this.host;
        const row = container.createDiv('tl-periodic-task-input-row');
        const input = row.createEl('input', {
            type: 'text',
            cls: 'tl-periodic-task-input',
            attr: { placeholder: '添加周任务...' },
        });
        const addBtn = row.createEl('button', {
            cls: 'tl-periodic-task-add-btn',
            text: '+',
        });

        const doAdd = async () => {
            const text = input.value.trim();
            if (!text) return;
            input.value = '';
            const tmpl = h.plugin.templateManager.getWeeklyPlanTemplate(weekLabel, weekStart.format('YYYY-MM'));
            const file = await h.plugin.vaultManager.getOrCreateWeeklyPlan(weekStart.toDate(), tmpl);
            await h.addMdTask(file, text);
            h.invalidateTabCache('kanban');
            h.switchTab('kanban');
        };

        addBtn.addEventListener('click', doAdd);
        input.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') { e.preventDefault(); doAdd(); }
        });
    }

    /** Task input that auto-creates the monthly plan file */
    private renderTaskInputForMonth(container: HTMLElement, date: moment.Moment): void {
        const h = this.host;
        const monthStr = date.format('YYYY-MM');
        const row = container.createDiv('tl-periodic-task-input-row');
        const input = row.createEl('input', {
            type: 'text',
            cls: 'tl-periodic-task-input',
            attr: { placeholder: '添加月任务...' },
        });
        const addBtn = row.createEl('button', {
            cls: 'tl-periodic-task-add-btn',
            text: '+',
        });

        const doAdd = async () => {
            const text = input.value.trim();
            if (!text) return;
            input.value = '';
            const tmpl = h.plugin.templateManager.getMonthlyPlanTemplate(monthStr);
            const file = await h.plugin.vaultManager.getOrCreateMonthlyPlan(date.toDate(), tmpl);
            await h.addMdTask(file, text);
            h.invalidateTabCache('kanban');
            h.switchTab('kanban');
        };

        addBtn.addEventListener('click', doAdd);
        input.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') { e.preventDefault(); doAdd(); }
        });
    }
}
