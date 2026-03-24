/**
 * Periodic Renderer - LifeOS-style periodic navigator
 * Replaces the old kanban-renderer with a day/week/month period selector + content preview.
 */

import { TFile, moment, setIcon } from 'obsidian';
import type TideLogPlugin from '../main';
import type { App } from 'obsidian';
import { t, getLanguage } from '../i18n';

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
    deferTaskToToday(sourceFile: TFile, taskText: string): Promise<void>;
    moveTaskToDate(sourceFile: TFile, taskText: string, targetDate: Date): Promise<void>;
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
            { id: 'day', icon: 'sun', label: t('periodic.day') },
            { id: 'week', icon: 'calendar-range', label: t('periodic.week') },
            { id: 'month', icon: 'calendar', label: t('periodic.month') },
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
        calNav.createEl('span', { cls: 'tl-periodic-cal-title', text: getLanguage() === 'en' ? calMonth.format('MMMM YYYY') : calMonth.format('YYYY年 M月') });
        const nextBtn = calNav.createEl('button', { cls: 'tl-periodic-nav-btn', text: '›' });
        prevBtn.addEventListener('click', () => { h.periodicMonthOffset--; h.invalidateTabCache('kanban'); h.switchTab('kanban'); });
        nextBtn.addEventListener('click', () => { h.periodicMonthOffset++; h.invalidateTabCache('kanban'); h.switchTab('kanban'); });

        // Mini calendar grid
        const grid = calSection.createDiv('tl-periodic-mini-cal');
        const weekdays = t('cal.weekdays').split(',');
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

            // Check if note exists AND has real content (tasks)
            const notePath = `${h.plugin.settings.dailyFolder}/${dateStr}.md`;
            const noteFile = h.app.vault.getAbstractFileByPath(notePath);
            const hasNote = noteFile instanceof TFile
                && (h.app.metadataCache.getFileCache(noteFile)?.listItems?.some(item => item.task !== undefined) ?? false);

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
                void this.renderPlanSuggestion(preview, date);
            }
            const createBtn = preview.createEl('button', { cls: 'tl-periodic-open-btn', text: t('periodic.createDiary') });
            createBtn.addEventListener('click', () => {
                void (async () => {
                    const f = await h.plugin.vaultManager.getOrCreateDailyNote(date.toDate());
                    void h.app.workspace.getLeaf().openFile(f);
                })();
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
                taskSection.createDiv({ cls: 'tl-periodic-task-group-label', text: t('kanban.inProgress', String(inProgress.length)) });
                for (const task of inProgress) {
                    this.renderTask(taskSection, task, file, date);
                }
            }
            if (completed.length > 0) {
                const doneLabel = taskSection.createDiv({ cls: 'tl-periodic-task-group-label tl-periodic-task-group-done-label' });
                const indicator = doneLabel.createEl('span', { cls: 'tl-periodic-toggle-indicator', text: '▾' });
                doneLabel.appendText(` ${t('kanban.completedSection', String(completed.length))}`);
                const doneBody = taskSection.createDiv('tl-periodic-task-done-body');
                doneLabel.addEventListener('click', () => {
                    const collapsed = !doneBody.hasClass('tl-periodic-collapsed');
                    doneBody.toggleClass('tl-periodic-collapsed', collapsed);
                    indicator.setText(collapsed ? '▸' : '▾');
                });
                for (const task of completed) {
                    this.renderTask(doneBody, task, file, date);
                }
            }
        } else {
            preview.createDiv({ cls: 'tl-periodic-preview-empty', text: t('kanban.noTasks') });
        }

        // Add task input
        if (file instanceof TFile) {
            this.renderTaskInput(preview, file);
        }

        // AI planning suggestion for today / future dates
        const isCurrentOrFuture = date.isSameOrAfter(moment(), 'day');
        if (isCurrentOrFuture) {
            await this.renderPlanSuggestion(preview, date);
        }

        // Open note button
        const openBtn = preview.createDiv('tl-periodic-open-btn');
        openBtn.setText(t('periodic.openDiary'));
        openBtn.addEventListener('click', () => {
            void h.app.workspace.getLeaf().openFile(file);
        });
    }

    /**
     * Show planning suggestions based on previous day's review content.
     * Reads the daily note directly, extracts review section, and generates
     * AI suggestions. Cached per-date to avoid redundant API calls.
     */
    private async renderPlanSuggestion(container: HTMLElement, date: moment.Moment): Promise<void> {
        const h = this.host;
        const isToday = date.isSame(moment(), 'day');
        const isTomorrow = date.isSame(moment().add(1, 'day'), 'day');
        const section = container.createDiv('tl-plan-suggestion');

        if (isToday || isTomorrow) {
            // Read the previous day's daily note review content
            const yesterday = moment(date).subtract(1, 'day');
            const yesterdayPath = `${h.plugin.settings.dailyFolder}/${yesterday.format('YYYY-MM-DD')}.md`;
            const yesterdayFile = h.app.vault.getAbstractFileByPath(yesterdayPath);

            if (!yesterdayFile || !(yesterdayFile instanceof TFile)) {
                this.showFallbackTip(section, date);
                return;
            }

            const content = await h.app.vault.read(yesterdayFile);

            // Extract review section
            let reviewIdx = content.indexOf('## 复盘');
            if (reviewIdx < 0) reviewIdx = content.indexOf('## Review');
            if (reviewIdx < 0) {
                this.showFallbackTip(section, date);
                return;
            }
            const reviewLabel = content.indexOf('## 复盘') >= 0 ? '## 复盘' : '## Review';
            let reviewContent = content.substring(reviewIdx + reviewLabel.length);
            // Cut at next "---" or "## " header
            const endIdx = reviewContent.indexOf('\n---');
            if (endIdx > 0) reviewContent = reviewContent.substring(0, endIdx);

            // Remove HTML comments
            reviewContent = reviewContent.replace(/<!--[\s\S]*?-->/g, '').trim();
            if (!reviewContent) {
                this.showFallbackTip(section, date);
                return;
            }

            // Check cache: only regenerate if date changed
            const cacheKey = date.format('YYYY-MM-DD');
            const cachePath = `${h.plugin.settings.archiveFolder}/plan_suggestions.md`;
            const cacheFile = h.app.vault.getAbstractFileByPath(cachePath);

            if (cacheFile && cacheFile instanceof TFile) {
                const cached = await h.app.vault.read(cacheFile);
                // Check if cache is for today's suggestions
                if (cached.includes(`date: ${cacheKey}`)) {
                    // Use cached suggestions
                    let body = cached;
                    if (body.startsWith('---')) {
                        const end = body.indexOf('---', 3);
                        if (end > 0) body = body.substring(end + 3);
                    }
                    const lines = body.trim().split('\n').filter(l => l.trim());
                    if (lines.length > 0) {
                        section.createDiv({ cls: 'tl-plan-suggestion-header', text: isToday ? t('periodic.aiSuggestionToday') : t('periodic.aiSuggestionGeneral') });
                        for (const line of lines) {
                            section.createDiv({ cls: 'tl-plan-suggestion-line', text: line.trim() });
                        }
                        return;
                    }
                }
            }

            // Generate fresh suggestions via AI
            section.createDiv({ cls: 'tl-plan-suggestion-header', text: isToday ? t('periodic.aiSuggestionToday') : t('periodic.aiSuggestionGeneral') });
            const loadingEl = section.createDiv({ cls: 'tl-plan-suggestion-line', text: '⏳ 正在生成建议...' });

            try {
                const provider = h.plugin.getAIProvider();
                if (!provider) {
                    loadingEl.remove();
                    this.showFallbackTip(section, date);
                    return;
                }

                const systemPrompt = `基于用户昨日的复盘内容，提炼出3条今天可以行动的建议。

严格规则：
- 每条建议必须直接来源于用户复盘中提到的事情、想法或反思，不得凭空编造
- 绝对禁止建议用户没有提到过的活动、方法或习惯
- 建议应该是用户自己说过的计划、反思到的改进方向、或未完成事项的延续
- 每条以"💡"开头，不超过30字
- 直接输出建议，不要加前言`;

                const messages: { role: string; content: string; timestamp: number }[] = [
                    { role: 'user', content: `我的昨日复盘：\n${reviewContent}`, timestamp: Date.now() }
                ];

                const suggestions = await provider.sendMessage(messages as any, systemPrompt, () => {});

                loadingEl.remove();

                if (suggestions && suggestions.trim()) {
                    const lines = suggestions.trim().split('\n').filter((l: string) => l.trim());
                    for (const line of lines) {
                        section.createDiv({ cls: 'tl-plan-suggestion-line', text: line.trim() });
                    }
                    // Save to cache
                    const cacheContent = `---\ndate: ${cacheKey}\nupdated: ${new Date().toISOString()}\n---\n${suggestions.trim()}`;
                    if (cacheFile && cacheFile instanceof TFile) {
                        await h.app.vault.modify(cacheFile, cacheContent);
                    } else {
                        const folder = cachePath.substring(0, cachePath.lastIndexOf('/'));
                        if (!h.app.vault.getAbstractFileByPath(folder)) {
                            await h.app.vault.createFolder(folder);
                        }
                        await h.app.vault.create(cachePath, cacheContent);
                    }
                } else {
                    this.showFallbackTip(section, date);
                }
            } catch {
                loadingEl.remove();
                this.showFallbackTip(section, date);
            }
        } else {
            // Future dates: show a planning tip
            section.createDiv({ cls: 'tl-plan-suggestion-header', text: t('periodic.planTip') });
            this.showFallbackTip(section, date);
        }
    }

    private showFallbackTip(section: HTMLElement, date: moment.Moment): void {
        const tips = [
            t('tip.0'), t('tip.1'), t('tip.2'), t('tip.3'),
            t('tip.4'), t('tip.5'), t('tip.6'), t('tip.7'),
            t('tip.8'), t('tip.9'), t('tip.10'), t('tip.11'),
        ];
        const dayOfYear = date.dayOfYear();
        const tip = tips[dayOfYear % tips.length];
        section.createDiv({ cls: 'tl-plan-suggestion-line', text: tip });
    }



    /** Extract and render 复盘 sections from daily note content */
    private renderReviewSection(preview: HTMLElement, content: string): void {
        // Find 复盘 section — handle optional blank lines
        let reviewIdx = content.indexOf('## 复盘');
        if (reviewIdx < 0) reviewIdx = content.indexOf('## Review');
        if (reviewIdx < 0) return;

        // Get everything after "## 复盘" until next --- or end
        const reviewLabel = content.indexOf('## 复盘') >= 0 ? '## 复盘' : '## Review';
        let reviewContent = content.substring(reviewIdx + reviewLabel.length);
        const endIdx = reviewContent.indexOf('\n---');
        if (endIdx > 0) reviewContent = reviewContent.substring(0, endIdx);

        if (!reviewContent.trim()) return;

        const section = preview.createDiv('tl-periodic-review-section');
        section.createDiv({ cls: 'tl-periodic-review-label', text: t('periodic.reviewLabel') });

        // Extract sub-sections — use indexOf-based approach for robustness
        const subSections: { icon: string; title: string; heading: string }[] = [
            { icon: '🎯', title: t('insight.sectionGoalAlign'), heading: '### ' + t('insight.sectionGoalAlign') },
            { icon: '🏆', title: t('insight.sectionSuccess'), heading: '### ' + t('insight.sectionSuccess') },
            { icon: '😟', title: t('insight.sectionAnxiety'), heading: '### ' + t('insight.sectionAnxiety') },
            { icon: '📌', title: t('insight.sectionTomorrow'), heading: '### ' + t('insight.sectionTomorrow') },
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
        calNav.createEl('span', { cls: 'tl-periodic-cal-title', text: getLanguage() === 'en' ? calMonth.format('MMMM YYYY') : calMonth.format('YYYY年 M月') });
        const nextBtn = calNav.createEl('button', { cls: 'tl-periodic-nav-btn', text: '›' });
        prevBtn.addEventListener('click', () => { h.periodicMonthOffset--; h.invalidateTabCache('kanban'); h.switchTab('kanban'); });
        nextBtn.addEventListener('click', () => { h.periodicMonthOffset++; h.invalidateTabCache('kanban'); h.switchTab('kanban'); });

        // Mini calendar with week highlights
        const grid = calSection.createDiv('tl-periodic-mini-cal');
        const weekdays = t('cal.weekdays').split(',');
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

        // Pad trailing days to complete the last week of the month
        const lastDay = moment(calMonth).endOf('month');
        const trailPad = 7 - lastDay.isoWeekday();
        for (let i = 1; i <= trailPad; i++) {
            const nextMonthDay = moment(lastDay).add(i, 'days');
            const dateStr = nextMonthDay.format('YYYY-MM-DD');
            const weekStartStr = moment(nextMonthDay).startOf('isoWeek').format('YYYY-MM-DD');
            const isInSelectedWeek = weekStartStr === selWeekStart;

            const cell = grid.createDiv(`tl-periodic-cal-cell tl-periodic-cal-cell-other-month ${isInSelectedWeek ? 'tl-periodic-cal-cell-week-highlight' : ''}`);
            cell.setText(`${nextMonthDay.date()}`);
            cell.addEventListener('click', () => {
                h.periodicSelectedDate = moment(nextMonthDay);
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
        const isoWeek = weekStart.isoWeek();
        const weekLabel = `W${String(isoWeek).padStart(2, '0')}`;

        const preview = body.createDiv('tl-periodic-preview');
        const previewHeader = preview.createDiv('tl-periodic-preview-header');
        previewHeader.createEl('span', {
            cls: 'tl-periodic-preview-date',
            text: `${weekStart.isoWeekYear()}-${weekLabel} (${weekStart.format('M/D')}—${moment(weekStart).add(6, 'days').format('M/D')})`,
        });

        // Try load weekly plan file — use consistent path
        const weeklyPath = `${h.plugin.settings.planFolder}/Weekly/${weekStart.isoWeekYear()}-${weekLabel}.md`;
        const weekFile = h.app.vault.getAbstractFileByPath(weeklyPath);

        if (weekFile && weekFile instanceof TFile) {
            const content = await h.app.vault.read(weekFile);

            // Tasks from weekly plan
            const tasks = h.parseMdTasks(content).filter(t => t.isTask);
            const taskSection = preview.createDiv('tl-periodic-task-section');
            if (tasks.length > 0) {
                taskSection.createDiv({ cls: 'tl-periodic-task-group-label', text: t('periodic.weekTasks', String(tasks.length)) });
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

            aggSection.createDiv({ cls: 'tl-periodic-task-group-label', text: t('periodic.weekDiaryTasks', String(undone.length), String(done.length)) });
            for (const t of undone.slice(0, 10)) {
                const row = aggSection.createDiv('tl-periodic-task-row');
                row.createEl('span', { cls: 'tl-periodic-task-check', text: '○' });
                row.createEl('span', { cls: 'tl-periodic-task-text', text: t.text });
                row.createEl('span', { cls: 'tl-periodic-task-date-badge', text: t.date });
            }
            if (undone.length > 10) {
                aggSection.createEl('span', { cls: 'tl-periodic-task-more', text: t('periodic.moreItems', String(undone.length - 10)) });
            }
        }

        if (!weekFile && dailyTasks.length === 0) {
            preview.createDiv({ cls: 'tl-periodic-preview-empty', text: t('kanban.noWeekPlan') });
        }

        // AI Insight summary for this week
        await this.renderWeeklyInsight(preview, weekStart);

        // Open / Create button
        const openBtn = preview.createDiv('tl-periodic-open-btn');
        if (weekFile) {
            openBtn.setText(t('periodic.openWeekPlan'));
            openBtn.addEventListener('click', () => {
                if (weekFile instanceof TFile) void h.app.workspace.getLeaf().openFile(weekFile);
            });
        } else {
            openBtn.setText(t('periodic.createWeekPlan'));
            openBtn.addEventListener('click', () => {
                void (async () => {
                    const tmpl = h.plugin.templateManager.getWeeklyPlanTemplate(weekLabel, weekStart.format('YYYY-MM'));
                    const f = await h.plugin.vaultManager.getOrCreateWeeklyPlan(weekStart.toDate(), tmpl);
                    void h.app.workspace.getLeaf().openFile(f);
                })();
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
            `${h.plugin.settings.archiveFolder}/Insights/${t('insight.weeklyFileName', year, weekNum)}`,
            `${h.plugin.settings.archiveFolder}/Insights/${t('insight.weeklyFileName', year, String(parseInt(weekNum, 10)))}`,
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
        section.createDiv({ cls: 'tl-periodic-insight-label', text: t('periodic.aiWeeklySummary') });

        // Extract key sections from insight report
        const extracts: { icon: string; pattern: RegExp }[] = [
            { icon: '📊', pattern: /### \d+\.\s*(?:本周概览|Weekly Overview)\n([\s\S]*?)(?=###|$)/ },
            { icon: '🏆', pattern: /### \d+\.\s*(?:成功模式|Success Patterns)\n([\s\S]*?)(?=###|$)/ },
            { icon: '💡', pattern: /### \d+\.\s*(?:下周建议|Next Week Suggestions)\n([\s\S]*?)(?=###|$)/ },
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
            link.setText(t('review.viewFullReport'));
            link.addEventListener('click', () => {
                void h.app.workspace.getLeaf().openFile(insightFile);
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
        calNav.createEl('span', { cls: 'tl-periodic-cal-title', text: getLanguage() === 'en' ? String(year) : `${year}年` });
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
            cell.setText(getLanguage() === 'en' ? moment().month(m - 1).format('MMM') : `${m}月`);
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
        previewHeader.createEl('span', { cls: 'tl-periodic-preview-date', text: t('periodic.monthPlan', monthStr) });

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
                goalsDiv.createEl('div', { cls: 'tl-periodic-goals-label', text: t('periodic.monthGoals') });
                for (const g of goalLines.slice(0, 8)) {
                    goalsDiv.createEl('div', { cls: 'tl-periodic-goal-line', text: g.replace(/^[-*]\s*/, '') });
                }
            }

            // Tasks from monthly plan
            const tasks = h.parseMdTasks(content).filter(t => t.isTask);
            const taskSection = preview.createDiv('tl-periodic-task-section');
            if (tasks.length > 0) {
                taskSection.createDiv({ cls: 'tl-periodic-task-group-label', text: t('periodic.monthTasks', String(tasks.length)) });
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
            statsDiv.createEl('span', { text: t('periodic.diaryCount', String(allFiles.length)) });
        }

        if (!monthFile && allFiles.length === 0) {
            preview.createDiv({ cls: 'tl-periodic-preview-empty', text: t('kanban.noMonthPlan') });
        }

        // Open / Create button
        const openBtn = preview.createDiv('tl-periodic-open-btn');
        if (monthFile) {
            openBtn.setText(t('periodic.openMonthPlan'));
            openBtn.addEventListener('click', () => {
                if (monthFile instanceof TFile) void h.app.workspace.getLeaf().openFile(monthFile);
            });
        } else {
            openBtn.setText(t('periodic.createMonthPlan'));
            openBtn.addEventListener('click', () => {
                void (async () => {
                    const tmpl = h.plugin.templateManager.getMonthlyPlanTemplate(monthStr);
                    const f = await h.plugin.vaultManager.getOrCreateMonthlyPlan(date.toDate(), tmpl);
                    void h.app.workspace.getLeaf().openFile(f);
                })();
            });
        }
    }

    // ──────────────────────────────────────────────────────
    // Shared task renderer & input (Things/TickTick style)
    // ──────────────────────────────────────────────────────

    private renderTask(container: HTMLElement, task: { text: string; done: boolean; indent: number }, file: TFile, sourceDate?: moment.Moment): void {
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
        cb.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            void (async () => {
                await h.toggleMdTask(file, task.text, task.done);
                task.done = !task.done;
                cb.checked = task.done;
                row.toggleClass('tl-periodic-task-row-done', task.done);
                label.toggleClass('tl-text-done', task.done);
            })();
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
            const save = () => {
                void (async () => {
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
                })();
            };
            input.addEventListener('blur', save);
            input.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
                if (e.key === 'Escape') { input.value = task.text; input.blur(); }
            });
        });

        // Delete button
        const delBtn = row.createEl('span', { cls: 'tl-task-delete-btn', text: '×' });
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            void (async () => {
                await h.deleteMdTask(file, task.text);
                row.remove();
            })();
        });

        // Add sub-task button
        const subBtn = row.createEl('span', { cls: 'tl-task-sub-btn', text: '+' });
        subBtn.setAttribute('title', t('task.addSubtask'));
        subBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (row.nextElementSibling?.hasClass('tl-subtask-input-row')) return;
            const subRow = document.createElement('div');
            subRow.className = 'tl-subtask-input-row';
            const subInput = document.createElement('input');
            subInput.type = 'text';
            subInput.className = 'tl-periodic-task-input tl-subtask-input';
            subInput.placeholder = t('task.subtaskPlaceholder');
            subRow.appendChild(subInput);
            row.after(subRow);
            subInput.focus();

            const doAddSub = () => {
                void (async () => {
                    const text = subInput.value.trim();
                    subRow.remove();
                    if (!text) return;
                    await h.addSubTask(file, task.text, text);
                    h.invalidateTabCache('kanban');
                    h.switchTab('kanban');
                })();
            };
            subInput.addEventListener('blur', doAddSub);
            subInput.addEventListener('keydown', (ke: KeyboardEvent) => {
                if (ke.key === 'Enter') { ke.preventDefault(); subInput.blur(); }
                if (ke.key === 'Escape') { subInput.value = ''; subInput.blur(); }
            });
        });

        // Defer-to-today button — only for uncompleted tasks on past dates
        if (sourceDate && !task.done && sourceDate.isBefore(moment(), 'day')) {
            const deferBtn = row.createEl('span', { cls: 'tl-task-defer-btn', attr: { title: t('periodic.deferToday') } });
            setIcon(deferBtn, 'forward');
            deferBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                void (async () => {
                    await h.deferTaskToToday(file, task.text);
                    row.remove();
                })();
            });
        }

        // Right-click context menu with date quick-change
        row.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Remove any existing popup
            document.querySelectorAll('.tl-task-date-popup').forEach(el => el.remove());

            const popup = document.createElement('div');
            popup.className = 'tl-task-date-popup';

            // Header
            popup.createEl('div', { cls: 'tl-task-date-popup-header', text: t('periodic.dateLabel') });

            // Button row
            const btnRow = popup.createDiv('tl-task-date-popup-buttons');

            const todayDate = moment();
            const tomorrowDate = moment().add(1, 'day');
            const nextWeekDate = moment().startOf('isoWeek').add(1, 'week');

            // Today
            const todayBtn = btnRow.createEl('button', { cls: 'tl-task-date-btn', attr: { title: t('kanban.today') } });
            const todayIcon = todayBtn.createDiv('tl-task-date-btn-icon');
            setIcon(todayIcon, 'sun');
            todayBtn.createEl('span', { cls: 'tl-task-date-btn-label', text: t('kanban.today') });
            todayBtn.addEventListener('click', () => {
                popup.remove();
                void (async () => {
                    await h.moveTaskToDate(file, task.text, todayDate.toDate());
                    row.remove();
                })();
            });

            // Tomorrow
            const tmrBtn = btnRow.createEl('button', { cls: 'tl-task-date-btn', attr: { title: t('periodic.tomorrow') } });
            const tmrIcon = tmrBtn.createDiv('tl-task-date-btn-icon');
            setIcon(tmrIcon, 'sunrise');
            tmrBtn.createEl('span', { cls: 'tl-task-date-btn-label', text: t('periodic.tomorrow') });
            tmrBtn.addEventListener('click', () => {
                popup.remove();
                void (async () => {
                    await h.moveTaskToDate(file, task.text, tomorrowDate.toDate());
                    row.remove();
                })();
            });

            // Next week
            const weekBtn = btnRow.createEl('button', { cls: 'tl-task-date-btn', attr: { title: t('periodic.nextWeek') } });
            const weekIcon = weekBtn.createDiv('tl-task-date-btn-icon');
            setIcon(weekIcon, 'calendar-plus');
            weekBtn.createEl('span', { cls: 'tl-task-date-btn-label', text: t('periodic.nextWeek') });
            weekBtn.addEventListener('click', () => {
                popup.remove();
                void (async () => {
                    await h.moveTaskToDate(file, task.text, nextWeekDate.toDate());
                    row.remove();
                })();
            });

            // Custom date picker
            const customBtn = btnRow.createEl('button', { cls: 'tl-task-date-btn', attr: { title: t('periodic.customDate') } });
            const customIcon = customBtn.createDiv('tl-task-date-btn-icon');
            setIcon(customIcon, 'calendar-search');
            customBtn.createEl('span', { cls: 'tl-task-date-btn-label', text: t('periodic.custom') });
            const hiddenInput = document.createElement('input');
            hiddenInput.type = 'date';
            hiddenInput.className = 'tl-task-date-hidden-input';
            popup.appendChild(hiddenInput);
            hiddenInput.addEventListener('change', () => {
                popup.remove();
                if (!hiddenInput.value) return;
                const picked = new Date(hiddenInput.value + 'T00:00:00');
                void (async () => {
                    await h.moveTaskToDate(file, task.text, picked);
                    row.remove();
                })();
            });
            customBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                hiddenInput.showPicker();
            });

            document.body.appendChild(popup);

            // Position the popup near the click
            const popupWidth = 220;
            const popupHeight = 100;
            let left = e.clientX;
            let top = e.clientY;
            if (left + popupWidth > window.innerWidth) left = window.innerWidth - popupWidth - 8;
            if (top + popupHeight > window.innerHeight) top = e.clientY - popupHeight;
            popup.setCssProps({ '--tl-pop-left': `${left}px`, '--tl-pop-top': `${top}px` });

            // Dismiss on outside click
            const dismiss = (ev: MouseEvent) => {
                if (!popup.contains(ev.target as Node)) {
                    popup.remove();
                    document.removeEventListener('click', dismiss, true);
                }
            };
            setTimeout(() => document.addEventListener('click', dismiss, true), 0);
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
        row.addEventListener('drop', (e) => {
            e.preventDefault();
            const wasNest = nestMode;
            const wasPromote = promoteMode;
            clearTimers();
            const draggedText = e.dataTransfer?.getData('text/plain');
            if (!draggedText || draggedText === task.text) return;

            void (async () => {
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
            })();
        });
    }

    /** Inline task-add input */
    private renderTaskInput(container: HTMLElement, file: TFile): void {
        const h = this.host;
        const row = container.createDiv('tl-periodic-task-input-row');
        const input = row.createEl('input', {
            type: 'text',
            cls: 'tl-periodic-task-input',
            attr: { placeholder: t('periodic.addTaskPlaceholder') },
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

        addBtn.addEventListener('click', () => void doAdd());
        input.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') { e.preventDefault(); void doAdd(); }
        });
    }

    /** Task input that auto-creates the daily note file */
    private renderTaskInputForDate(container: HTMLElement, date: moment.Moment): void {
        const h = this.host;
        const row = container.createDiv('tl-periodic-task-input-row');
        const input = row.createEl('input', {
            type: 'text',
            cls: 'tl-periodic-task-input',
            attr: { placeholder: t('periodic.addTaskPlaceholder') },
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

        addBtn.addEventListener('click', () => void doAdd());
        input.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') { e.preventDefault(); void doAdd(); }
        });
    }

    /** Task input that auto-creates the weekly plan file */
    private renderTaskInputForWeek(container: HTMLElement, weekStart: moment.Moment, weekLabel: string): void {
        const h = this.host;
        const row = container.createDiv('tl-periodic-task-input-row');
        const input = row.createEl('input', {
            type: 'text',
            cls: 'tl-periodic-task-input',
            attr: { placeholder: t('periodic.addWeekTaskPlaceholder') },
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

        addBtn.addEventListener('click', () => void doAdd());
        input.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') { e.preventDefault(); void doAdd(); }
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
            attr: { placeholder: t('periodic.addMonthTaskPlaceholder') },
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

        addBtn.addEventListener('click', () => void doAdd());
        input.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') { e.preventDefault(); void doAdd(); }
        });
    }
}
