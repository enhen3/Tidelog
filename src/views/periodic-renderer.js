/**
 * Periodic Renderer - LifeOS-style periodic navigator
 * Replaces the old kanban-renderer with a day/week/month period selector + content preview.
 */
import { TFile, moment, setIcon } from 'obsidian';
import { t, getLanguage } from '../i18n';
export class PeriodicRenderer {
    constructor(host) {
        this.host = host;
    }
    async render(panel) {
        panel.addClass('tl-periodic');
        // Sub-tab bar: 日 | 周 | 月
        this.renderModeBar(panel);
        // Period selector + content preview
        const body = panel.createDiv('tl-periodic-body');
        const mode = this.host.periodicMode;
        if (mode === 'day') {
            await this.renderDayMode(body);
        }
        else if (mode === 'week') {
            await this.renderWeekMode(body);
        }
        else {
            await this.renderMonthMode(body);
        }
    }
    // ──────────────────────────────────────────────────────
    // Mode bar: 日 | 周 | 月
    // ──────────────────────────────────────────────────────
    renderModeBar(panel) {
        const h = this.host;
        const bar = panel.createDiv('tl-periodic-mode-bar');
        const modes = [
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
    async renderDayMode(body) {
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
        for (let i = 0; i < startPad; i++)
            grid.createDiv('tl-periodic-cal-cell tl-periodic-cal-cell-empty');
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
    async renderDayPreview(body, date) {
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
        }
        else {
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
    async renderPlanSuggestion(container, date) {
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
            if (reviewIdx < 0)
                reviewIdx = content.indexOf('## Review');
            if (reviewIdx < 0) {
                this.showFallbackTip(section, date);
                return;
            }
            const reviewLabel = content.indexOf('## 复盘') >= 0 ? '## 复盘' : '## Review';
            let reviewContent = content.substring(reviewIdx + reviewLabel.length);
            // Cut at next "---" or "## " header
            const endIdx = reviewContent.indexOf('\n---');
            if (endIdx > 0)
                reviewContent = reviewContent.substring(0, endIdx);
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
                        if (end > 0)
                            body = body.substring(end + 3);
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
            const loadingEl = section.createDiv({ cls: 'tl-plan-suggestion-line', text: t('periodic.generatingSuggestion') });
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
                const messages = [
                    { role: 'user', content: `我的昨日复盘：\n${reviewContent}`, timestamp: Date.now() }
                ];
                const suggestions = await provider.sendMessage(messages, systemPrompt, () => { });
                loadingEl.remove();
                if (suggestions && suggestions.trim()) {
                    const lines = suggestions.trim().split('\n').filter((l) => l.trim());
                    for (const line of lines) {
                        section.createDiv({ cls: 'tl-plan-suggestion-line', text: line.trim() });
                    }
                    // Save to cache
                    const cacheContent = `---\ndate: ${cacheKey}\nupdated: ${new Date().toISOString()}\n---\n${suggestions.trim()}`;
                    if (cacheFile && cacheFile instanceof TFile) {
                        await h.app.vault.modify(cacheFile, cacheContent);
                    }
                    else {
                        const folder = cachePath.substring(0, cachePath.lastIndexOf('/'));
                        if (!h.app.vault.getAbstractFileByPath(folder)) {
                            await h.app.vault.createFolder(folder);
                        }
                        await h.app.vault.create(cachePath, cacheContent);
                    }
                }
                else {
                    this.showFallbackTip(section, date);
                }
            }
            catch {
                loadingEl.remove();
                this.showFallbackTip(section, date);
            }
        }
        else {
            // Future dates: show a planning tip
            section.createDiv({ cls: 'tl-plan-suggestion-header', text: t('periodic.planTip') });
            this.showFallbackTip(section, date);
        }
    }
    showFallbackTip(section, date) {
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
    renderReviewSection(preview, content) {
        // Find 复盘 section — handle optional blank lines
        let reviewIdx = content.indexOf('## 复盘');
        if (reviewIdx < 0)
            reviewIdx = content.indexOf('## Review');
        if (reviewIdx < 0)
            return;
        // Get everything after "## 复盘" until next --- or end
        const reviewLabel = content.indexOf('## 复盘') >= 0 ? '## 复盘' : '## Review';
        let reviewContent = content.substring(reviewIdx + reviewLabel.length);
        const endIdx = reviewContent.indexOf('\n---');
        if (endIdx > 0)
            reviewContent = reviewContent.substring(0, endIdx);
        if (!reviewContent.trim())
            return;
        const section = preview.createDiv('tl-periodic-review-section');
        section.createDiv({ cls: 'tl-periodic-review-label', text: t('periodic.reviewLabel') });
        // Extract sub-sections — use indexOf-based approach for robustness
        const subSections = [
            { icon: '🎯', title: t('insight.sectionGoalAlign'), heading: '### ' + t('insight.sectionGoalAlign') },
            { icon: '🏆', title: t('insight.sectionSuccess'), heading: '### ' + t('insight.sectionSuccess') },
            { icon: '😟', title: t('insight.sectionAnxiety'), heading: '### ' + t('insight.sectionAnxiety') },
            { icon: '📌', title: t('insight.sectionTomorrow'), heading: '### ' + t('insight.sectionTomorrow') },
        ];
        for (const sub of subSections) {
            const idx = reviewContent.indexOf(sub.heading);
            if (idx < 0)
                continue;
            // Get text between this heading and next ### or end
            let subText = reviewContent.substring(idx + sub.heading.length);
            const nextH = subText.indexOf('\n###');
            if (nextH > 0)
                subText = subText.substring(0, nextH);
            const lines = subText.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
            if (lines.length === 0)
                continue;
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
    async renderWeekMode(body) {
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
        for (let i = 0; i < startPad; i++)
            grid.createDiv('tl-periodic-cal-cell tl-periodic-cal-cell-empty');
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
    async renderWeekPreview(body, weekStart) {
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
        }
        else {
            // No weekly file — show task input that auto-creates file
            const taskSection = preview.createDiv('tl-periodic-task-section');
            this.renderTaskInputForWeek(taskSection, weekStart, weekLabel);
        }
        // Aggregate daily tasks for this week
        const dailyTasks = [];
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
                }
                catch { /* skip */ }
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
                if (weekFile instanceof TFile)
                    void h.app.workspace.getLeaf().openFile(weekFile);
            });
        }
        else {
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
    async renderWeeklyInsight(preview, weekStart) {
        const h = this.host;
        const weekNum = weekStart.format('ww');
        const year = weekStart.format('YYYY');
        // Try various naming patterns
        const patterns = [
            `${h.plugin.settings.archiveFolder}/Insights/${t('insight.weeklyFileName', year, weekNum)}`,
            `${h.plugin.settings.archiveFolder}/Insights/${t('insight.weeklyFileName', year, String(parseInt(weekNum, 10)))}`,
        ];
        let insightContent = null;
        let insightFile = null;
        for (const p of patterns) {
            const f = h.app.vault.getAbstractFileByPath(p);
            if (f && f instanceof TFile) {
                insightContent = await h.app.vault.read(f);
                insightFile = f;
                break;
            }
        }
        if (!insightContent)
            return;
        const section = preview.createDiv('tl-periodic-insight-section');
        section.createDiv({ cls: 'tl-periodic-insight-label', text: t('periodic.aiWeeklySummary') });
        // Extract key sections from insight report
        const extracts = [
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
    async renderMonthMode(body) {
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
    async renderMonthPreview(body, date) {
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
            const goalLines = [];
            let inGoals = false;
            for (const line of lines) {
                if (line.startsWith('## ') || line.startsWith('# ')) {
                    if (inGoals)
                        break;
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
        }
        else {
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
                if (monthFile instanceof TFile)
                    void h.app.workspace.getLeaf().openFile(monthFile);
            });
        }
        else {
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
    renderTask(container, task, file, sourceDate) {
        const h = this.host;
        const row = container.createDiv(`tl-periodic-task-row ${task.done ? 'tl-periodic-task-row-done' : ''}`);
        row.dataset.taskText = task.text;
        row.dataset.taskIndent = String(task.indent);
        row.setAttribute('draggable', 'false');
        if (task.indent > 0) {
            row.addClass('tl-periodic-task-subtask');
            row.style.setProperty('--tl-indent-pad', `${20 + task.indent * 20}px`);
        }
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
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    input.blur();
                }
                if (e.key === 'Escape') {
                    input.value = task.text;
                    input.blur();
                }
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
            if (row.nextElementSibling?.hasClass('tl-subtask-input-row'))
                return;
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
                    if (!text)
                        return;
                    await h.addSubTask(file, task.text, text);
                    h.invalidateTabCache('kanban');
                    h.switchTab('kanban');
                })();
            };
            subInput.addEventListener('blur', doAddSub);
            subInput.addEventListener('keydown', (ke) => {
                if (ke.key === 'Enter') {
                    ke.preventDefault();
                    subInput.blur();
                }
                if (ke.key === 'Escape') {
                    subInput.value = '';
                    subInput.blur();
                }
            });
        });
        // Drag handle — right side, after action buttons
        const handle = row.createEl('span', { cls: 'tl-task-drag-handle', text: '☰' });
        handle.setAttribute('title', t('periodic.dragToReorder'));
        handle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            row.setAttribute('draggable', 'true');
            document.addEventListener('mouseup', () => row.setAttribute('draggable', 'false'), { once: true });
        });
        row.addEventListener('dragend', () => row.setAttribute('draggable', 'false'));
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
                if (!hiddenInput.value)
                    return;
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
            if (left + popupWidth > window.innerWidth)
                left = window.innerWidth - popupWidth - 8;
            if (top + popupHeight > window.innerHeight)
                top = e.clientY - popupHeight;
            popup.setCssProps({ '--tl-pop-left': `${left}px`, '--tl-pop-top': `${top}px` });
            // Dismiss on outside click
            const dismiss = (ev) => {
                if (!popup.contains(ev.target)) {
                    popup.remove();
                    document.removeEventListener('click', dismiss, true);
                }
            };
            setTimeout(() => document.addEventListener('click', dismiss, true), 0);
        });
        // Drag & drop: default = reorder (subtasks auto-promote), hover 1s = nest
        let nestTimer = null;
        let nestMode = false;
        const clearDragState = () => {
            if (nestTimer) {
                clearTimeout(nestTimer);
                nestTimer = null;
            }
            nestMode = false;
            row.removeClass('tl-task-row-drop-above', 'tl-task-row-drop-below', 'tl-task-row-nest-hint');
        };
        row.addEventListener('dragstart', (e) => {
            e.dataTransfer?.setData('text/plain', task.text);
            e.dataTransfer?.setData('text/x-indent', String(task.indent));
            row.addClass('tl-task-row-dragging');
        });
        row.addEventListener('dragend', () => {
            row.removeClass('tl-task-row-dragging');
            clearDragState();
        });
        row.addEventListener('dragover', (e) => {
            e.preventDefault();
            // If already in nest mode, keep it
            if (nestMode)
                return;
            // Show reorder indicator
            row.removeClass('tl-task-row-drop-above', 'tl-task-row-drop-below');
            const rect = row.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            if (e.clientY < midY) {
                row.addClass('tl-task-row-drop-above');
            }
            else {
                row.addClass('tl-task-row-drop-below');
            }
            // Start nest timer (1s hover → nest mode)
            if (!nestTimer) {
                nestTimer = setTimeout(() => {
                    nestMode = true;
                    row.removeClass('tl-task-row-drop-above', 'tl-task-row-drop-below');
                    row.addClass('tl-task-row-nest-hint');
                }, 1000);
            }
        });
        row.addEventListener('dragleave', () => {
            clearDragState();
        });
        row.addEventListener('drop', (e) => {
            e.preventDefault();
            const wasNest = nestMode;
            clearDragState();
            const draggedText = e.dataTransfer?.getData('text/plain');
            if (!draggedText || draggedText === task.text)
                return;
            const draggedIndent = parseInt(e.dataTransfer?.getData('text/x-indent') || '0', 10);
            void (async () => {
                if (wasNest) {
                    // Nest: make sub-task
                    await h.deleteMdTask(file, draggedText);
                    await h.addSubTask(file, task.text, draggedText);
                    h.invalidateTabCache('kanban');
                    h.switchTab('kanban');
                }
                else {
                    // Reorder — if dragged item is a subtask, auto-promote first
                    if (draggedIndent > 0) {
                        await h.setTaskIndent(file, draggedText, 0);
                    }
                    const parent = row.parentElement;
                    if (!parent)
                        return;
                    const rows = Array.from(parent.querySelectorAll('.tl-periodic-task-row'));
                    const texts = rows.map(r => r.dataset.taskText || '').filter(t => t);
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
    renderTaskInput(container, file) {
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
            if (!text)
                return;
            input.value = '';
            await h.addMdTask(file, text);
            h.invalidateTabCache('kanban');
            h.switchTab('kanban');
        };
        addBtn.addEventListener('click', () => void doAdd());
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                void doAdd();
            }
        });
    }
    /** Task input that auto-creates the daily note file */
    renderTaskInputForDate(container, date) {
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
            if (!text)
                return;
            input.value = '';
            // Auto-create daily note if needed
            const file = await h.plugin.vaultManager.getOrCreateDailyNote(date.toDate());
            await h.addMdTask(file, text);
            h.invalidateTabCache('kanban');
            h.switchTab('kanban');
        };
        addBtn.addEventListener('click', () => void doAdd());
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                void doAdd();
            }
        });
    }
    /** Task input that auto-creates the weekly plan file */
    renderTaskInputForWeek(container, weekStart, weekLabel) {
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
            if (!text)
                return;
            input.value = '';
            const tmpl = h.plugin.templateManager.getWeeklyPlanTemplate(weekLabel, weekStart.format('YYYY-MM'));
            const file = await h.plugin.vaultManager.getOrCreateWeeklyPlan(weekStart.toDate(), tmpl);
            await h.addMdTask(file, text);
            h.invalidateTabCache('kanban');
            h.switchTab('kanban');
        };
        addBtn.addEventListener('click', () => void doAdd());
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                void doAdd();
            }
        });
    }
    /** Task input that auto-creates the monthly plan file */
    renderTaskInputForMonth(container, date) {
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
            if (!text)
                return;
            input.value = '';
            const tmpl = h.plugin.templateManager.getMonthlyPlanTemplate(monthStr);
            const file = await h.plugin.vaultManager.getOrCreateMonthlyPlan(date.toDate(), tmpl);
            await h.addMdTask(file, text);
            h.invalidateTabCache('kanban');
            h.switchTab('kanban');
        };
        addBtn.addEventListener('click', () => void doAdd());
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                void doAdd();
            }
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGVyaW9kaWMtcmVuZGVyZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJwZXJpb2RpYy1yZW5kZXJlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O0dBR0c7QUFFSCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFHbEQsT0FBTyxFQUFFLENBQUMsRUFBRSxXQUFXLEVBQUUsTUFBTSxTQUFTLENBQUM7QUF5QnpDLE1BQU0sT0FBTyxnQkFBZ0I7SUFDekIsWUFBb0IsSUFBa0I7UUFBbEIsU0FBSSxHQUFKLElBQUksQ0FBYztJQUFJLENBQUM7SUFFM0MsS0FBSyxDQUFDLE1BQU0sQ0FBQyxLQUFrQjtRQUMzQixLQUFLLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBRTlCLHlCQUF5QjtRQUN6QixJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRTFCLG9DQUFvQztRQUNwQyxNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDakQsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUM7UUFFcEMsSUFBSSxJQUFJLEtBQUssS0FBSyxFQUFFLENBQUM7WUFDakIsTUFBTSxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ25DLENBQUM7YUFBTSxJQUFJLElBQUksS0FBSyxNQUFNLEVBQUUsQ0FBQztZQUN6QixNQUFNLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDcEMsQ0FBQzthQUFNLENBQUM7WUFDSixNQUFNLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDckMsQ0FBQztJQUNMLENBQUM7SUFFRCx5REFBeUQ7SUFDekQsc0JBQXNCO0lBQ3RCLHlEQUF5RDtJQUVqRCxhQUFhLENBQUMsS0FBa0I7UUFDcEMsTUFBTSxD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Iiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBQZXJpb2RpYyBSZW5kZXJlciAtIExpZmVPUy1zdHlsZSBwZXJpb2RpYyBuYXZpZ2F0b3JcbiAqIFJlcGxhY2VzIHRoZSBvbGQga2FuYmFuLXJlbmRlcmVyIHdpdGggYSBkYXkvd2Vlay9tb250aCBwZXJpb2Qgc2VsZWN0b3IgKyBjb250ZW50IHByZXZpZXcuXG4gKi9cblxuaW1wb3J0IHsgVEZpbGUsIG1vbWVudCwgc2V0SWNvbiB9IGZyb20gJ29ic2lkaWFuJztcbmltcG9ydCB0eXBlIFRpZGVMb2dQbHVnaW4gZnJvbSAnLi4vbWFpbic7XG5pbXBvcnQgdHlwZSB7IEFwcCB9IGZyb20gJ29ic2lkaWFuJztcbmltcG9ydCB7IHQsIGdldExhbmd1YWdlIH0gZnJvbSAnLi4vaTE4bic7XG5cbmV4cG9ydCB0eXBlIFBlcmlvZGljTW9kZSA9ICdkYXknIHwgJ3dlZWsnIHwgJ21vbnRoJztcblxuLyoqIEhvc3QgdmlldyBpbnRlcmZhY2UgKi9cbmV4cG9ydCBpbnRlcmZhY2UgUGVyaW9kaWNIb3N0IHtcbiAgICBwbHVnaW46IFRpZGVMb2dQbHVnaW47XG4gICAgYXBwOiBBcHA7XG4gICAgcGVyaW9kaWNNb2RlOiBQZXJpb2RpY01vZGU7XG4gICAgcGVyaW9kaWNTZWxlY3RlZERhdGU6IG1vbWVudC5Nb21lbnQ7XG4gICAgcGVyaW9kaWNNb250aE9mZnNldDogbnVtYmVyO1xuICAgIHBhcnNlTWRUYXNrcyhjb250ZW50OiBzdHJpbmcpOiB7IHRleHQ6IHN0cmluZzsgZG9uZTogYm9vbGVhbjsgaXNUYXNrOiBib29sZWFuOyBzZWN0aW9uOiBzdHJpbmc7IGluZGVudDogbnVtYmVyIH1bXTtcbiAgICB0b2dnbGVNZFRhc2soZmlsZTogVEZpbGUsIHRhc2tUZXh0OiBzdHJpbmcsIHdhc0RvbmU6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+O1xuICAgIGFkZE1kVGFzayhmaWxlOiBURmlsZSwgdGFza1RleHQ6IHN0cmluZywgaW5kZW50PzogbnVtYmVyKTogUHJvbWlzZTx2b2lkPjtcbiAgICBhZGRTdWJUYXNrKGZpbGU6IFRGaWxlLCBwYXJlbnRUZXh0OiBzdHJpbmcsIHN1YlRhc2tUZXh0OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+O1xuICAgIGVkaXRNZFRhc2soZmlsZTogVEZpbGUsIG9sZFRleHQ6IHN0cmluZywgbmV3VGV4dDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPjtcbiAgICBkZWxldGVNZFRhc2soZmlsZTogVEZpbGUsIHRhc2tUZXh0OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+O1xuICAgIHNldFRhc2tJbmRlbnQoZmlsZTogVEZpbGUsIHRhc2tUZXh0OiBzdHJpbmcsIG5ld0luZGVudDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPjtcbiAgICByZW9yZGVyTWRUYXNrcyhmaWxlOiBURmlsZSwgb3JkZXJlZFRleHRzOiBzdHJpbmdbXSk6IFByb21pc2U8dm9pZD47XG4gICAgZGVmZXJUYXNrVG9Ub2RheShzb3VyY2VGaWxlOiBURmlsZSwgdGFza1RleHQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD47XG4gICAgbW92ZVRhc2tUb0RhdGUoc291cmNlRmlsZTogVEZpbGUsIHRhc2tUZXh0OiBzdHJpbmcsIHRhcmdldERhdGU6IERhdGUpOiBQcm9taXNlPHZvaWQ+O1xuICAgIGludmFsaWRhdGVUYWJDYWNoZSh0YWI6IHN0cmluZyk6IHZvaWQ7XG4gICAgc3dpdGNoVGFiKHRhYjogc3RyaW5nKTogdm9pZDtcbn1cblxuZXhwb3J0IGNsYXNzIFBlcmlvZGljUmVuZGVyZXIge1xuICAgIGNvbnN0cnVjdG9yKHByaXZhdGUgaG9zdDogUGVyaW9kaWNIb3N0KSB7IH1cblxuICAgIGFzeW5jIHJlbmRlcihwYW5lbDogSFRNTEVsZW1lbnQpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgcGFuZWwuYWRkQ2xhc3MoJ3RsLXBlcmlvZGljJyk7XG5cbiAgICAgICAgLy8gU3ViLXRhYiBiYXI6IOaXpSB8IOWRqCB8IOaciFxuICAgICAgICB0aGlzLnJlbmRlck1vZGVCYXIocGFuZWwpO1xuXG4gICAgICAgIC8vIFBlcmlvZCBzZWxlY3RvciArIGNvbnRlbnQgcHJldmlld1xuICAgICAgICBjb25zdCBib2R5ID0gcGFuZWwuY3JlYXRlRGl2KCd0bC1wZXJpb2RpYy1ib2R5Jyk7XG4gICAgICAgIGNvbnN0IG1vZGUgPSB0aGlzLmhvc3QucGVyaW9kaWNNb2RlO1xuXG4gICAgICAgIGlmIChtb2RlID09PSAnZGF5Jykge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5yZW5kZXJEYXlNb2RlKGJvZHkpO1xuICAgICAgICB9IGVsc2UgaWYgKG1vZGUgPT09ICd3ZWVrJykge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5yZW5kZXJXZWVrTW9kZShib2R5KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucmVuZGVyTW9udGhNb2RlKGJvZHkpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8g4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gICAgLy8gTW9kZSBiYXI6IOaXpSB8IOWRqCB8IOaciFxuICAgIC8vIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG4gICAgcHJpdmF0ZSByZW5kZXJNb2RlQmFyKHBhbmVsOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuICAgICAgICBjb25zdCBoID0gdGhpcy5ob3N0O1xuICAgICAgICBjb25zdCBiYXIgPSBwYW5lbC5jcmVhdGVEaXYoJ3RsLXBlcmlvZGljLW1vZGUtYmFyJyk7XG4gICAgICAgIGNvbnN0IG1vZGVzOiB7IGlkOiBQZXJpb2RpY01vZGU7IGljb246IHN0cmluZzsgbGFiZWw6IHN0cmluZyB9W10gPSBbXG4gICAgICAgICAgICB7IGlkOiAnZGF5JywgaWNvbjogJ3N1bicsIGxhYmVsOiB0KCdwZXJpb2RpYy5kYXknKSB9LFxuICAgICAgICAgICAgeyBpZDogJ3dlZWsnLCBpY29uOiAnY2FsZW5kYXItcmFuZ2UnLCBsYWJlbDogdCgncGVyaW9kaWMud2VlaycpIH0sXG4gICAgICAgICAgICB7IGlkOiAnbW9udGgnLCBpY29uOiAnY2FsZW5kYXInLCBsYWJlbDogdCgncGVyaW9kaWMubW9udGgnKSB9LFxuICAgICAgICBdO1xuICAgICAgICBmb3IgKGNvbnN0IG0gb2YgbW9kZXMpIHtcbiAgICAgICAgICAgIGNvbnN0IGJ0biA9IGJhci5jcmVhdGVFbCgnYnV0dG9uJywge1xuICAgICAgICAgICAgICAgIGNsczogYHRsLXBlcmlvZGljLW1vZGUtYnRuICR7aC5wZXJpb2RpY01vZGUgPT09IG0uaWQgPyAndGwtcGVyaW9kaWMtbW9kZS1idG4tYWN0aXZlJyA6ICcnfWAsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHNldEljb24oYnRuLCBtLmljb24pO1xuICAgICAgICAgICAgYnRuLmNyZWF0ZVNwYW4oeyB0ZXh0OiBtLmxhYmVsIH0pO1xuICAgICAgICAgICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGgucGVyaW9kaWNNb2RlID0gbS5pZDtcbiAgICAgICAgICAgICAgICAvLyBSZXNldCB0byBjdXJyZW50IHBlcmlvZCB3aGVuIHN3aXRjaGluZ1xuICAgICAgICAgICAgICAgIGgucGVyaW9kaWNTZWxlY3RlZERhdGUgPSBtb21lbnQoKTtcbiAgICAgICAgICAgICAgICBoLnBlcmlvZGljTW9udGhPZmZzZXQgPSAwO1xuICAgICAgICAgICAgICAgIGguaW52YWxpZGF0ZVRhYkNhY2hlKCdrYW5iYW4nKTtcbiAgICAgICAgICAgICAgICBoLnN3aXRjaFRhYigna2FuYmFuJyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuICAgIC8vIERheSBNb2RlOiBtaW5pIGNhbGVuZGFyICsgZGFpbHkgbm90ZSBwcmV2aWV3XG4gICAgLy8g4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbiAgICBwcml2YXRlIGFzeW5jIHJlbmRlckRheU1vZGUoYm9keTogSFRNTEVsZW1lbnQpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgY29uc3QgaCA9IHRoaXMuaG9zdDtcbiAgICAgICAgY29uc3Qgc2VsID0gaC5wZXJpb2RpY1NlbGVjdGVkRGF0ZTtcbiAgICAgICAgY29uc3QgY2FsTW9udGggPSBtb21lbnQoc2VsKS5zdGFydE9mKCdtb250aCcpLmFkZChoLnBlcmlvZGljTW9udGhPZmZzZXQsICdtb250aHMnKTtcblxuICAgICAgICAvLyBDYWxlbmRhciBuYXZcbiAgICAgICAgY29uc3QgY2FsU2VjdGlvbiA9IGJvZHkuY3JlYXRlRGl2KCd0bC1wZXJpb2RpYy1zZWxlY3RvcicpO1xuICAgICAgICBjb25zdCBjYWxOYXYgPSBjYWxTZWN0aW9uLmNyZWF0ZURpdigndGwtcGVyaW9kaWMtY2FsLW5hdicpO1xuICAgICAgICBjb25zdCBwcmV2QnRuID0gY2FsTmF2LmNyZWF0ZUVsKCdidXR0b24nLCB7IGNsczogJ3RsLXBlcmlvZGljLW5hdi1idG4nLCB0ZXh0OiAn4oC5JyB9KTtcbiAgICAgICAgY2FsTmF2LmNyZWF0ZUVsKCdzcGFuJywgeyBjbHM6ICd0bC1wZXJpb2RpYy1jYWwtdGl0bGUnLCB0ZXh0OiBnZXRMYW5ndWFnZSgpID09PSAnZW4nID8gY2FsTW9udGguZm9ybWF0KCdNTU1NIFlZWVknKSA6IGNhbE1vbnRoLmZvcm1hdCgnWVlZWeW5tCBN5pyIJykgfSk7XG4gICAgICAgIGNvbnN0IG5leHRCdG4gPSBjYWxOYXYuY3JlYXRlRWwoJ2J1dHRvbicsIHsgY2xzOiAndGwtcGVyaW9kaWMtbmF2LWJ0bicsIHRleHQ6ICfigLonIH0pO1xuICAgICAgICBwcmV2QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4geyBoLnBlcmlvZGljTW9udGhPZmZzZXQtLTsgaC5pbnZhbGlkYXRlVGFiQ2FjaGUoJ2thbmJhbicpOyBoLnN3aXRjaFRhYigna2FuYmFuJyk7IH0pO1xuICAgICAgICBuZXh0QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4geyBoLnBlcmlvZGljTW9udGhPZmZzZXQrKzsgaC5pbnZhbGlkYXRlVGFiQ2FjaGUoJ2thbmJhbicpOyBoLnN3aXRjaFRhYigna2FuYmFuJyk7IH0pO1xuXG4gICAgICAgIC8vIE1pbmkgY2FsZW5kYXIgZ3JpZFxuICAgICAgICBjb25zdCBncmlkID0gY2FsU2VjdGlvbi5jcmVhdGVEaXYoJ3RsLXBlcmlvZGljLW1pbmktY2FsJyk7XG4gICAgICAgIGNvbnN0IHdlZWtkYXlzID0gdCgnY2FsLndlZWtkYXlzJykuc3BsaXQoJywnKTtcbiAgICAgICAgZm9yIChjb25zdCB3ZCBvZiB3ZWVrZGF5cykge1xuICAgICAgICAgICAgZ3JpZC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICd0bC1wZXJpb2RpYy1jYWwtd2QnLCB0ZXh0OiB3ZCB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGZpcnN0RGF5ID0gbW9tZW50KGNhbE1vbnRoKS5zdGFydE9mKCdtb250aCcpO1xuICAgICAgICBjb25zdCBzdGFydFBhZCA9IGZpcnN0RGF5Lmlzb1dlZWtkYXkoKSAtIDE7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc3RhcnRQYWQ7IGkrKykgZ3JpZC5jcmVhdGVEaXYoJ3RsLXBlcmlvZGljLWNhbC1jZWxsIHRsLXBlcmlvZGljLWNhbC1jZWxsLWVtcHR5Jyk7XG5cbiAgICAgICAgY29uc3QgdG9kYXlTdHIgPSBtb21lbnQoKS5mb3JtYXQoJ1lZWVktTU0tREQnKTtcbiAgICAgICAgY29uc3Qgc2VsU3RyID0gc2VsLmZvcm1hdCgnWVlZWS1NTS1ERCcpO1xuXG4gICAgICAgIGZvciAobGV0IGQgPSAxOyBkIDw9IGNhbE1vbnRoLmRheXNJbk1vbnRoKCk7IGQrKykge1xuICAgICAgICAgICAgY29uc3QgZGF0ZVN0ciA9IG1vbWVudChjYWxNb250aCkuZGF0ZShkKS5mb3JtYXQoJ1lZWVktTU0tREQnKTtcbiAgICAgICAgICAgIGNvbnN0IGlzVG9kYXkgPSBkYXRlU3RyID09PSB0b2RheVN0cjtcbiAgICAgICAgICAgIGNvbnN0IGlzU2VsZWN0ZWQgPSBkYXRlU3RyID09PSBzZWxTdHI7XG5cbiAgICAgICAgICAgIC8vIENoZWNrIGlmIG5vdGUgZXhpc3RzIEFORCBoYXMgcmVhbCBjb250ZW50ICh0YXNrcylcbiAgICAgICAgICAgIGNvbnN0IG5vdGVQYXRoID0gYCR7aC5wbHVnaW4uc2V0dGluZ3MuZGFpbHlGb2xkZXJ9LyR7ZGF0ZVN0cn0ubWRgO1xuICAgICAgICAgICAgY29uc3Qgbm90ZUZpbGUgPSBoLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgobm90ZVBhdGgpO1xuICAgICAgICAgICAgY29uc3QgaGFzTm90ZSA9IG5vdGVGaWxlIGluc3RhbmNlb2YgVEZpbGVcbiAgICAgICAgICAgICAgICAmJiAoaC5hcHAubWV0YWRhdGFDYWNoZS5nZXRGaWxlQ2FjaGUobm90ZUZpbGUpPy5saXN0SXRlbXM/LnNvbWUoaXRlbSA9PiBpdGVtLnRhc2sgIT09IHVuZGVmaW5lZCkgPz8gZmFsc2UpO1xuXG4gICAgICAgICAgICBjb25zdCBjZWxsID0gZ3JpZC5jcmVhdGVEaXYoYHRsLXBlcmlvZGljLWNhbC1jZWxsICR7aXNUb2RheSA/ICd0bC1wZXJpb2RpYy1jYWwtY2VsbC10b2RheScgOiAnJ30gJHtpc1NlbGVjdGVkID8gJ3RsLXBlcmlvZGljLWNhbC1jZWxsLXNlbGVjdGVkJyA6ICcnfSAke2hhc05vdGUgPyAndGwtcGVyaW9kaWMtY2FsLWNlbGwtaGFzLW5vdGUnIDogJyd9YCk7XG4gICAgICAgICAgICBjZWxsLnNldFRleHQoYCR7ZH1gKTtcbiAgICAgICAgICAgIGNlbGwuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgaC5wZXJpb2RpY1NlbGVjdGVkRGF0ZSA9IG1vbWVudChjYWxNb250aCkuZGF0ZShkKTtcbiAgICAgICAgICAgICAgICBoLmludmFsaWRhdGVUYWJDYWNoZSgna2FuYmFuJyk7XG4gICAgICAgICAgICAgICAgaC5zd2l0Y2hUYWIoJ2thbmJhbicpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBQcmV2aWV3IGFyZWFcbiAgICAgICAgYXdhaXQgdGhpcy5yZW5kZXJEYXlQcmV2aWV3KGJvZHksIHNlbCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyByZW5kZXJEYXlQcmV2aWV3KGJvZHk6IEhUTUxFbGVtZW50LCBkYXRlOiBtb21lbnQuTW9tZW50KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGNvbnN0IGggPSB0aGlzLmhvc3Q7XG4gICAgICAgIGNvbnN0IGRhdGVTdHIgPSBkYXRlLmZvcm1hdCgnWVlZWS1NTS1ERCcpO1xuICAgICAgICBjb25zdCBkYXlOYW1lID0gZGF0ZS5mb3JtYXQoJ2RkZGQnKTtcbiAgICAgICAgY29uc3QgcGF0aCA9IGAke2gucGx1Z2luLnNldHRpbmdzLmRhaWx5Rm9sZGVyfS8ke2RhdGVTdHJ9Lm1kYDtcbiAgICAgICAgY29uc3QgZmlsZSA9IGguYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChwYXRoKTtcblxuICAgICAgICBjb25zdCBwcmV2aWV3ID0gYm9keS5jcmVhdGVEaXYoJ3RsLXBlcmlvZGljLXByZXZpZXcnKTtcbiAgICAgICAgY29uc3QgcHJldmlld0hlYWRlciA9IHByZXZpZXcuY3JlYXRlRGl2KCd0bC1wZXJpb2RpYy1wcmV2aWV3LWhlYWRlcicpO1xuICAgICAgICBwcmV2aWV3SGVhZGVyLmNyZWF0ZUVsKCdzcGFuJywgeyBjbHM6ICd0bC1wZXJpb2RpYy1wcmV2aWV3LWRhdGUnLCB0ZXh0OiBgJHtkYXRlU3RyfSAke2RheU5hbWV9YCB9KTtcblxuICAgICAgICBpZiAoIWZpbGUgfHwgIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpKSB7XG4gICAgICAgICAgICAvLyBTaG93IHRhc2sgaW5wdXQgZXZlbiBmb3IgZnV0dXJlL2VtcHR5IGRhdGVzIOKAlCBhdXRvLWNyZWF0ZSBmaWxlXG4gICAgICAgICAgICB0aGlzLnJlbmRlclRhc2tJbnB1dEZvckRhdGUocHJldmlldywgZGF0ZSk7XG4gICAgICAgICAgICAvLyBBSSBzdWdnZXN0aW9uIGZvciB0b2RheSAvIGZ1dHVyZVxuICAgICAgICAgICAgaWYgKGRhdGUuaXNTYW1lT3JBZnRlcihtb21lbnQoKSwgJ2RheScpKSB7XG4gICAgICAgICAgICAgICAgdm9pZCB0aGlzLnJlbmRlclBsYW5TdWdnZXN0aW9uKHByZXZpZXcsIGRhdGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgY3JlYXRlQnRuID0gcHJldmlldy5jcmVhdGVFbCgnYnV0dG9uJywgeyBjbHM6ICd0bC1wZXJpb2RpYy1vcGVuLWJ0bicsIHRleHQ6IHQoJ3BlcmlvZGljLmNyZWF0ZURpYXJ5JykgfSk7XG4gICAgICAgICAgICBjcmVhdGVCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgdm9pZCAoYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBmID0gYXdhaXQgaC5wbHVnaW4udmF1bHRNYW5hZ2VyLmdldE9yQ3JlYXRlRGFpbHlOb3RlKGRhdGUudG9EYXRlKCkpO1xuICAgICAgICAgICAgICAgICAgICB2b2lkIGguYXBwLndvcmtzcGFjZS5nZXRMZWFmKCkub3BlbkZpbGUoZik7XG4gICAgICAgICAgICAgICAgfSkoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUGFyc2UgY29udGVudCAoc2tpcCBmcm9udG1hdHRlciBmb3IgdGFzayBleHRyYWN0aW9uKVxuICAgICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgaC5hcHAudmF1bHQucmVhZChmaWxlKTtcblxuICAgICAgICAvLyBUYXNrc1xuICAgICAgICBjb25zdCB0YXNrcyA9IGgucGFyc2VNZFRhc2tzKGNvbnRlbnQpLmZpbHRlcih0ID0+IHQuaXNUYXNrKTtcbiAgICAgICAgaWYgKHRhc2tzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGNvbnN0IHRhc2tTZWN0aW9uID0gcHJldmlldy5jcmVhdGVEaXYoJ3RsLXBlcmlvZGljLXRhc2stc2VjdGlvbicpO1xuICAgICAgICAgICAgY29uc3QgaW5Qcm9ncmVzcyA9IHRhc2tzLmZpbHRlcih0ID0+ICF0LmRvbmUpO1xuICAgICAgICAgICAgY29uc3QgY29tcGxldGVkID0gdGFza3MuZmlsdGVyKHQgPT4gdC5kb25lKTtcblxuICAgICAgICAgICAgaWYgKGluUHJvZ3Jlc3MubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgIHRhc2tTZWN0aW9uLmNyZWF0ZURpdih7IGNsczogJ3RsLXBlcmlvZGljLXRhc2stZ3JvdXAtbGFiZWwnLCB0ZXh0OiB0KCdrYW5iYW4uaW5Qcm9ncmVzcycsIFN0cmluZyhpblByb2dyZXNzLmxlbmd0aCkpIH0pO1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgdGFzayBvZiBpblByb2dyZXNzKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyVGFzayh0YXNrU2VjdGlvbiwgdGFzaywgZmlsZSwgZGF0ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGNvbXBsZXRlZC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZG9uZUxhYmVsID0gdGFza1NlY3Rpb24uY3JlYXRlRGl2KHsgY2xzOiAndGwtcGVyaW9kaWMtdGFzay1ncm91cC1sYWJlbCB0bC1wZXJpb2RpYy10YXNrLWdyb3VwLWRvbmUtbGFiZWwnIH0pO1xuICAgICAgICAgICAgICAgIGNvbnN0IGluZGljYXRvciA9IGRvbmVMYWJlbC5jcmVhdGVFbCgnc3BhbicsIHsgY2xzOiAndGwtcGVyaW9kaWMtdG9nZ2xlLWluZGljYXRvcicsIHRleHQ6ICfilr4nIH0pO1xuICAgICAgICAgICAgICAgIGRvbmVMYWJlbC5hcHBlbmRUZXh0KGAgJHt0KCdrYW5iYW4uY29tcGxldGVkU2VjdGlvbicsIFN0cmluZyhjb21wbGV0ZWQubGVuZ3RoKSl9YCk7XG4gICAgICAgICAgICAgICAgY29uc3QgZG9uZUJvZHkgPSB0YXNrU2VjdGlvbi5jcmVhdGVEaXYoJ3RsLXBlcmlvZGljLXRhc2stZG9uZS1ib2R5Jyk7XG4gICAgICAgICAgICAgICAgZG9uZUxhYmVsLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjb2xsYXBzZWQgPSAhZG9uZUJvZHkuaGFzQ2xhc3MoJ3RsLXBlcmlvZGljLWNvbGxhcHNlZCcpO1xuICAgICAgICAgICAgICAgICAgICBkb25lQm9keS50b2dnbGVDbGFzcygndGwtcGVyaW9kaWMtY29sbGFwc2VkJywgY29sbGFwc2VkKTtcbiAgICAgICAgICAgICAgICAgICAgaW5kaWNhdG9yLnNldFRleHQoY29sbGFwc2VkID8gJ+KWuCcgOiAn4pa+Jyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCB0YXNrIG9mIGNvbXBsZXRlZCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnJlbmRlclRhc2soZG9uZUJvZHksIHRhc2ssIGZpbGUsIGRhdGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHByZXZpZXcuY3JlYXRlRGl2KHsgY2xzOiAndGwtcGVyaW9kaWMtcHJldmlldy1lbXB0eScsIHRleHQ6IHQoJ2thbmJhbi5ub1Rhc2tzJykgfSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBBZGQgdGFzayBpbnB1dFxuICAgICAgICBpZiAoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSB7XG4gICAgICAgICAgICB0aGlzLnJlbmRlclRhc2tJbnB1dChwcmV2aWV3LCBmaWxlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEFJIHBsYW5uaW5nIHN1Z2dlc3Rpb24gZm9yIHRvZGF5IC8gZnV0dXJlIGRhdGVzXG4gICAgICAgIGNvbnN0IGlzQ3VycmVudE9yRnV0dXJlID0gZGF0ZS5pc1NhbWVPckFmdGVyKG1vbWVudCgpLCAnZGF5Jyk7XG4gICAgICAgIGlmIChpc0N1cnJlbnRPckZ1dHVyZSkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5yZW5kZXJQbGFuU3VnZ2VzdGlvbihwcmV2aWV3LCBkYXRlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE9wZW4gbm90ZSBidXR0b25cbiAgICAgICAgY29uc3Qgb3BlbkJ0biA9IHByZXZpZXcuY3JlYXRlRGl2KCd0bC1wZXJpb2RpYy1vcGVuLWJ0bicpO1xuICAgICAgICBvcGVuQnRuLnNldFRleHQodCgncGVyaW9kaWMub3BlbkRpYXJ5JykpO1xuICAgICAgICBvcGVuQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICAgICAgdm9pZCBoLmFwcC53b3Jrc3BhY2UuZ2V0TGVhZigpLm9wZW5GaWxlKGZpbGUpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTaG93IHBsYW5uaW5nIHN1Z2dlc3Rpb25zIGJhc2VkIG9uIHByZXZpb3VzIGRheSdzIHJldmlldyBjb250ZW50LlxuICAgICAqIFJlYWRzIHRoZSBkYWlseSBub3RlIGRpcmVjdGx5LCBleHRyYWN0cyByZXZpZXcgc2VjdGlvbiwgYW5kIGdlbmVyYXRlc1xuICAgICAqIEFJIHN1Z2dlc3Rpb25zLiBDYWNoZWQgcGVyLWRhdGUgdG8gYXZvaWQgcmVkdW5kYW50IEFQSSBjYWxscy5cbiAgICAgKi9cbiAgICBwcml2YXRlIGFzeW5jIHJlbmRlclBsYW5TdWdnZXN0aW9uKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGRhdGU6IG1vbWVudC5Nb21lbnQpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgY29uc3QgaCA9IHRoaXMuaG9zdDtcbiAgICAgICAgY29uc3QgaXNUb2RheSA9IGRhdGUuaXNTYW1lKG1vbWVudCgpLCAnZGF5Jyk7XG4gICAgICAgIGNvbnN0IGlzVG9tb3Jyb3cgPSBkYXRlLmlzU2FtZShtb21lbnQoKS5hZGQoMSwgJ2RheScpLCAnZGF5Jyk7XG4gICAgICAgIGNvbnN0IHNlY3Rpb24gPSBjb250YWluZXIuY3JlYXRlRGl2KCd0bC1wbGFuLXN1Z2dlc3Rpb24nKTtcblxuICAgICAgICBpZiAoaXNUb2RheSB8fCBpc1RvbW9ycm93KSB7XG4gICAgICAgICAgICAvLyBSZWFkIHRoZSBwcmV2aW91cyBkYXkncyBkYWlseSBub3RlIHJldmlldyBjb250ZW50XG4gICAgICAgICAgICBjb25zdCB5ZXN0ZXJkYXkgPSBtb21lbnQoZGF0ZSkuc3VidHJhY3QoMSwgJ2RheScpO1xuICAgICAgICAgICAgY29uc3QgeWVzdGVyZGF5UGF0aCA9IGAke2gucGx1Z2luLnNldHRpbmdzLmRhaWx5Rm9sZGVyfS8ke3llc3RlcmRheS5mb3JtYXQoJ1lZWVktTU0tREQnKX0ubWRgO1xuICAgICAgICAgICAgY29uc3QgeWVzdGVyZGF5RmlsZSA9IGguYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aCh5ZXN0ZXJkYXlQYXRoKTtcblxuICAgICAgICAgICAgaWYgKCF5ZXN0ZXJkYXlGaWxlIHx8ICEoeWVzdGVyZGF5RmlsZSBpbnN0YW5jZW9mIFRGaWxlKSkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2hvd0ZhbGxiYWNrVGlwKHNlY3Rpb24sIGRhdGUpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IGguYXBwLnZhdWx0LnJlYWQoeWVzdGVyZGF5RmlsZSk7XG5cbiAgICAgICAgICAgIC8vIEV4dHJhY3QgcmV2aWV3IHNlY3Rpb25cbiAgICAgICAgICAgIGxldCByZXZpZXdJZHggPSBjb250ZW50LmluZGV4T2YoJyMjIOWkjeebmCcpO1xuICAgICAgICAgICAgaWYgKHJldmlld0lkeCA8IDApIHJldmlld0lkeCA9IGNvbnRlbnQuaW5kZXhPZignIyMgUmV2aWV3Jyk7XG4gICAgICAgICAgICBpZiAocmV2aWV3SWR4IDwgMCkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2hvd0ZhbGxiYWNrVGlwKHNlY3Rpb24sIGRhdGUpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHJldmlld0xhYmVsID0gY29udGVudC5pbmRleE9mKCcjIyDlpI3nm5gnKSA+PSAwID8gJyMjIOWkjeebmCcgOiAnIyMgUmV2aWV3JztcbiAgICAgICAgICAgIGxldCByZXZpZXdDb250ZW50ID0gY29udGVudC5zdWJzdHJpbmcocmV2aWV3SWR4ICsgcmV2aWV3TGFiZWwubGVuZ3RoKTtcbiAgICAgICAgICAgIC8vIEN1dCBhdCBuZXh0IFwiLS0tXCIgb3IgXCIjIyBcIiBoZWFkZXJcbiAgICAgICAgICAgIGNvbnN0IGVuZElkeCA9IHJldmlld0NvbnRlbnQuaW5kZXhPZignXFxuLS0tJyk7XG4gICAgICAgICAgICBpZiAoZW5kSWR4ID4gMCkgcmV2aWV3Q29udGVudCA9IHJldmlld0NvbnRlbnQuc3Vic3RyaW5nKDAsIGVuZElkeCk7XG5cbiAgICAgICAgICAgIC8vIFJlbW92ZSBIVE1MIGNvbW1lbnRzXG4gICAgICAgICAgICByZXZpZXdDb250ZW50ID0gcmV2aWV3Q29udGVudC5yZXBsYWNlKC88IS0tW1xcc1xcU10qPy0tPi9nLCAnJykudHJpbSgpO1xuICAgICAgICAgICAgaWYgKCFyZXZpZXdDb250ZW50KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zaG93RmFsbGJhY2tUaXAoc2VjdGlvbiwgZGF0ZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBDaGVjayBjYWNoZTogb25seSByZWdlbmVyYXRlIGlmIGRhdGUgY2hhbmdlZFxuICAgICAgICAgICAgY29uc3QgY2FjaGVLZXkgPSBkYXRlLmZvcm1hdCgnWVlZWS1NTS1ERCcpO1xuICAgICAgICAgICAgY29uc3QgY2FjaGVQYXRoID0gYCR7aC5wbHVnaW4uc2V0dGluZ3MuYXJjaGl2ZUZvbGRlcn0vcGxhbl9zdWdnZXN0aW9ucy5tZGA7XG4gICAgICAgICAgICBjb25zdCBjYWNoZUZpbGUgPSBoLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoY2FjaGVQYXRoKTtcblxuICAgICAgICAgICAgaWYgKGNhY2hlRmlsZSAmJiBjYWNoZUZpbGUgaW5zdGFuY2VvZiBURmlsZSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNhY2hlZCA9IGF3YWl0IGguYXBwLnZhdWx0LnJlYWQoY2FjaGVGaWxlKTtcbiAgICAgICAgICAgICAgICAvLyBDaGVjayBpZiBjYWNoZSBpcyBmb3IgdG9kYXkncyBzdWdnZXN0aW9uc1xuICAgICAgICAgICAgICAgIGlmIChjYWNoZWQuaW5jbHVkZXMoYGRhdGU6ICR7Y2FjaGVLZXl9YCkpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gVXNlIGNhY2hlZCBzdWdnZXN0aW9uc1xuICAgICAgICAgICAgICAgICAgICBsZXQgYm9keSA9IGNhY2hlZDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGJvZHkuc3RhcnRzV2l0aCgnLS0tJykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGVuZCA9IGJvZHkuaW5kZXhPZignLS0tJywgMyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZW5kID4gMCkgYm9keSA9IGJvZHkuc3Vic3RyaW5nKGVuZCArIDMpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGxpbmVzID0gYm9keS50cmltKCkuc3BsaXQoJ1xcbicpLmZpbHRlcihsID0+IGwudHJpbSgpKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGxpbmVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlY3Rpb24uY3JlYXRlRGl2KHsgY2xzOiAndGwtcGxhbi1zdWdnZXN0aW9uLWhlYWRlcicsIHRleHQ6IGlzVG9kYXkgPyB0KCdwZXJpb2RpYy5haVN1Z2dlc3Rpb25Ub2RheScpIDogdCgncGVyaW9kaWMuYWlTdWdnZXN0aW9uR2VuZXJhbCcpIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VjdGlvbi5jcmVhdGVEaXYoeyBjbHM6ICd0bC1wbGFuLXN1Z2dlc3Rpb24tbGluZScsIHRleHQ6IGxpbmUudHJpbSgpIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBHZW5lcmF0ZSBmcmVzaCBzdWdnZXN0aW9ucyB2aWEgQUlcbiAgICAgICAgICAgIHNlY3Rpb24uY3JlYXRlRGl2KHsgY2xzOiAndGwtcGxhbi1zdWdnZXN0aW9uLWhlYWRlcicsIHRleHQ6IGlzVG9kYXkgPyB0KCdwZXJpb2RpYy5haVN1Z2dlc3Rpb25Ub2RheScpIDogdCgncGVyaW9kaWMuYWlTdWdnZXN0aW9uR2VuZXJhbCcpIH0pO1xuICAgICAgICAgICAgY29uc3QgbG9hZGluZ0VsID0gc2VjdGlvbi5jcmVhdGVEaXYoeyBjbHM6ICd0bC1wbGFuLXN1Z2dlc3Rpb24tbGluZScsIHRleHQ6IHQoJ3BlcmlvZGljLmdlbmVyYXRpbmdTdWdnZXN0aW9uJykgfSk7XG5cbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcHJvdmlkZXIgPSBoLnBsdWdpbi5nZXRBSVByb3ZpZGVyKCk7XG4gICAgICAgICAgICAgICAgaWYgKCFwcm92aWRlcikge1xuICAgICAgICAgICAgICAgICAgICBsb2FkaW5nRWwucmVtb3ZlKCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2hvd0ZhbGxiYWNrVGlwKHNlY3Rpb24sIGRhdGUpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgY29uc3Qgc3lzdGVtUHJvbXB0ID0gYOWfuuS6jueUqOaIt+aYqOaXpeeahOWkjeebmOWGheWuue+8jOaPkOeCvOWHujPmnaHku4rlpKnlj6/ku6XooYzliqjnmoTlu7rorq7jgIJcblxu5Lil5qC86KeE5YiZ77yaXG4tIOavj+adoeW7uuiuruW/hemhu+ebtOaOpeadpea6kOS6jueUqOaIt+WkjeebmOS4reaPkOWIsOeahOS6i+aDheOAgeaDs+azleaIluWPjeaAne+8jOS4jeW+l+WHreepuue8lumAoFxuLSDnu53lr7nnpoHmraLlu7rorq7nlKjmiLfmsqHmnInmj5DliLDov4fnmoTmtLvliqjjgIHmlrnms5XmiJbkuaDmg69cbi0g5bu66K6u5bqU6K+l5piv55So5oi36Ieq5bex6K+06L+H55qE6K6h5YiS44CB5Y+N5oCd5Yiw55qE5pS56L+b5pa55ZCR44CB5oiW5pyq5a6M5oiQ5LqL6aG555qE5bu257utXG4tIOavj+adoeS7pVwi8J+SoVwi5byA5aS077yM5LiN6LaF6L+HMzDlrZdcbi0g55u05o6l6L6T5Ye65bu66K6u77yM5LiN6KaB5Yqg5YmN6KiAYDtcblxuICAgICAgICAgICAgICAgIGNvbnN0IG1lc3NhZ2VzOiB7IHJvbGU6IHN0cmluZzsgY29udGVudDogc3RyaW5nOyB0aW1lc3RhbXA6IG51bWJlciB9W10gPSBbXG4gICAgICAgICAgICAgICAgICAgIHsgcm9sZTogJ3VzZXInLCBjb250ZW50OiBg5oiR55qE5pio5pel5aSN55uY77yaXFxuJHtyZXZpZXdDb250ZW50fWAsIHRpbWVzdGFtcDogRGF0ZS5ub3coKSB9XG4gICAgICAgICAgICAgICAgXTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IHN1Z2dlc3Rpb25zID0gYXdhaXQgcHJvdmlkZXIuc2VuZE1lc3NhZ2UobWVzc2FnZXMgYXMgYW55LCBzeXN0ZW1Qcm9tcHQsICgpID0+IHt9KTtcblxuICAgICAgICAgICAgICAgIGxvYWRpbmdFbC5yZW1vdmUoKTtcblxuICAgICAgICAgICAgICAgIGlmIChzdWdnZXN0aW9ucyAmJiBzdWdnZXN0aW9ucy50cmltKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbGluZXMgPSBzdWdnZXN0aW9ucy50cmltKCkuc3BsaXQoJ1xcbicpLmZpbHRlcigobDogc3RyaW5nKSA9PiBsLnRyaW0oKSk7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VjdGlvbi5jcmVhdGVEaXYoeyBjbHM6ICd0bC1wbGFuLXN1Z2dlc3Rpb24tbGluZScsIHRleHQ6IGxpbmUudHJpbSgpIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIC8vIFNhdmUgdG8gY2FjaGVcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2FjaGVDb250ZW50ID0gYC0tLVxcbmRhdGU6ICR7Y2FjaGVLZXl9XFxudXBkYXRlZDogJHtuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCl9XFxuLS0tXFxuJHtzdWdnZXN0aW9ucy50cmltKCl9YDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNhY2hlRmlsZSAmJiBjYWNoZUZpbGUgaW5zdGFuY2VvZiBURmlsZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgaC5hcHAudmF1bHQubW9kaWZ5KGNhY2hlRmlsZSwgY2FjaGVDb250ZW50KTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGZvbGRlciA9IGNhY2hlUGF0aC5zdWJzdHJpbmcoMCwgY2FjaGVQYXRoLmxhc3RJbmRleE9mKCcvJykpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFoLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoZm9sZGVyKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IGguYXBwLnZhdWx0LmNyZWF0ZUZvbGRlcihmb2xkZXIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgaC5hcHAudmF1bHQuY3JlYXRlKGNhY2hlUGF0aCwgY2FjaGVDb250ZW50KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2hvd0ZhbGxiYWNrVGlwKHNlY3Rpb24sIGRhdGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAgIGxvYWRpbmdFbC5yZW1vdmUoKTtcbiAgICAgICAgICAgICAgICB0aGlzLnNob3dGYWxsYmFja1RpcChzZWN0aW9uLCBkYXRlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIEZ1dHVyZSBkYXRlczogc2hvdyBhIHBsYW5uaW5nIHRpcFxuICAgICAgICAgICAgc2VjdGlvbi5jcmVhdGVEaXYoeyBjbHM6ICd0bC1wbGFuLXN1Z2dlc3Rpb24taGVhZGVyJywgdGV4dDogdCgncGVyaW9kaWMucGxhblRpcCcpIH0pO1xuICAgICAgICAgICAgdGhpcy5zaG93RmFsbGJhY2tUaXAoc2VjdGlvbiwgZGF0ZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIHNob3dGYWxsYmFja1RpcChzZWN0aW9uOiBIVE1MRWxlbWVudCwgZGF0ZTogbW9tZW50Lk1vbWVudCk6IHZvaWQge1xuICAgICAgICBjb25zdCB0aXBzID0gW1xuICAgICAgICAgICAgdCgndGlwLjAnKSwgdCgndGlwLjEnKSwgdCgndGlwLjInKSwgdCgndGlwLjMnKSxcbiAgICAgICAgICAgIHQoJ3RpcC40JyksIHQoJ3RpcC41JyksIHQoJ3RpcC42JyksIHQoJ3RpcC43JyksXG4gICAgICAgICAgICB0KCd0aXAuOCcpLCB0KCd0aXAuOScpLCB0KCd0aXAuMTAnKSwgdCgndGlwLjExJyksXG4gICAgICAgIF07XG4gICAgICAgIGNvbnN0IGRheU9mWWVhciA9IGRhdGUuZGF5T2ZZZWFyKCk7XG4gICAgICAgIGNvbnN0IHRpcCA9IHRpcHNbZGF5T2ZZZWFyICUgdGlwcy5sZW5ndGhdO1xuICAgICAgICBzZWN0aW9uLmNyZWF0ZURpdih7IGNsczogJ3RsLXBsYW4tc3VnZ2VzdGlvbi1saW5lJywgdGV4dDogdGlwIH0pO1xuICAgIH1cblxuXG5cbiAgICAvKiogRXh0cmFjdCBhbmQgcmVuZGVyIOWkjeebmCBzZWN0aW9ucyBmcm9tIGRhaWx5IG5vdGUgY29udGVudCAqL1xuICAgIHByaXZhdGUgcmVuZGVyUmV2aWV3U2VjdGlvbihwcmV2aWV3OiBIVE1MRWxlbWVudCwgY29udGVudDogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIC8vIEZpbmQg5aSN55uYIHNlY3Rpb24g4oCUIGhhbmRsZSBvcHRpb25hbCBibGFuayBsaW5lc1xuICAgICAgICBsZXQgcmV2aWV3SWR4ID0gY29udGVudC5pbmRleE9mKCcjIyDlpI3nm5gnKTtcbiAgICAgICAgaWYgKHJldmlld0lkeCA8IDApIHJldmlld0lkeCA9IGNvbnRlbnQuaW5kZXhPZignIyMgUmV2aWV3Jyk7XG4gICAgICAgIGlmIChyZXZpZXdJZHggPCAwKSByZXR1cm47XG5cbiAgICAgICAgLy8gR2V0IGV2ZXJ5dGhpbmcgYWZ0ZXIgXCIjIyDlpI3nm5hcIiB1bnRpbCBuZXh0IC0tLSBvciBlbmRcbiAgICAgICAgY29uc3QgcmV2aWV3TGFiZWwgPSBjb250ZW50LmluZGV4T2YoJyMjIOWkjeebmCcpID49IDAgPyAnIyMg5aSN55uYJyA6ICcjIyBSZXZpZXcnO1xuICAgICAgICBsZXQgcmV2aWV3Q29udGVudCA9IGNvbnRlbnQuc3Vic3RyaW5nKHJldmlld0lkeCArIHJldmlld0xhYmVsLmxlbmd0aCk7XG4gICAgICAgIGNvbnN0IGVuZElkeCA9IHJldmlld0NvbnRlbnQuaW5kZXhPZignXFxuLS0tJyk7XG4gICAgICAgIGlmIChlbmRJZHggPiAwKSByZXZpZXdDb250ZW50ID0gcmV2aWV3Q29udGVudC5zdWJzdHJpbmcoMCwgZW5kSWR4KTtcblxuICAgICAgICBpZiAoIXJldmlld0NvbnRlbnQudHJpbSgpKSByZXR1cm47XG5cbiAgICAgICAgY29uc3Qgc2VjdGlvbiA9IHByZXZpZXcuY3JlYXRlRGl2KCd0bC1wZXJpb2RpYy1yZXZpZXctc2VjdGlvbicpO1xuICAgICAgICBzZWN0aW9uLmNyZWF0ZURpdih7IGNsczogJ3RsLXBlcmlvZGljLXJldmlldy1sYWJlbCcsIHRleHQ6IHQoJ3BlcmlvZGljLnJldmlld0xhYmVsJykgfSk7XG5cbiAgICAgICAgLy8gRXh0cmFjdCBzdWItc2VjdGlvbnMg4oCUIHVzZSBpbmRleE9mLWJhc2VkIGFwcHJvYWNoIGZvciByb2J1c3RuZXNzXG4gICAgICAgIGNvbnN0IHN1YlNlY3Rpb25zOiB7IGljb246IHN0cmluZzsgdGl0bGU6IHN0cmluZzsgaGVhZGluZzogc3RyaW5nIH1bXSA9IFtcbiAgICAgICAgICAgIHsgaWNvbjogJ/Cfjq8nLCB0aXRsZTogdCgnaW5zaWdodC5zZWN0aW9uR29hbEFsaWduJyksIGhlYWRpbmc6ICcjIyMgJyArIHQoJ2luc2lnaHQuc2VjdGlvbkdvYWxBbGlnbicpIH0sXG4gICAgICAgICAgICB7IGljb246ICfwn4+GJywgdGl0bGU6IHQoJ2luc2lnaHQuc2VjdGlvblN1Y2Nlc3MnKSwgaGVhZGluZzogJyMjIyAnICsgdCgnaW5zaWdodC5zZWN0aW9uU3VjY2VzcycpIH0sXG4gICAgICAgICAgICB7IGljb246ICfwn5ifJywgdGl0bGU6IHQoJ2luc2lnaHQuc2VjdGlvbkFueGlldHknKSwgaGVhZGluZzogJyMjIyAnICsgdCgnaW5zaWdodC5zZWN0aW9uQW54aWV0eScpIH0sXG4gICAgICAgICAgICB7IGljb246ICfwn5OMJywgdGl0bGU6IHQoJ2luc2lnaHQuc2VjdGlvblRvbW9ycm93JyksIGhlYWRpbmc6ICcjIyMgJyArIHQoJ2luc2lnaHQuc2VjdGlvblRvbW9ycm93JykgfSxcbiAgICAgICAgXTtcblxuICAgICAgICBmb3IgKGNvbnN0IHN1YiBvZiBzdWJTZWN0aW9ucykge1xuICAgICAgICAgICAgY29uc3QgaWR4ID0gcmV2aWV3Q29udGVudC5pbmRleE9mKHN1Yi5oZWFkaW5nKTtcbiAgICAgICAgICAgIGlmIChpZHggPCAwKSBjb250aW51ZTtcblxuICAgICAgICAgICAgLy8gR2V0IHRleHQgYmV0d2VlbiB0aGlzIGhlYWRpbmcgYW5kIG5leHQgIyMjIG9yIGVuZFxuICAgICAgICAgICAgbGV0IHN1YlRleHQgPSByZXZpZXdDb250ZW50LnN1YnN0cmluZyhpZHggKyBzdWIuaGVhZGluZy5sZW5ndGgpO1xuICAgICAgICAgICAgY29uc3QgbmV4dEggPSBzdWJUZXh0LmluZGV4T2YoJ1xcbiMjIycpO1xuICAgICAgICAgICAgaWYgKG5leHRIID4gMCkgc3ViVGV4dCA9IHN1YlRleHQuc3Vic3RyaW5nKDAsIG5leHRIKTtcblxuICAgICAgICAgICAgY29uc3QgbGluZXMgPSBzdWJUZXh0LnNwbGl0KCdcXG4nKS5tYXAobCA9PiBsLnRyaW0oKSkuZmlsdGVyKGwgPT4gbCAmJiAhbC5zdGFydHNXaXRoKCcjJykpO1xuICAgICAgICAgICAgaWYgKGxpbmVzLmxlbmd0aCA9PT0gMCkgY29udGludWU7XG5cbiAgICAgICAgICAgIGNvbnN0IGl0ZW0gPSBzZWN0aW9uLmNyZWF0ZURpdigndGwtcGVyaW9kaWMtcmV2aWV3LWl0ZW0nKTtcbiAgICAgICAgICAgIGl0ZW0uY3JlYXRlRWwoJ3NwYW4nLCB7IGNsczogJ3RsLXBlcmlvZGljLXJldmlldy1pY29uJywgdGV4dDogc3ViLmljb24gfSk7XG4gICAgICAgICAgICBjb25zdCB0ZXh0RGl2ID0gaXRlbS5jcmVhdGVEaXYoJ3RsLXBlcmlvZGljLXJldmlldy10ZXh0Jyk7XG4gICAgICAgICAgICB0ZXh0RGl2LmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ3RsLXBlcmlvZGljLXJldmlldy10aXRsZScsIHRleHQ6IHN1Yi50aXRsZSB9KTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcy5zbGljZSgwLCAyKSkge1xuICAgICAgICAgICAgICAgIHRleHREaXYuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAndGwtcGVyaW9kaWMtcmV2aWV3LWxpbmUnLCB0ZXh0OiBsaW5lLnJlcGxhY2UoL15cXGQrXFwuXFxzKlxcKlxcKi4qP1xcKlxcKls677yaXVxccyovLCAnJykucmVwbGFjZSgvXlstKl1cXHMqLywgJycpIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8g4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gICAgLy8gV2VlayBNb2RlOiB3ZWVrIHNlbGVjdG9yICsgd2Vla2x5IHBsYW4gcHJldmlld1xuICAgIC8vIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG4gICAgcHJpdmF0ZSBhc3luYyByZW5kZXJXZWVrTW9kZShib2R5OiBIVE1MRWxlbWVudCk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBjb25zdCBoID0gdGhpcy5ob3N0O1xuICAgICAgICBjb25zdCBzZWwgPSBoLnBlcmlvZGljU2VsZWN0ZWREYXRlO1xuICAgICAgICBjb25zdCBjYWxNb250aCA9IG1vbWVudChzZWwpLnN0YXJ0T2YoJ21vbnRoJykuYWRkKGgucGVyaW9kaWNNb250aE9mZnNldCwgJ21vbnRocycpO1xuXG4gICAgICAgIC8vIENhbGVuZGFyIG5hdlxuICAgICAgICBjb25zdCBjYWxTZWN0aW9uID0gYm9keS5jcmVhdGVEaXYoJ3RsLXBlcmlvZGljLXNlbGVjdG9yJyk7XG4gICAgICAgIGNvbnN0IGNhbE5hdiA9IGNhbFNlY3Rpb24uY3JlYXRlRGl2KCd0bC1wZXJpb2RpYy1jYWwtbmF2Jyk7XG4gICAgICAgIGNvbnN0IHByZXZCdG4gPSBjYWxOYXYuY3JlYXRlRWwoJ2J1dHRvbicsIHsgY2xzOiAndGwtcGVyaW9kaWMtbmF2LWJ0bicsIHRleHQ6ICfigLknIH0pO1xuICAgICAgICBjYWxOYXYuY3JlYXRlRWwoJ3NwYW4nLCB7IGNsczogJ3RsLXBlcmlvZGljLWNhbC10aXRsZScsIHRleHQ6IGdldExhbmd1YWdlKCkgPT09ICdlbicgPyBjYWxNb250aC5mb3JtYXQoJ01NTU0gWVlZWScpIDogY2FsTW9udGguZm9ybWF0KCdZWVlZ5bm0IE3mnIgnKSB9KTtcbiAgICAgICAgY29uc3QgbmV4dEJ0biA9IGNhbE5hdi5jcmVhdGVFbCgnYnV0dG9uJywgeyBjbHM6ICd0bC1wZXJpb2RpYy1uYXYtYnRuJywgdGV4dDogJ+KAuicgfSk7XG4gICAgICAgIHByZXZCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7IGgucGVyaW9kaWNNb250aE9mZnNldC0tOyBoLmludmFsaWRhdGVUYWJDYWNoZSgna2FuYmFuJyk7IGguc3dpdGNoVGFiKCdrYW5iYW4nKTsgfSk7XG4gICAgICAgIG5leHRCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7IGgucGVyaW9kaWNNb250aE9mZnNldCsrOyBoLmludmFsaWRhdGVUYWJDYWNoZSgna2FuYmFuJyk7IGguc3dpdGNoVGFiKCdrYW5iYW4nKTsgfSk7XG5cbiAgICAgICAgLy8gTWluaSBjYWxlbmRhciB3aXRoIHdlZWsgaGlnaGxpZ2h0c1xuICAgICAgICBjb25zdCBncmlkID0gY2FsU2VjdGlvbi5jcmVhdGVEaXYoJ3RsLXBlcmlvZGljLW1pbmktY2FsJyk7XG4gICAgICAgIGNvbnN0IHdlZWtkYXlzID0gdCgnY2FsLndlZWtkYXlzJykuc3BsaXQoJywnKTtcbiAgICAgICAgZm9yIChjb25zdCB3ZCBvZiB3ZWVrZGF5cykge1xuICAgICAgICAgICAgZ3JpZC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICd0bC1wZXJpb2RpYy1jYWwtd2QnLCB0ZXh0OiB3ZCB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGZpcnN0RGF5ID0gbW9tZW50KGNhbE1vbnRoKS5zdGFydE9mKCdtb250aCcpO1xuICAgICAgICBjb25zdCBzdGFydFBhZCA9IGZpcnN0RGF5Lmlzb1dlZWtkYXkoKSAtIDE7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc3RhcnRQYWQ7IGkrKykgZ3JpZC5jcmVhdGVEaXYoJ3RsLXBlcmlvZGljLWNhbC1jZWxsIHRsLXBlcmlvZGljLWNhbC1jZWxsLWVtcHR5Jyk7XG5cbiAgICAgICAgY29uc3Qgc2VsV2Vla1N0YXJ0ID0gbW9tZW50KHNlbCkuc3RhcnRPZignaXNvV2VlaycpLmZvcm1hdCgnWVlZWS1NTS1ERCcpO1xuICAgICAgICBjb25zdCB0b2RheVN0ciA9IG1vbWVudCgpLmZvcm1hdCgnWVlZWS1NTS1ERCcpO1xuXG4gICAgICAgIGZvciAobGV0IGQgPSAxOyBkIDw9IGNhbE1vbnRoLmRheXNJbk1vbnRoKCk7IGQrKykge1xuICAgICAgICAgICAgY29uc3QgZGF5TW9tZW50ID0gbW9tZW50KGNhbE1vbnRoKS5kYXRlKGQpO1xuICAgICAgICAgICAgY29uc3QgZGF0ZVN0ciA9IGRheU1vbWVudC5mb3JtYXQoJ1lZWVktTU0tREQnKTtcbiAgICAgICAgICAgIGNvbnN0IHdlZWtTdGFydFN0ciA9IG1vbWVudChkYXlNb21lbnQpLnN0YXJ0T2YoJ2lzb1dlZWsnKS5mb3JtYXQoJ1lZWVktTU0tREQnKTtcbiAgICAgICAgICAgIGNvbnN0IGlzSW5TZWxlY3RlZFdlZWsgPSB3ZWVrU3RhcnRTdHIgPT09IHNlbFdlZWtTdGFydDtcbiAgICAgICAgICAgIGNvbnN0IGlzVG9kYXkgPSBkYXRlU3RyID09PSB0b2RheVN0cjtcblxuICAgICAgICAgICAgY29uc3QgY2VsbCA9IGdyaWQuY3JlYXRlRGl2KGB0bC1wZXJpb2RpYy1jYWwtY2VsbCAke2lzSW5TZWxlY3RlZFdlZWsgPyAndGwtcGVyaW9kaWMtY2FsLWNlbGwtd2Vlay1oaWdobGlnaHQnIDogJyd9ICR7aXNUb2RheSA/ICd0bC1wZXJpb2RpYy1jYWwtY2VsbC10b2RheScgOiAnJ31gKTtcbiAgICAgICAgICAgIGNlbGwuc2V0VGV4dChgJHtkfWApO1xuICAgICAgICAgICAgY2VsbC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgICAgICAgICBoLnBlcmlvZGljU2VsZWN0ZWREYXRlID0gbW9tZW50KGRheU1vbWVudCk7XG4gICAgICAgICAgICAgICAgaC5pbnZhbGlkYXRlVGFiQ2FjaGUoJ2thbmJhbicpO1xuICAgICAgICAgICAgICAgIGguc3dpdGNoVGFiKCdrYW5iYW4nKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUGFkIHRyYWlsaW5nIGRheXMgdG8gY29tcGxldGUgdGhlIGxhc3Qgd2VlayBvZiB0aGUgbW9udGhcbiAgICAgICAgY29uc3QgbGFzdERheSA9IG1vbWVudChjYWxNb250aCkuZW5kT2YoJ21vbnRoJyk7XG4gICAgICAgIGNvbnN0IHRyYWlsUGFkID0gNyAtIGxhc3REYXkuaXNvV2Vla2RheSgpO1xuICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8PSB0cmFpbFBhZDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBuZXh0TW9udGhEYXkgPSBtb21lbnQobGFzdERheSkuYWRkKGksICdkYXlzJyk7XG4gICAgICAgICAgICBjb25zdCBkYXRlU3RyID0gbmV4dE1vbnRoRGF5LmZvcm1hdCgnWVlZWS1NTS1ERCcpO1xuICAgICAgICAgICAgY29uc3Qgd2Vla1N0YXJ0U3RyID0gbW9tZW50KG5leHRNb250aERheSkuc3RhcnRPZignaXNvV2VlaycpLmZvcm1hdCgnWVlZWS1NTS1ERCcpO1xuICAgICAgICAgICAgY29uc3QgaXNJblNlbGVjdGVkV2VlayA9IHdlZWtTdGFydFN0ciA9PT0gc2VsV2Vla1N0YXJ0O1xuXG4gICAgICAgICAgICBjb25zdCBjZWxsID0gZ3JpZC5jcmVhdGVEaXYoYHRsLXBlcmlvZGljLWNhbC1jZWxsIHRsLXBlcmlvZGljLWNhbC1jZWxsLW90aGVyLW1vbnRoICR7aXNJblNlbGVjdGVkV2VlayA/ICd0bC1wZXJpb2RpYy1jYWwtY2VsbC13ZWVrLWhpZ2hsaWdodCcgOiAnJ31gKTtcbiAgICAgICAgICAgIGNlbGwuc2V0VGV4dChgJHtuZXh0TW9udGhEYXkuZGF0ZSgpfWApO1xuICAgICAgICAgICAgY2VsbC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgICAgICAgICBoLnBlcmlvZGljU2VsZWN0ZWREYXRlID0gbW9tZW50KG5leHRNb250aERheSk7XG4gICAgICAgICAgICAgICAgaC5pbnZhbGlkYXRlVGFiQ2FjaGUoJ2thbmJhbicpO1xuICAgICAgICAgICAgICAgIGguc3dpdGNoVGFiKCdrYW5iYW4nKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUHJldmlldyBhcmVhOiBXZWVrIHBsYW5cbiAgICAgICAgY29uc3Qgd2Vla1N0YXJ0ID0gbW9tZW50KHNlbCkuc3RhcnRPZignaXNvV2VlaycpO1xuICAgICAgICBhd2FpdCB0aGlzLnJlbmRlcldlZWtQcmV2aWV3KGJvZHksIHdlZWtTdGFydCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyByZW5kZXJXZWVrUHJldmlldyhib2R5OiBIVE1MRWxlbWVudCwgd2Vla1N0YXJ0OiBtb21lbnQuTW9tZW50KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGNvbnN0IGggPSB0aGlzLmhvc3Q7XG4gICAgICAgIGNvbnN0IGlzb1dlZWsgPSB3ZWVrU3RhcnQuaXNvV2VlaygpO1xuICAgICAgICBjb25zdCB3ZWVrTGFiZWwgPSBgVyR7U3RyaW5nKGlzb1dlZWspLnBhZFN0YXJ0KDIsICcwJyl9YDtcblxuICAgICAgICBjb25zdCBwcmV2aWV3ID0gYm9keS5jcmVhdGVEaXYoJ3RsLXBlcmlvZGljLXByZXZpZXcnKTtcbiAgICAgICAgY29uc3QgcHJldmlld0hlYWRlciA9IHByZXZpZXcuY3JlYXRlRGl2KCd0bC1wZXJpb2RpYy1wcmV2aWV3LWhlYWRlcicpO1xuICAgICAgICBwcmV2aWV3SGVhZGVyLmNyZWF0ZUVsKCdzcGFuJywge1xuICAgICAgICAgICAgY2xzOiAndGwtcGVyaW9kaWMtcHJldmlldy1kYXRlJyxcbiAgICAgICAgICAgIHRleHQ6IGAke3dlZWtTdGFydC5pc29XZWVrWWVhcigpfS0ke3dlZWtMYWJlbH0gKCR7d2Vla1N0YXJ0LmZvcm1hdCgnTS9EJyl94oCUJHttb21lbnQod2Vla1N0YXJ0KS5hZGQoNiwgJ2RheXMnKS5mb3JtYXQoJ00vRCcpfSlgLFxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBUcnkgbG9hZCB3ZWVrbHkgcGxhbiBmaWxlIOKAlCB1c2UgY29uc2lzdGVudCBwYXRoXG4gICAgICAgIGNvbnN0IHdlZWtseVBhdGggPSBgJHtoLnBsdWdpbi5zZXR0aW5ncy5wbGFuRm9sZGVyfS9XZWVrbHkvJHt3ZWVrU3RhcnQuaXNvV2Vla1llYXIoKX0tJHt3ZWVrTGFiZWx9Lm1kYDtcbiAgICAgICAgY29uc3Qgd2Vla0ZpbGUgPSBoLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgod2Vla2x5UGF0aCk7XG5cbiAgICAgICAgaWYgKHdlZWtGaWxlICYmIHdlZWtGaWxlIGluc3RhbmNlb2YgVEZpbGUpIHtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBoLmFwcC52YXVsdC5yZWFkKHdlZWtGaWxlKTtcblxuICAgICAgICAgICAgLy8gVGFza3MgZnJvbSB3ZWVrbHkgcGxhblxuICAgICAgICAgICAgY29uc3QgdGFza3MgPSBoLnBhcnNlTWRUYXNrcyhjb250ZW50KS5maWx0ZXIodCA9PiB0LmlzVGFzayk7XG4gICAgICAgICAgICBjb25zdCB0YXNrU2VjdGlvbiA9IHByZXZpZXcuY3JlYXRlRGl2KCd0bC1wZXJpb2RpYy10YXNrLXNlY3Rpb24nKTtcbiAgICAgICAgICAgIGlmICh0YXNrcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgdGFza1NlY3Rpb24uY3JlYXRlRGl2KHsgY2xzOiAndGwtcGVyaW9kaWMtdGFzay1ncm91cC1sYWJlbCcsIHRleHQ6IHQoJ3BlcmlvZGljLndlZWtUYXNrcycsIFN0cmluZyh0YXNrcy5sZW5ndGgpKSB9KTtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHRhc2sgb2YgdGFza3MpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJUYXNrKHRhc2tTZWN0aW9uLCB0YXNrLCB3ZWVrRmlsZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5yZW5kZXJUYXNrSW5wdXQodGFza1NlY3Rpb24sIHdlZWtGaWxlKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIE5vIHdlZWtseSBmaWxlIOKAlCBzaG93IHRhc2sgaW5wdXQgdGhhdCBhdXRvLWNyZWF0ZXMgZmlsZVxuICAgICAgICAgICAgY29uc3QgdGFza1NlY3Rpb24gPSBwcmV2aWV3LmNyZWF0ZURpdigndGwtcGVyaW9kaWMtdGFzay1zZWN0aW9uJyk7XG4gICAgICAgICAgICB0aGlzLnJlbmRlclRhc2tJbnB1dEZvcldlZWsodGFza1NlY3Rpb24sIHdlZWtTdGFydCwgd2Vla0xhYmVsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEFnZ3JlZ2F0ZSBkYWlseSB0YXNrcyBmb3IgdGhpcyB3ZWVrXG4gICAgICAgIGNvbnN0IGRhaWx5VGFza3M6IHsgdGV4dDogc3RyaW5nOyBkb25lOiBib29sZWFuOyBkYXRlOiBzdHJpbmcgfVtdID0gW107XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNzsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBkID0gbW9tZW50KHdlZWtTdGFydCkuYWRkKGksICdkYXlzJyk7XG4gICAgICAgICAgICBjb25zdCBkYXRlU3RyID0gZC5mb3JtYXQoJ1lZWVktTU0tREQnKTtcbiAgICAgICAgICAgIGNvbnN0IGRheVBhdGggPSBgJHtoLnBsdWdpbi5zZXR0aW5ncy5kYWlseUZvbGRlcn0vJHtkYXRlU3RyfS5tZGA7XG4gICAgICAgICAgICBjb25zdCBkYXlGaWxlID0gaC5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGRheVBhdGgpO1xuICAgICAgICAgICAgaWYgKGRheUZpbGUgJiYgZGF5RmlsZSBpbnN0YW5jZW9mIFRGaWxlKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IGguYXBwLnZhdWx0LnJlYWQoZGF5RmlsZSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRhc2tzID0gaC5wYXJzZU1kVGFza3MoY29udGVudCkuZmlsdGVyKHQgPT4gdC5pc1Rhc2spO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHQgb2YgdGFza3MpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhaWx5VGFza3MucHVzaCh7IHRleHQ6IHQudGV4dCwgZG9uZTogdC5kb25lLCBkYXRlOiBkYXRlU3RyLnN1YnN0cmluZyg1KSB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBza2lwICovIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChkYWlseVRhc2tzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGNvbnN0IGFnZ1NlY3Rpb24gPSBwcmV2aWV3LmNyZWF0ZURpdigndGwtcGVyaW9kaWMtdGFzay1zZWN0aW9uJyk7XG4gICAgICAgICAgICBjb25zdCB1bmRvbmUgPSBkYWlseVRhc2tzLmZpbHRlcih0ID0+ICF0LmRvbmUpO1xuICAgICAgICAgICAgY29uc3QgZG9uZSA9IGRhaWx5VGFza3MuZmlsdGVyKHQgPT4gdC5kb25lKTtcblxuICAgICAgICAgICAgYWdnU2VjdGlvbi5jcmVhdGVEaXYoeyBjbHM6ICd0bC1wZXJpb2RpYy10YXNrLWdyb3VwLWxhYmVsJywgdGV4dDogdCgncGVyaW9kaWMud2Vla0RpYXJ5VGFza3MnLCBTdHJpbmcodW5kb25lLmxlbmd0aCksIFN0cmluZyhkb25lLmxlbmd0aCkpIH0pO1xuICAgICAgICAgICAgZm9yIChjb25zdCB0IG9mIHVuZG9uZS5zbGljZSgwLCAxMCkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCByb3cgPSBhZ2dTZWN0aW9uLmNyZWF0ZURpdigndGwtcGVyaW9kaWMtdGFzay1yb3cnKTtcbiAgICAgICAgICAgICAgICByb3cuY3JlYXRlRWwoJ3NwYW4nLCB7IGNsczogJ3RsLXBlcmlvZGljLXRhc2stY2hlY2snLCB0ZXh0OiAn4peLJyB9KTtcbiAgICAgICAgICAgICAgICByb3cuY3JlYXRlRWwoJ3NwYW4nLCB7IGNsczogJ3RsLXBlcmlvZGljLXRhc2stdGV4dCcsIHRleHQ6IHQudGV4dCB9KTtcbiAgICAgICAgICAgICAgICByb3cuY3JlYXRlRWwoJ3NwYW4nLCB7IGNsczogJ3RsLXBlcmlvZGljLXRhc2stZGF0ZS1iYWRnZScsIHRleHQ6IHQuZGF0ZSB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh1bmRvbmUubGVuZ3RoID4gMTApIHtcbiAgICAgICAgICAgICAgICBhZ2dTZWN0aW9uLmNyZWF0ZUVsKCdzcGFuJywgeyBjbHM6ICd0bC1wZXJpb2RpYy10YXNrLW1vcmUnLCB0ZXh0OiB0KCdwZXJpb2RpYy5tb3JlSXRlbXMnLCBTdHJpbmcodW5kb25lLmxlbmd0aCAtIDEwKSkgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXdlZWtGaWxlICYmIGRhaWx5VGFza3MubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICBwcmV2aWV3LmNyZWF0ZURpdih7IGNsczogJ3RsLXBlcmlvZGljLXByZXZpZXctZW1wdHknLCB0ZXh0OiB0KCdrYW5iYW4ubm9XZWVrUGxhbicpIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQUkgSW5zaWdodCBzdW1tYXJ5IGZvciB0aGlzIHdlZWtcbiAgICAgICAgYXdhaXQgdGhpcy5yZW5kZXJXZWVrbHlJbnNpZ2h0KHByZXZpZXcsIHdlZWtTdGFydCk7XG5cbiAgICAgICAgLy8gT3BlbiAvIENyZWF0ZSBidXR0b25cbiAgICAgICAgY29uc3Qgb3BlbkJ0biA9IHByZXZpZXcuY3JlYXRlRGl2KCd0bC1wZXJpb2RpYy1vcGVuLWJ0bicpO1xuICAgICAgICBpZiAod2Vla0ZpbGUpIHtcbiAgICAgICAgICAgIG9wZW5CdG4uc2V0VGV4dCh0KCdwZXJpb2RpYy5vcGVuV2Vla1BsYW4nKSk7XG4gICAgICAgICAgICBvcGVuQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICh3ZWVrRmlsZSBpbnN0YW5jZW9mIFRGaWxlKSB2b2lkIGguYXBwLndvcmtzcGFjZS5nZXRMZWFmKCkub3BlbkZpbGUod2Vla0ZpbGUpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBvcGVuQnRuLnNldFRleHQodCgncGVyaW9kaWMuY3JlYXRlV2Vla1BsYW4nKSk7XG4gICAgICAgICAgICBvcGVuQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgIHZvaWQgKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdG1wbCA9IGgucGx1Z2luLnRlbXBsYXRlTWFuYWdlci5nZXRXZWVrbHlQbGFuVGVtcGxhdGUod2Vla0xhYmVsLCB3ZWVrU3RhcnQuZm9ybWF0KCdZWVlZLU1NJykpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBmID0gYXdhaXQgaC5wbHVnaW4udmF1bHRNYW5hZ2VyLmdldE9yQ3JlYXRlV2Vla2x5UGxhbih3ZWVrU3RhcnQudG9EYXRlKCksIHRtcGwpO1xuICAgICAgICAgICAgICAgICAgICB2b2lkIGguYXBwLndvcmtzcGFjZS5nZXRMZWFmKCkub3BlbkZpbGUoZik7XG4gICAgICAgICAgICAgICAgfSkoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqIExvYWQgYW5kIHJlbmRlciB0aGUgQUkgd2Vla2x5IGluc2lnaHQgcmVwb3J0IHN1bW1hcnkgKi9cbiAgICBwcml2YXRlIGFzeW5jIHJlbmRlcldlZWtseUluc2lnaHQocHJldmlldzogSFRNTEVsZW1lbnQsIHdlZWtTdGFydDogbW9tZW50Lk1vbWVudCk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBjb25zdCBoID0gdGhpcy5ob3N0O1xuICAgICAgICBjb25zdCB3ZWVrTnVtID0gd2Vla1N0YXJ0LmZvcm1hdCgnd3cnKTtcbiAgICAgICAgY29uc3QgeWVhciA9IHdlZWtTdGFydC5mb3JtYXQoJ1lZWVknKTtcbiAgICAgICAgLy8gVHJ5IHZhcmlvdXMgbmFtaW5nIHBhdHRlcm5zXG4gICAgICAgIGNvbnN0IHBhdHRlcm5zID0gW1xuICAgICAgICAgICAgYCR7aC5wbHVnaW4uc2V0dGluZ3MuYXJjaGl2ZUZvbGRlcn0vSW5zaWdodHMvJHt0KCdpbnNpZ2h0LndlZWtseUZpbGVOYW1lJywgeWVhciwgd2Vla051bSl9YCxcbiAgICAgICAgICAgIGAke2gucGx1Z2luLnNldHRpbmdzLmFyY2hpdmVGb2xkZXJ9L0luc2lnaHRzLyR7dCgnaW5zaWdodC53ZWVrbHlGaWxlTmFtZScsIHllYXIsIFN0cmluZyhwYXJzZUludCh3ZWVrTnVtLCAxMCkpKX1gLFxuICAgICAgICBdO1xuXG4gICAgICAgIGxldCBpbnNpZ2h0Q29udGVudDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgIGxldCBpbnNpZ2h0RmlsZTogVEZpbGUgfCBudWxsID0gbnVsbDtcbiAgICAgICAgZm9yIChjb25zdCBwIG9mIHBhdHRlcm5zKSB7XG4gICAgICAgICAgICBjb25zdCBmID0gaC5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKHApO1xuICAgICAgICAgICAgaWYgKGYgJiYgZiBpbnN0YW5jZW9mIFRGaWxlKSB7XG4gICAgICAgICAgICAgICAgaW5zaWdodENvbnRlbnQgPSBhd2FpdCBoLmFwcC52YXVsdC5yZWFkKGYpO1xuICAgICAgICAgICAgICAgIGluc2lnaHRGaWxlID0gZjtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghaW5zaWdodENvbnRlbnQpIHJldHVybjtcblxuICAgICAgICBjb25zdCBzZWN0aW9uID0gcHJldmlldy5jcmVhdGVEaXYoJ3RsLXBlcmlvZGljLWluc2lnaHQtc2VjdGlvbicpO1xuICAgICAgICBzZWN0aW9uLmNyZWF0ZURpdih7IGNsczogJ3RsLXBlcmlvZGljLWluc2lnaHQtbGFiZWwnLCB0ZXh0OiB0KCdwZXJpb2RpYy5haVdlZWtseVN1bW1hcnknKSB9KTtcblxuICAgICAgICAvLyBFeHRyYWN0IGtleSBzZWN0aW9ucyBmcm9tIGluc2lnaHQgcmVwb3J0XG4gICAgICAgIGNvbnN0IGV4dHJhY3RzOiB7IGljb246IHN0cmluZzsgcGF0dGVybjogUmVnRXhwIH1bXSA9IFtcbiAgICAgICAgICAgIHsgaWNvbjogJ/Cfk4onLCBwYXR0ZXJuOiAvIyMjIFxcZCtcXC5cXHMqKD865pys5ZGo5qaC6KeIfFdlZWtseSBPdmVydmlldylcXG4oW1xcc1xcU10qPykoPz0jIyN8JCkvIH0sXG4gICAgICAgICAgICB7IGljb246ICfwn4+GJywgcGF0dGVybjogLyMjIyBcXGQrXFwuXFxzKig/OuaIkOWKn+aooeW8j3xTdWNjZXNzIFBhdHRlcm5zKVxcbihbXFxzXFxTXSo/KSg/PSMjI3wkKS8gfSxcbiAgICAgICAgICAgIHsgaWNvbjogJ/CfkqEnLCBwYXR0ZXJuOiAvIyMjIFxcZCtcXC5cXHMqKD865LiL5ZGo5bu66K6ufE5leHQgV2VlayBTdWdnZXN0aW9ucylcXG4oW1xcc1xcU10qPykoPz0jIyN8JCkvIH0sXG4gICAgICAgIF07XG5cbiAgICAgICAgZm9yIChjb25zdCBleCBvZiBleHRyYWN0cykge1xuICAgICAgICAgICAgY29uc3QgbSA9IGluc2lnaHRDb250ZW50Lm1hdGNoKGV4LnBhdHRlcm4pO1xuICAgICAgICAgICAgaWYgKG0gJiYgbVsxXS50cmltKCkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBsaW5lcyA9IG1bMV0udHJpbSgpLnNwbGl0KCdcXG4nKS5maWx0ZXIobCA9PiBsLnRyaW0oKSkuc2xpY2UoMCwgMyk7XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGl0ZW1EaXYgPSBzZWN0aW9uLmNyZWF0ZURpdigndGwtcGVyaW9kaWMtaW5zaWdodC1pdGVtJyk7XG4gICAgICAgICAgICAgICAgICAgIGl0ZW1EaXYuc2V0VGV4dChsaW5lLnJlcGxhY2UoL15bLSpdXFxzKlxcKlxcKi4qP1xcKlxcKls677yaXT9cXHMqLywgJycpLnJlcGxhY2UoL15bLSpdXFxzKi8sICcnKS5yZXBsYWNlKC9eXFxkK1xcLlxccypcXCpcXCouKj9cXCpcXCpbOu+8ml0/XFxzKi8sICcnKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gTGluayB0byBmdWxsIHJlcG9ydFxuICAgICAgICBpZiAoaW5zaWdodEZpbGUpIHtcbiAgICAgICAgICAgIGNvbnN0IGxpbmsgPSBzZWN0aW9uLmNyZWF0ZURpdigndGwtcGVyaW9kaWMtaW5zaWdodC1saW5rJyk7XG4gICAgICAgICAgICBsaW5rLnNldFRleHQodCgncmV2aWV3LnZpZXdGdWxsUmVwb3J0JykpO1xuICAgICAgICAgICAgbGluay5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgICAgICAgICB2b2lkIGguYXBwLndvcmtzcGFjZS5nZXRMZWFmKCkub3BlbkZpbGUoaW5zaWdodEZpbGUpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgICAvLyBNb250aCBNb2RlOiBtb250aCBncmlkICsgbW9udGhseSBwbGFuIHByZXZpZXdcbiAgICAvLyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuICAgIHByaXZhdGUgYXN5bmMgcmVuZGVyTW9udGhNb2RlKGJvZHk6IEhUTUxFbGVtZW50KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGNvbnN0IGggPSB0aGlzLmhvc3Q7XG4gICAgICAgIGNvbnN0IHNlbCA9IGgucGVyaW9kaWNTZWxlY3RlZERhdGU7XG4gICAgICAgIGNvbnN0IHllYXIgPSBzZWwueWVhcigpO1xuXG4gICAgICAgIC8vIFllYXIgbmF2XG4gICAgICAgIGNvbnN0IGNhbFNlY3Rpb24gPSBib2R5LmNyZWF0ZURpdigndGwtcGVyaW9kaWMtc2VsZWN0b3InKTtcbiAgICAgICAgY29uc3QgY2FsTmF2ID0gY2FsU2VjdGlvbi5jcmVhdGVEaXYoJ3RsLXBlcmlvZGljLWNhbC1uYXYnKTtcbiAgICAgICAgY29uc3QgcHJldkJ0biA9IGNhbE5hdi5jcmVhdGVFbCgnYnV0dG9uJywgeyBjbHM6ICd0bC1wZXJpb2RpYy1uYXYtYnRuJywgdGV4dDogJ+KAuScgfSk7XG4gICAgICAgIGNhbE5hdi5jcmVhdGVFbCgnc3BhbicsIHsgY2xzOiAndGwtcGVyaW9kaWMtY2FsLXRpdGxlJywgdGV4dDogZ2V0TGFuZ3VhZ2UoKSA9PT0gJ2VuJyA/IFN0cmluZyh5ZWFyKSA6IGAke3llYXJ95bm0YCB9KTtcbiAgICAgICAgY29uc3QgbmV4dEJ0biA9IGNhbE5hdi5jcmVhdGVFbCgnYnV0dG9uJywgeyBjbHM6ICd0bC1wZXJpb2RpYy1uYXYtYnRuJywgdGV4dDogJ+KAuicgfSk7XG4gICAgICAgIHByZXZCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgICBoLnBlcmlvZGljU2VsZWN0ZWREYXRlID0gbW9tZW50KHNlbCkuc3VidHJhY3QoMSwgJ3llYXInKTtcbiAgICAgICAgICAgIGguaW52YWxpZGF0ZVRhYkNhY2hlKCdrYW5iYW4nKTtcbiAgICAgICAgICAgIGguc3dpdGNoVGFiKCdrYW5iYW4nKTtcbiAgICAgICAgfSk7XG4gICAgICAgIG5leHRCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgICBoLnBlcmlvZGljU2VsZWN0ZWREYXRlID0gbW9tZW50KHNlbCkuYWRkKDEsICd5ZWFyJyk7XG4gICAgICAgICAgICBoLmludmFsaWRhdGVUYWJDYWNoZSgna2FuYmFuJyk7XG4gICAgICAgICAgICBoLnN3aXRjaFRhYigna2FuYmFuJyk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIDPDlzQgbW9udGggZ3JpZFxuICAgICAgICBjb25zdCBncmlkID0gY2FsU2VjdGlvbi5jcmVhdGVEaXYoJ3RsLXBlcmlvZGljLW1vbnRoLWdyaWQnKTtcbiAgICAgICAgY29uc3Qgc2VsZWN0ZWRNb250aCA9IHNlbC5mb3JtYXQoJ1lZWVktTU0nKTtcbiAgICAgICAgY29uc3QgY3VycmVudE1vbnRoID0gbW9tZW50KCkuZm9ybWF0KCdZWVlZLU1NJyk7XG5cbiAgICAgICAgZm9yIChsZXQgbSA9IDE7IG0gPD0gMTI7IG0rKykge1xuICAgICAgICAgICAgY29uc3QgbW9udGhTdHIgPSBgJHt5ZWFyfS0ke1N0cmluZyhtKS5wYWRTdGFydCgyLCAnMCcpfWA7XG4gICAgICAgICAgICBjb25zdCBpc1NlbGVjdGVkID0gbW9udGhTdHIgPT09IHNlbGVjdGVkTW9udGg7XG4gICAgICAgICAgICBjb25zdCBpc0N1cnJlbnQgPSBtb250aFN0ciA9PT0gY3VycmVudE1vbnRoO1xuXG4gICAgICAgICAgICAvLyBDaGVjayBpZiBtb250aGx5IHBsYW4gZXhpc3RzXG4gICAgICAgICAgICBjb25zdCBtb250aFBhdGggPSBgJHtoLnBsdWdpbi5zZXR0aW5ncy5wbGFuRm9sZGVyfS9Nb250aGx5LyR7bW9udGhTdHJ9Lm1kYDtcbiAgICAgICAgICAgIGNvbnN0IGhhc05vdGUgPSAhIWguYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChtb250aFBhdGgpO1xuXG4gICAgICAgICAgICBjb25zdCBjZWxsID0gZ3JpZC5jcmVhdGVEaXYoYHRsLXBlcmlvZGljLW1vbnRoLWNlbGwgJHtpc1NlbGVjdGVkID8gJ3RsLXBlcmlvZGljLW1vbnRoLWNlbGwtc2VsZWN0ZWQnIDogJyd9ICR7aXNDdXJyZW50ID8gJ3RsLXBlcmlvZGljLW1vbnRoLWNlbGwtY3VycmVudCcgOiAnJ30gJHtoYXNOb3RlID8gJ3RsLXBlcmlvZGljLW1vbnRoLWNlbGwtaGFzLW5vdGUnIDogJyd9YCk7XG4gICAgICAgICAgICBjZWxsLnNldFRleHQoZ2V0TGFuZ3VhZ2UoKSA9PT0gJ2VuJyA/IG1vbWVudCgpLm1vbnRoKG0gLSAxKS5mb3JtYXQoJ01NTScpIDogYCR7bX3mnIhgKTtcbiAgICAgICAgICAgIGNlbGwuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgaC5wZXJpb2RpY1NlbGVjdGVkRGF0ZSA9IG1vbWVudChgJHt5ZWFyfS0ke1N0cmluZyhtKS5wYWRTdGFydCgyLCAnMCcpfS0wMWApO1xuICAgICAgICAgICAgICAgIGguaW52YWxpZGF0ZVRhYkNhY2hlKCdrYW5iYW4nKTtcbiAgICAgICAgICAgICAgICBoLnN3aXRjaFRhYigna2FuYmFuJyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFByZXZpZXcgYXJlYVxuICAgICAgICBhd2FpdCB0aGlzLnJlbmRlck1vbnRoUHJldmlldyhib2R5LCBzZWwpO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcmVuZGVyTW9udGhQcmV2aWV3KGJvZHk6IEhUTUxFbGVtZW50LCBkYXRlOiBtb21lbnQuTW9tZW50KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGNvbnN0IGggPSB0aGlzLmhvc3Q7XG4gICAgICAgIGNvbnN0IG1vbnRoU3RyID0gZGF0ZS5mb3JtYXQoJ1lZWVktTU0nKTtcblxuICAgICAgICBjb25zdCBwcmV2aWV3ID0gYm9keS5jcmVhdGVEaXYoJ3RsLXBlcmlvZGljLXByZXZpZXcnKTtcbiAgICAgICAgY29uc3QgcHJldmlld0hlYWRlciA9IHByZXZpZXcuY3JlYXRlRGl2KCd0bC1wZXJpb2RpYy1wcmV2aWV3LWhlYWRlcicpO1xuICAgICAgICBwcmV2aWV3SGVhZGVyLmNyZWF0ZUVsKCdzcGFuJywgeyBjbHM6ICd0bC1wZXJpb2RpYy1wcmV2aWV3LWRhdGUnLCB0ZXh0OiB0KCdwZXJpb2RpYy5tb250aFBsYW4nLCBtb250aFN0cikgfSk7XG5cbiAgICAgICAgLy8gTG9hZCBtb250aGx5IHBsYW5cbiAgICAgICAgY29uc3QgbW9udGhQYXRoID0gYCR7aC5wbHVnaW4uc2V0dGluZ3MucGxhbkZvbGRlcn0vTW9udGhseS8ke21vbnRoU3RyfS5tZGA7XG4gICAgICAgIGNvbnN0IG1vbnRoRmlsZSA9IGguYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChtb250aFBhdGgpO1xuXG4gICAgICAgIGlmIChtb250aEZpbGUgJiYgbW9udGhGaWxlIGluc3RhbmNlb2YgVEZpbGUpIHtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBoLmFwcC52YXVsdC5yZWFkKG1vbnRoRmlsZSk7XG5cbiAgICAgICAgICAgIC8vIEV4dHJhY3QgZ29hbHNcbiAgICAgICAgICAgIGNvbnN0IGxpbmVzID0gY29udGVudC5zcGxpdCgnXFxuJyk7XG4gICAgICAgICAgICBjb25zdCBnb2FsTGluZXM6IHN0cmluZ1tdID0gW107XG4gICAgICAgICAgICBsZXQgaW5Hb2FscyA9IGZhbHNlO1xuICAgICAgICAgICAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgICAgICAgICAgICAgaWYgKGxpbmUuc3RhcnRzV2l0aCgnIyMgJykgfHwgbGluZS5zdGFydHNXaXRoKCcjICcpKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChpbkdvYWxzKSBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgaW5Hb2FscyA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoaW5Hb2FscyAmJiBsaW5lLnRyaW0oKSAmJiAhbGluZS5zdGFydHNXaXRoKCctLS0nKSkge1xuICAgICAgICAgICAgICAgICAgICBnb2FsTGluZXMucHVzaChsaW5lKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChnb2FsTGluZXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGdvYWxzRGl2ID0gcHJldmlldy5jcmVhdGVEaXYoJ3RsLXBlcmlvZGljLWdvYWxzJyk7XG4gICAgICAgICAgICAgICAgZ29hbHNEaXYuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAndGwtcGVyaW9kaWMtZ29hbHMtbGFiZWwnLCB0ZXh0OiB0KCdwZXJpb2RpYy5tb250aEdvYWxzJykgfSk7XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBnIG9mIGdvYWxMaW5lcy5zbGljZSgwLCA4KSkge1xuICAgICAgICAgICAgICAgICAgICBnb2Fsc0Rpdi5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICd0bC1wZXJpb2RpYy1nb2FsLWxpbmUnLCB0ZXh0OiBnLnJlcGxhY2UoL15bLSpdXFxzKi8sICcnKSB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFRhc2tzIGZyb20gbW9udGhseSBwbGFuXG4gICAgICAgICAgICBjb25zdCB0YXNrcyA9IGgucGFyc2VNZFRhc2tzKGNvbnRlbnQpLmZpbHRlcih0ID0+IHQuaXNUYXNrKTtcbiAgICAgICAgICAgIGNvbnN0IHRhc2tTZWN0aW9uID0gcHJldmlldy5jcmVhdGVEaXYoJ3RsLXBlcmlvZGljLXRhc2stc2VjdGlvbicpO1xuICAgICAgICAgICAgaWYgKHRhc2tzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICB0YXNrU2VjdGlvbi5jcmVhdGVEaXYoeyBjbHM6ICd0bC1wZXJpb2RpYy10YXNrLWdyb3VwLWxhYmVsJywgdGV4dDogdCgncGVyaW9kaWMubW9udGhUYXNrcycsIFN0cmluZyh0YXNrcy5sZW5ndGgpKSB9KTtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHRhc2sgb2YgdGFza3MpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJUYXNrKHRhc2tTZWN0aW9uLCB0YXNrLCBtb250aEZpbGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMucmVuZGVyVGFza0lucHV0KHRhc2tTZWN0aW9uLCBtb250aEZpbGUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gTm8gbW9udGhseSBmaWxlIOKAlCBzaG93IHRhc2sgaW5wdXQgdGhhdCBhdXRvLWNyZWF0ZXMgZmlsZVxuICAgICAgICAgICAgY29uc3QgdGFza1NlY3Rpb24gPSBwcmV2aWV3LmNyZWF0ZURpdigndGwtcGVyaW9kaWMtdGFzay1zZWN0aW9uJyk7XG4gICAgICAgICAgICB0aGlzLnJlbmRlclRhc2tJbnB1dEZvck1vbnRoKHRhc2tTZWN0aW9uLCBkYXRlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE1vbnRobHkgc3RhdHM6IGNvdW50IGRhaWx5IG5vdGVzICsgdGFza3MgaW4gdGhpcyBtb250aFxuICAgICAgICBjb25zdCBkYWlseUZvbGRlciA9IGgucGx1Z2luLnNldHRpbmdzLmRhaWx5Rm9sZGVyO1xuICAgICAgICBjb25zdCBhbGxGaWxlcyA9IGguYXBwLnZhdWx0LmdldEZpbGVzKCkuZmlsdGVyKGYgPT4gZi5wYXRoLnN0YXJ0c1dpdGgoZGFpbHlGb2xkZXIgKyAnLycpICYmIGYubmFtZS5zdGFydHNXaXRoKG1vbnRoU3RyKSk7XG4gICAgICAgIGlmIChhbGxGaWxlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb25zdCBzdGF0c0RpdiA9IHByZXZpZXcuY3JlYXRlRGl2KCd0bC1wZXJpb2RpYy1zdGF0cycpO1xuICAgICAgICAgICAgc3RhdHNEaXYuY3JlYXRlRWwoJ3NwYW4nLCB7IHRleHQ6IHQoJ3BlcmlvZGljLmRpYXJ5Q291bnQnLCBTdHJpbmcoYWxsRmlsZXMubGVuZ3RoKSkgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIW1vbnRoRmlsZSAmJiBhbGxGaWxlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHByZXZpZXcuY3JlYXRlRGl2KHsgY2xzOiAndGwtcGVyaW9kaWMtcHJldmlldy1lbXB0eScsIHRleHQ6IHQoJ2thbmJhbi5ub01vbnRoUGxhbicpIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gT3BlbiAvIENyZWF0ZSBidXR0b25cbiAgICAgICAgY29uc3Qgb3BlbkJ0biA9IHByZXZpZXcuY3JlYXRlRGl2KCd0bC1wZXJpb2RpYy1vcGVuLWJ0bicpO1xuICAgICAgICBpZiAobW9udGhGaWxlKSB7XG4gICAgICAgICAgICBvcGVuQnRuLnNldFRleHQodCgncGVyaW9kaWMub3Blbk1vbnRoUGxhbicpKTtcbiAgICAgICAgICAgIG9wZW5CdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKG1vbnRoRmlsZSBpbnN0YW5jZW9mIFRGaWxlKSB2b2lkIGguYXBwLndvcmtzcGFjZS5nZXRMZWFmKCkub3BlbkZpbGUobW9udGhGaWxlKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgb3BlbkJ0bi5zZXRUZXh0KHQoJ3BlcmlvZGljLmNyZWF0ZU1vbnRoUGxhbicpKTtcbiAgICAgICAgICAgIG9wZW5CdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgdm9pZCAoYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0bXBsID0gaC5wbHVnaW4udGVtcGxhdGVNYW5hZ2VyLmdldE1vbnRobHlQbGFuVGVtcGxhdGUobW9udGhTdHIpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBmID0gYXdhaXQgaC5wbHVnaW4udmF1bHRNYW5hZ2VyLmdldE9yQ3JlYXRlTW9udGhseVBsYW4oZGF0ZS50b0RhdGUoKSwgdG1wbCk7XG4gICAgICAgICAgICAgICAgICAgIHZvaWQgaC5hcHAud29ya3NwYWNlLmdldExlYWYoKS5vcGVuRmlsZShmKTtcbiAgICAgICAgICAgICAgICB9KSgpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgICAvLyBTaGFyZWQgdGFzayByZW5kZXJlciAmIGlucHV0IChUaGluZ3MvVGlja1RpY2sgc3R5bGUpXG4gICAgLy8g4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbiAgICBwcml2YXRlIHJlbmRlclRhc2soY29udGFpbmVyOiBIVE1MRWxlbWVudCwgdGFzazogeyB0ZXh0OiBzdHJpbmc7IGRvbmU6IGJvb2xlYW47IGluZGVudDogbnVtYmVyIH0sIGZpbGU6IFRGaWxlLCBzb3VyY2VEYXRlPzogbW9tZW50Lk1vbWVudCk6IHZvaWQge1xuICAgICAgICBjb25zdCBoID0gdGhpcy5ob3N0O1xuICAgICAgICBjb25zdCByb3cgPSBjb250YWluZXIuY3JlYXRlRGl2KGB0bC1wZXJpb2RpYy10YXNrLXJvdyAke3Rhc2suZG9uZSA/ICd0bC1wZXJpb2RpYy10YXNrLXJvdy1kb25lJyA6ICcnfWApO1xuICAgICAgICByb3cuZGF0YXNldC50YXNrVGV4dCA9IHRhc2sudGV4dDtcbiAgICAgICAgcm93LmRhdGFzZXQudGFza0luZGVudCA9IFN0cmluZyh0YXNrLmluZGVudCk7XG4gICAgICAgIHJvdy5zZXRBdHRyaWJ1dGUoJ2RyYWdnYWJsZScsICdmYWxzZScpO1xuICAgICAgICBpZiAodGFzay5pbmRlbnQgPiAwKSB7XG4gICAgICAgICAgICByb3cuYWRkQ2xhc3MoJ3RsLXBlcmlvZGljLXRhc2stc3VidGFzaycpO1xuICAgICAgICAgICAgcm93LnN0eWxlLnNldFByb3BlcnR5KCctLXRsLWluZGVudC1wYWQnLCBgJHsyMCArIHRhc2suaW5kZW50ICogMjB9cHhgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENoZWNrYm94XG4gICAgICAgIGNvbnN0IGNiID0gcm93LmNyZWF0ZUVsKCdpbnB1dCcsIHsgdHlwZTogJ2NoZWNrYm94JyB9KTtcbiAgICAgICAgY2IuY2hlY2tlZCA9IHRhc2suZG9uZTtcbiAgICAgICAgY2IuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgIHZvaWQgKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICBhd2FpdCBoLnRvZ2dsZU1kVGFzayhmaWxlLCB0YXNrLnRleHQsIHRhc2suZG9uZSk7XG4gICAgICAgICAgICAgICAgdGFzay5kb25lID0gIXRhc2suZG9uZTtcbiAgICAgICAgICAgICAgICBjYi5jaGVja2VkID0gdGFzay5kb25lO1xuICAgICAgICAgICAgICAgIHJvdy50b2dnbGVDbGFzcygndGwtcGVyaW9kaWMtdGFzay1yb3ctZG9uZScsIHRhc2suZG9uZSk7XG4gICAgICAgICAgICAgICAgbGFiZWwudG9nZ2xlQ2xhc3MoJ3RsLXRleHQtZG9uZScsIHRhc2suZG9uZSk7XG4gICAgICAgICAgICB9KSgpO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBMYWJlbCAoZG91YmxlLWNsaWNrIHRvIGVkaXQpXG4gICAgICAgIGNvbnN0IGxhYmVsID0gcm93LmNyZWF0ZUVsKCdzcGFuJywgeyBjbHM6ICd0bC1wZXJpb2RpYy10YXNrLXRleHQnLCB0ZXh0OiB0YXNrLnRleHQgfSk7XG4gICAgICAgIGlmICh0YXNrLmRvbmUpIHtcbiAgICAgICAgICAgIGxhYmVsLmFkZENsYXNzKCd0bC10ZXh0LWRvbmUnKTtcbiAgICAgICAgfVxuICAgICAgICBsYWJlbC5hZGRFdmVudExpc3RlbmVyKCdkYmxjbGljaycsICgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGlucHV0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaW5wdXQnKTtcbiAgICAgICAgICAgIGlucHV0LnR5cGUgPSAndGV4dCc7XG4gICAgICAgICAgICBpbnB1dC52YWx1ZSA9IHRhc2sudGV4dDtcbiAgICAgICAgICAgIGlucHV0LmNsYXNzTmFtZSA9ICd0bC10YXNrLWVkaXQtaW5wdXQnO1xuICAgICAgICAgICAgbGFiZWwucmVwbGFjZVdpdGgoaW5wdXQpO1xuICAgICAgICAgICAgaW5wdXQuZm9jdXMoKTtcbiAgICAgICAgICAgIGlucHV0LnNlbGVjdCgpO1xuICAgICAgICAgICAgY29uc3Qgc2F2ZSA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICB2b2lkIChhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG5ld1RleHQgPSBpbnB1dC52YWx1ZS50cmltKCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChuZXdUZXh0ICYmIG5ld1RleHQgIT09IHRhc2sudGV4dCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgaC5lZGl0TWRUYXNrKGZpbGUsIHRhc2sudGV4dCwgbmV3VGV4dCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0YXNrLnRleHQgPSBuZXdUZXh0O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG5ld0xhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuICAgICAgICAgICAgICAgICAgICBuZXdMYWJlbC5jbGFzc05hbWUgPSAndGwtcGVyaW9kaWMtdGFzay10ZXh0JztcbiAgICAgICAgICAgICAgICAgICAgbmV3TGFiZWwudGV4dENvbnRlbnQgPSB0YXNrLnRleHQ7XG4gICAgICAgICAgICAgICAgICAgIGlucHV0LnJlcGxhY2VXaXRoKG5ld0xhYmVsKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gUmUtYXR0YWNoIGRibGNsaWNrIGxpc3RlbmVyXG4gICAgICAgICAgICAgICAgICAgIG5ld0xhYmVsLmFkZEV2ZW50TGlzdGVuZXIoJ2RibGNsaWNrJywgKCkgPT4gbGFiZWwuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2RibGNsaWNrJykpKTtcbiAgICAgICAgICAgICAgICB9KSgpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGlucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2JsdXInLCBzYXZlKTtcbiAgICAgICAgICAgIGlucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChlLmtleSA9PT0gJ0VudGVyJykgeyBlLnByZXZlbnREZWZhdWx0KCk7IGlucHV0LmJsdXIoKTsgfVxuICAgICAgICAgICAgICAgIGlmIChlLmtleSA9PT0gJ0VzY2FwZScpIHsgaW5wdXQudmFsdWUgPSB0YXNrLnRleHQ7IGlucHV0LmJsdXIoKTsgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIERlbGV0ZSBidXR0b25cbiAgICAgICAgY29uc3QgZGVsQnRuID0gcm93LmNyZWF0ZUVsKCdzcGFuJywgeyBjbHM6ICd0bC10YXNrLWRlbGV0ZS1idG4nLCB0ZXh0OiAnw5cnIH0pO1xuICAgICAgICBkZWxCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgIHZvaWQgKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICBhd2FpdCBoLmRlbGV0ZU1kVGFzayhmaWxlLCB0YXNrLnRleHQpO1xuICAgICAgICAgICAgICAgIHJvdy5yZW1vdmUoKTtcbiAgICAgICAgICAgIH0pKCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEFkZCBzdWItdGFzayBidXR0b25cbiAgICAgICAgY29uc3Qgc3ViQnRuID0gcm93LmNyZWF0ZUVsKCdzcGFuJywgeyBjbHM6ICd0bC10YXNrLXN1Yi1idG4nLCB0ZXh0OiAnKycgfSk7XG4gICAgICAgIHN1YkJ0bi5zZXRBdHRyaWJ1dGUoJ3RpdGxlJywgdCgndGFzay5hZGRTdWJ0YXNrJykpO1xuICAgICAgICBzdWJCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgIGlmIChyb3cubmV4dEVsZW1lbnRTaWJsaW5nPy5oYXNDbGFzcygndGwtc3VidGFzay1pbnB1dC1yb3cnKSkgcmV0dXJuO1xuICAgICAgICAgICAgY29uc3Qgc3ViUm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgICAgICBzdWJSb3cuY2xhc3NOYW1lID0gJ3RsLXN1YnRhc2staW5wdXQtcm93JztcbiAgICAgICAgICAgIGNvbnN0IHN1YklucHV0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaW5wdXQnKTtcbiAgICAgICAgICAgIHN1YklucHV0LnR5cGUgPSAndGV4dCc7XG4gICAgICAgICAgICBzdWJJbnB1dC5jbGFzc05hbWUgPSAndGwtcGVyaW9kaWMtdGFzay1pbnB1dCB0bC1zdWJ0YXNrLWlucHV0JztcbiAgICAgICAgICAgIHN1YklucHV0LnBsYWNlaG9sZGVyID0gdCgndGFzay5zdWJ0YXNrUGxhY2Vob2xkZXInKTtcbiAgICAgICAgICAgIHN1YlJvdy5hcHBlbmRDaGlsZChzdWJJbnB1dCk7XG4gICAgICAgICAgICByb3cuYWZ0ZXIoc3ViUm93KTtcbiAgICAgICAgICAgIHN1YklucHV0LmZvY3VzKCk7XG5cbiAgICAgICAgICAgIGNvbnN0IGRvQWRkU3ViID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgIHZvaWQgKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdGV4dCA9IHN1YklucHV0LnZhbHVlLnRyaW0oKTtcbiAgICAgICAgICAgICAgICAgICAgc3ViUm93LnJlbW92ZSgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXRleHQpIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgaC5hZGRTdWJUYXNrKGZpbGUsIHRhc2sudGV4dCwgdGV4dCk7XG4gICAgICAgICAgICAgICAgICAgIGguaW52YWxpZGF0ZVRhYkNhY2hlKCdrYW5iYW4nKTtcbiAgICAgICAgICAgICAgICAgICAgaC5zd2l0Y2hUYWIoJ2thbmJhbicpO1xuICAgICAgICAgICAgICAgIH0pKCk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgc3ViSW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignYmx1cicsIGRvQWRkU3ViKTtcbiAgICAgICAgICAgIHN1YklucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCAoa2U6IEtleWJvYXJkRXZlbnQpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoa2Uua2V5ID09PSAnRW50ZXInKSB7IGtlLnByZXZlbnREZWZhdWx0KCk7IHN1YklucHV0LmJsdXIoKTsgfVxuICAgICAgICAgICAgICAgIGlmIChrZS5rZXkgPT09ICdFc2NhcGUnKSB7IHN1YklucHV0LnZhbHVlID0gJyc7IHN1YklucHV0LmJsdXIoKTsgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIERyYWcgaGFuZGxlIOKAlCByaWdodCBzaWRlLCBhZnRlciBhY3Rpb24gYnV0dG9uc1xuICAgICAgICBjb25zdCBoYW5kbGUgPSByb3cuY3JlYXRlRWwoJ3NwYW4nLCB7IGNsczogJ3RsLXRhc2stZHJhZy1oYW5kbGUnLCB0ZXh0OiAn4piwJyB9KTtcbiAgICAgICAgaGFuZGxlLnNldEF0dHJpYnV0ZSgndGl0bGUnLCB0KCdwZXJpb2RpYy5kcmFnVG9SZW9yZGVyJykpO1xuICAgICAgICBoYW5kbGUuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgKGUpID0+IHtcbiAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICByb3cuc2V0QXR0cmlidXRlKCdkcmFnZ2FibGUnLCAndHJ1ZScpO1xuICAgICAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsICgpID0+IHJvdy5zZXRBdHRyaWJ1dGUoJ2RyYWdnYWJsZScsICdmYWxzZScpLCB7IG9uY2U6IHRydWUgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICByb3cuYWRkRXZlbnRMaXN0ZW5lcignZHJhZ2VuZCcsICgpID0+IHJvdy5zZXRBdHRyaWJ1dGUoJ2RyYWdnYWJsZScsICdmYWxzZScpKTtcblxuICAgICAgICAvLyBEZWZlci10by10b2RheSBidXR0b24g4oCUIG9ubHkgZm9yIHVuY29tcGxldGVkIHRhc2tzIG9uIHBhc3QgZGF0ZXNcbiAgICAgICAgaWYgKHNvdXJjZURhdGUgJiYgIXRhc2suZG9uZSAmJiBzb3VyY2VEYXRlLmlzQmVmb3JlKG1vbWVudCgpLCAnZGF5JykpIHtcbiAgICAgICAgICAgIGNvbnN0IGRlZmVyQnRuID0gcm93LmNyZWF0ZUVsKCdzcGFuJywgeyBjbHM6ICd0bC10YXNrLWRlZmVyLWJ0bicsIGF0dHI6IHsgdGl0bGU6IHQoJ3BlcmlvZGljLmRlZmVyVG9kYXknKSB9IH0pO1xuICAgICAgICAgICAgc2V0SWNvbihkZWZlckJ0biwgJ2ZvcndhcmQnKTtcbiAgICAgICAgICAgIGRlZmVyQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcbiAgICAgICAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgIHZvaWQgKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgaC5kZWZlclRhc2tUb1RvZGF5KGZpbGUsIHRhc2sudGV4dCk7XG4gICAgICAgICAgICAgICAgICAgIHJvdy5yZW1vdmUoKTtcbiAgICAgICAgICAgICAgICB9KSgpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBSaWdodC1jbGljayBjb250ZXh0IG1lbnUgd2l0aCBkYXRlIHF1aWNrLWNoYW5nZVxuICAgICAgICByb3cuYWRkRXZlbnRMaXN0ZW5lcignY29udGV4dG1lbnUnLCAoZSkgPT4ge1xuICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcblxuICAgICAgICAgICAgLy8gUmVtb3ZlIGFueSBleGlzdGluZyBwb3B1cFxuICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnRsLXRhc2stZGF0ZS1wb3B1cCcpLmZvckVhY2goZWwgPT4gZWwucmVtb3ZlKCkpO1xuXG4gICAgICAgICAgICBjb25zdCBwb3B1cCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICAgICAgcG9wdXAuY2xhc3NOYW1lID0gJ3RsLXRhc2stZGF0ZS1wb3B1cCc7XG5cbiAgICAgICAgICAgIC8vIEhlYWRlclxuICAgICAgICAgICAgcG9wdXAuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAndGwtdGFzay1kYXRlLXBvcHVwLWhlYWRlcicsIHRleHQ6IHQoJ3BlcmlvZGljLmRhdGVMYWJlbCcpIH0pO1xuXG4gICAgICAgICAgICAvLyBCdXR0b24gcm93XG4gICAgICAgICAgICBjb25zdCBidG5Sb3cgPSBwb3B1cC5jcmVhdGVEaXYoJ3RsLXRhc2stZGF0ZS1wb3B1cC1idXR0b25zJyk7XG5cbiAgICAgICAgICAgIGNvbnN0IHRvZGF5RGF0ZSA9IG1vbWVudCgpO1xuICAgICAgICAgICAgY29uc3QgdG9tb3Jyb3dEYXRlID0gbW9tZW50KCkuYWRkKDEsICdkYXknKTtcbiAgICAgICAgICAgIGNvbnN0IG5leHRXZWVrRGF0ZSA9IG1vbWVudCgpLnN0YXJ0T2YoJ2lzb1dlZWsnKS5hZGQoMSwgJ3dlZWsnKTtcblxuICAgICAgICAgICAgLy8gVG9kYXlcbiAgICAgICAgICAgIGNvbnN0IHRvZGF5QnRuID0gYnRuUm93LmNyZWF0ZUVsKCdidXR0b24nLCB7IGNsczogJ3RsLXRhc2stZGF0ZS1idG4nLCBhdHRyOiB7IHRpdGxlOiB0KCdrYW5iYW4udG9kYXknKSB9IH0pO1xuICAgICAgICAgICAgY29uc3QgdG9kYXlJY29uID0gdG9kYXlCdG4uY3JlYXRlRGl2KCd0bC10YXNrLWRhdGUtYnRuLWljb24nKTtcbiAgICAgICAgICAgIHNldEljb24odG9kYXlJY29uLCAnc3VuJyk7XG4gICAgICAgICAgICB0b2RheUJ0bi5jcmVhdGVFbCgnc3BhbicsIHsgY2xzOiAndGwtdGFzay1kYXRlLWJ0bi1sYWJlbCcsIHRleHQ6IHQoJ2thbmJhbi50b2RheScpIH0pO1xuICAgICAgICAgICAgdG9kYXlCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgcG9wdXAucmVtb3ZlKCk7XG4gICAgICAgICAgICAgICAgdm9pZCAoYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBoLm1vdmVUYXNrVG9EYXRlKGZpbGUsIHRhc2sudGV4dCwgdG9kYXlEYXRlLnRvRGF0ZSgpKTtcbiAgICAgICAgICAgICAgICAgICAgcm93LnJlbW92ZSgpO1xuICAgICAgICAgICAgICAgIH0pKCk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gVG9tb3Jyb3dcbiAgICAgICAgICAgIGNvbnN0IHRtckJ0biA9IGJ0blJvdy5jcmVhdGVFbCgnYnV0dG9uJywgeyBjbHM6ICd0bC10YXNrLWRhdGUtYnRuJywgYXR0cjogeyB0aXRsZTogdCgncGVyaW9kaWMudG9tb3Jyb3cnKSB9IH0pO1xuICAgICAgICAgICAgY29uc3QgdG1ySWNvbiA9IHRtckJ0bi5jcmVhdGVEaXYoJ3RsLXRhc2stZGF0ZS1idG4taWNvbicpO1xuICAgICAgICAgICAgc2V0SWNvbih0bXJJY29uLCAnc3VucmlzZScpO1xuICAgICAgICAgICAgdG1yQnRuLmNyZWF0ZUVsKCdzcGFuJywgeyBjbHM6ICd0bC10YXNrLWRhdGUtYnRuLWxhYmVsJywgdGV4dDogdCgncGVyaW9kaWMudG9tb3Jyb3cnKSB9KTtcbiAgICAgICAgICAgIHRtckJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgICAgICAgICBwb3B1cC5yZW1vdmUoKTtcbiAgICAgICAgICAgICAgICB2b2lkIChhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IGgubW92ZVRhc2tUb0RhdGUoZmlsZSwgdGFzay50ZXh0LCB0b21vcnJvd0RhdGUudG9EYXRlKCkpO1xuICAgICAgICAgICAgICAgICAgICByb3cucmVtb3ZlKCk7XG4gICAgICAgICAgICAgICAgfSkoKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBOZXh0IHdlZWtcbiAgICAgICAgICAgIGNvbnN0IHdlZWtCdG4gPSBidG5Sb3cuY3JlYXRlRWwoJ2J1dHRvbicsIHsgY2xzOiAndGwtdGFzay1kYXRlLWJ0bicsIGF0dHI6IHsgdGl0bGU6IHQoJ3BlcmlvZGljLm5leHRXZWVrJykgfSB9KTtcbiAgICAgICAgICAgIGNvbnN0IHdlZWtJY29uID0gd2Vla0J0bi5jcmVhdGVEaXYoJ3RsLXRhc2stZGF0ZS1idG4taWNvbicpO1xuICAgICAgICAgICAgc2V0SWNvbih3ZWVrSWNvbiwgJ2NhbGVuZGFyLXBsdXMnKTtcbiAgICAgICAgICAgIHdlZWtCdG4uY3JlYXRlRWwoJ3NwYW4nLCB7IGNsczogJ3RsLXRhc2stZGF0ZS1idG4tbGFiZWwnLCB0ZXh0OiB0KCdwZXJpb2RpYy5uZXh0V2VlaycpIH0pO1xuICAgICAgICAgICAgd2Vla0J0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgICAgICAgICBwb3B1cC5yZW1vdmUoKTtcbiAgICAgICAgICAgICAgICB2b2lkIChhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IGgubW92ZVRhc2tUb0RhdGUoZmlsZSwgdGFzay50ZXh0LCBuZXh0V2Vla0RhdGUudG9EYXRlKCkpO1xuICAgICAgICAgICAgICAgICAgICByb3cucmVtb3ZlKCk7XG4gICAgICAgICAgICAgICAgfSkoKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBDdXN0b20gZGF0ZSBwaWNrZXJcbiAgICAgICAgICAgIGNvbnN0IGN1c3RvbUJ0biA9IGJ0blJvdy5jcmVhdGVFbCgnYnV0dG9uJywgeyBjbHM6ICd0bC10YXNrLWRhdGUtYnRuJywgYXR0cjogeyB0aXRsZTogdCgncGVyaW9kaWMuY3VzdG9tRGF0ZScpIH0gfSk7XG4gICAgICAgICAgICBjb25zdCBjdXN0b21JY29uID0gY3VzdG9tQnRuLmNyZWF0ZURpdigndGwtdGFzay1kYXRlLWJ0bi1pY29uJyk7XG4gICAgICAgICAgICBzZXRJY29uKGN1c3RvbUljb24sICdjYWxlbmRhci1zZWFyY2gnKTtcbiAgICAgICAgICAgIGN1c3RvbUJ0bi5jcmVhdGVFbCgnc3BhbicsIHsgY2xzOiAndGwtdGFzay1kYXRlLWJ0bi1sYWJlbCcsIHRleHQ6IHQoJ3BlcmlvZGljLmN1c3RvbScpIH0pO1xuICAgICAgICAgICAgY29uc3QgaGlkZGVuSW5wdXQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdpbnB1dCcpO1xuICAgICAgICAgICAgaGlkZGVuSW5wdXQudHlwZSA9ICdkYXRlJztcbiAgICAgICAgICAgIGhpZGRlbklucHV0LmNsYXNzTmFtZSA9ICd0bC10YXNrLWRhdGUtaGlkZGVuLWlucHV0JztcbiAgICAgICAgICAgIHBvcHVwLmFwcGVuZENoaWxkKGhpZGRlbklucHV0KTtcbiAgICAgICAgICAgIGhpZGRlbklucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsICgpID0+IHtcbiAgICAgICAgICAgICAgICBwb3B1cC5yZW1vdmUoKTtcbiAgICAgICAgICAgICAgICBpZiAoIWhpZGRlbklucHV0LnZhbHVlKSByZXR1cm47XG4gICAgICAgICAgICAgICAgY29uc3QgcGlja2VkID0gbmV3IERhdGUoaGlkZGVuSW5wdXQudmFsdWUgKyAnVDAwOjAwOjAwJyk7XG4gICAgICAgICAgICAgICAgdm9pZCAoYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBoLm1vdmVUYXNrVG9EYXRlKGZpbGUsIHRhc2sudGV4dCwgcGlja2VkKTtcbiAgICAgICAgICAgICAgICAgICAgcm93LnJlbW92ZSgpO1xuICAgICAgICAgICAgICAgIH0pKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGN1c3RvbUJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChldikgPT4ge1xuICAgICAgICAgICAgICAgIGV2LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgIGhpZGRlbklucHV0LnNob3dQaWNrZXIoKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBvcHVwKTtcblxuICAgICAgICAgICAgLy8gUG9zaXRpb24gdGhlIHBvcHVwIG5lYXIgdGhlIGNsaWNrXG4gICAgICAgICAgICBjb25zdCBwb3B1cFdpZHRoID0gMjIwO1xuICAgICAgICAgICAgY29uc3QgcG9wdXBIZWlnaHQgPSAxMDA7XG4gICAgICAgICAgICBsZXQgbGVmdCA9IGUuY2xpZW50WDtcbiAgICAgICAgICAgIGxldCB0b3AgPSBlLmNsaWVudFk7XG4gICAgICAgICAgICBpZiAobGVmdCArIHBvcHVwV2lkdGggPiB3aW5kb3cuaW5uZXJXaWR0aCkgbGVmdCA9IHdpbmRvdy5pbm5lcldpZHRoIC0gcG9wdXBXaWR0aCAtIDg7XG4gICAgICAgICAgICBpZiAodG9wICsgcG9wdXBIZWlnaHQgPiB3aW5kb3cuaW5uZXJIZWlnaHQpIHRvcCA9IGUuY2xpZW50WSAtIHBvcHVwSGVpZ2h0O1xuICAgICAgICAgICAgcG9wdXAuc2V0Q3NzUHJvcHMoeyAnLS10bC1wb3AtbGVmdCc6IGAke2xlZnR9cHhgLCAnLS10bC1wb3AtdG9wJzogYCR7dG9wfXB4YCB9KTtcblxuICAgICAgICAgICAgLy8gRGlzbWlzcyBvbiBvdXRzaWRlIGNsaWNrXG4gICAgICAgICAgICBjb25zdCBkaXNtaXNzID0gKGV2OiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCFwb3B1cC5jb250YWlucyhldi50YXJnZXQgYXMgTm9kZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgcG9wdXAucmVtb3ZlKCk7XG4gICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZGlzbWlzcywgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4gZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBkaXNtaXNzLCB0cnVlKSwgMCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIERyYWcgJiBkcm9wOiBkZWZhdWx0ID0gcmVvcmRlciAoc3VidGFza3MgYXV0by1wcm9tb3RlKSwgaG92ZXIgMXMgPSBuZXN0XG4gICAgICAgIGxldCBuZXN0VGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgbnVsbCA9IG51bGw7XG4gICAgICAgIGxldCBuZXN0TW9kZSA9IGZhbHNlO1xuXG4gICAgICAgIGNvbnN0IGNsZWFyRHJhZ1N0YXRlID0gKCkgPT4ge1xuICAgICAgICAgICAgaWYgKG5lc3RUaW1lcikgeyBjbGVhclRpbWVvdXQobmVzdFRpbWVyKTsgbmVzdFRpbWVyID0gbnVsbDsgfVxuICAgICAgICAgICAgbmVzdE1vZGUgPSBmYWxzZTtcbiAgICAgICAgICAgIHJvdy5yZW1vdmVDbGFzcygndGwtdGFzay1yb3ctZHJvcC1hYm92ZScsICd0bC10YXNrLXJvdy1kcm9wLWJlbG93JywgJ3RsLXRhc2stcm93LW5lc3QtaGludCcpO1xuICAgICAgICB9O1xuXG4gICAgICAgIHJvdy5hZGRFdmVudExpc3RlbmVyKCdkcmFnc3RhcnQnLCAoZSkgPT4ge1xuICAgICAgICAgICAgZS5kYXRhVHJhbnNmZXI/LnNldERhdGEoJ3RleHQvcGxhaW4nLCB0YXNrLnRleHQpO1xuICAgICAgICAgICAgZS5kYXRhVHJhbnNmZXI/LnNldERhdGEoJ3RleHQveC1pbmRlbnQnLCBTdHJpbmcodGFzay5pbmRlbnQpKTtcbiAgICAgICAgICAgIHJvdy5hZGRDbGFzcygndGwtdGFzay1yb3ctZHJhZ2dpbmcnKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJvdy5hZGRFdmVudExpc3RlbmVyKCdkcmFnZW5kJywgKCkgPT4ge1xuICAgICAgICAgICAgcm93LnJlbW92ZUNsYXNzKCd0bC10YXNrLXJvdy1kcmFnZ2luZycpO1xuICAgICAgICAgICAgY2xlYXJEcmFnU3RhdGUoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJvdy5hZGRFdmVudExpc3RlbmVyKCdkcmFnb3ZlcicsIChlKSA9PiB7XG4gICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAvLyBJZiBhbHJlYWR5IGluIG5lc3QgbW9kZSwga2VlcCBpdFxuICAgICAgICAgICAgaWYgKG5lc3RNb2RlKSByZXR1cm47XG5cbiAgICAgICAgICAgIC8vIFNob3cgcmVvcmRlciBpbmRpY2F0b3JcbiAgICAgICAgICAgIHJvdy5yZW1vdmVDbGFzcygndGwtdGFzay1yb3ctZHJvcC1hYm92ZScsICd0bC10YXNrLXJvdy1kcm9wLWJlbG93Jyk7XG4gICAgICAgICAgICBjb25zdCByZWN0ID0gcm93LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgICAgICAgY29uc3QgbWlkWSA9IHJlY3QudG9wICsgcmVjdC5oZWlnaHQgLyAyO1xuICAgICAgICAgICAgaWYgKGUuY2xpZW50WSA8IG1pZFkpIHtcbiAgICAgICAgICAgICAgICByb3cuYWRkQ2xhc3MoJ3RsLXRhc2stcm93LWRyb3AtYWJvdmUnKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcm93LmFkZENsYXNzKCd0bC10YXNrLXJvdy1kcm9wLWJlbG93Jyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFN0YXJ0IG5lc3QgdGltZXIgKDFzIGhvdmVyIOKGkiBuZXN0IG1vZGUpXG4gICAgICAgICAgICBpZiAoIW5lc3RUaW1lcikge1xuICAgICAgICAgICAgICAgIG5lc3RUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBuZXN0TW9kZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIHJvdy5yZW1vdmVDbGFzcygndGwtdGFzay1yb3ctZHJvcC1hYm92ZScsICd0bC10YXNrLXJvdy1kcm9wLWJlbG93Jyk7XG4gICAgICAgICAgICAgICAgICAgIHJvdy5hZGRDbGFzcygndGwtdGFzay1yb3ctbmVzdC1oaW50Jyk7XG4gICAgICAgICAgICAgICAgfSwgMTAwMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByb3cuYWRkRXZlbnRMaXN0ZW5lcignZHJhZ2xlYXZlJywgKCkgPT4ge1xuICAgICAgICAgICAgY2xlYXJEcmFnU3RhdGUoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJvdy5hZGRFdmVudExpc3RlbmVyKCdkcm9wJywgKGUpID0+IHtcbiAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgIGNvbnN0IHdhc05lc3QgPSBuZXN0TW9kZTtcbiAgICAgICAgICAgIGNsZWFyRHJhZ1N0YXRlKCk7XG4gICAgICAgICAgICBjb25zdCBkcmFnZ2VkVGV4dCA9IGUuZGF0YVRyYW5zZmVyPy5nZXREYXRhKCd0ZXh0L3BsYWluJyk7XG4gICAgICAgICAgICBpZiAoIWRyYWdnZWRUZXh0IHx8IGRyYWdnZWRUZXh0ID09PSB0YXNrLnRleHQpIHJldHVybjtcbiAgICAgICAgICAgIGNvbnN0IGRyYWdnZWRJbmRlbnQgPSBwYXJzZUludChlLmRhdGFUcmFuc2Zlcj8uZ2V0RGF0YSgndGV4dC94LWluZGVudCcpIHx8ICcwJywgMTApO1xuXG4gICAgICAgICAgICB2b2lkIChhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHdhc05lc3QpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gTmVzdDogbWFrZSBzdWItdGFza1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBoLmRlbGV0ZU1kVGFzayhmaWxlLCBkcmFnZ2VkVGV4dCk7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IGguYWRkU3ViVGFzayhmaWxlLCB0YXNrLnRleHQsIGRyYWdnZWRUZXh0KTtcbiAgICAgICAgICAgICAgICAgICAgaC5pbnZhbGlkYXRlVGFiQ2FjaGUoJ2thbmJhbicpO1xuICAgICAgICAgICAgICAgICAgICBoLnN3aXRjaFRhYigna2FuYmFuJyk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gUmVvcmRlciDigJQgaWYgZHJhZ2dlZCBpdGVtIGlzIGEgc3VidGFzaywgYXV0by1wcm9tb3RlIGZpcnN0XG4gICAgICAgICAgICAgICAgICAgIGlmIChkcmFnZ2VkSW5kZW50ID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgaC5zZXRUYXNrSW5kZW50KGZpbGUsIGRyYWdnZWRUZXh0LCAwKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBwYXJlbnQgPSByb3cucGFyZW50RWxlbWVudDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFwYXJlbnQpIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgcm93cyA9IEFycmF5LmZyb20ocGFyZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy50bC1wZXJpb2RpYy10YXNrLXJvdycpKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdGV4dHMgPSByb3dzLm1hcChyID0+IChyIGFzIEhUTUxFbGVtZW50KS5kYXRhc2V0LnRhc2tUZXh0IHx8ICcnKS5maWx0ZXIodCA9PiB0KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZnJvbUlkeCA9IHRleHRzLmluZGV4T2YoZHJhZ2dlZFRleHQpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0b0lkeCA9IHRleHRzLmluZGV4T2YodGFzay50ZXh0KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZyb21JZHggPj0gMCAmJiB0b0lkeCA+PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0ZXh0cy5zcGxpY2UoZnJvbUlkeCwgMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0ZXh0cy5zcGxpY2UodG9JZHgsIDAsIGRyYWdnZWRUZXh0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IGgucmVvcmRlck1kVGFza3MoZmlsZSwgdGV4dHMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaC5pbnZhbGlkYXRlVGFiQ2FjaGUoJ2thbmJhbicpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaC5zd2l0Y2hUYWIoJ2thbmJhbicpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkoKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqIElubGluZSB0YXNrLWFkZCBpbnB1dCAqL1xuICAgIHByaXZhdGUgcmVuZGVyVGFza0lucHV0KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGZpbGU6IFRGaWxlKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGggPSB0aGlzLmhvc3Q7XG4gICAgICAgIGNvbnN0IHJvdyA9IGNvbnRhaW5lci5jcmVhdGVEaXYoJ3RsLXBlcmlvZGljLXRhc2staW5wdXQtcm93Jyk7XG4gICAgICAgIGNvbnN0IGlucHV0ID0gcm93LmNyZWF0ZUVsKCdpbnB1dCcsIHtcbiAgICAgICAgICAgIHR5cGU6ICd0ZXh0JyxcbiAgICAgICAgICAgIGNsczogJ3RsLXBlcmlvZGljLXRhc2staW5wdXQnLFxuICAgICAgICAgICAgYXR0cjogeyBwbGFjZWhvbGRlcjogdCgncGVyaW9kaWMuYWRkVGFza1BsYWNlaG9sZGVyJykgfSxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IGFkZEJ0biA9IHJvdy5jcmVhdGVFbCgnYnV0dG9uJywge1xuICAgICAgICAgICAgY2xzOiAndGwtcGVyaW9kaWMtdGFzay1hZGQtYnRuJyxcbiAgICAgICAgICAgIHRleHQ6ICcrJyxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgZG9BZGQgPSBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gaW5wdXQudmFsdWUudHJpbSgpO1xuICAgICAgICAgICAgaWYgKCF0ZXh0KSByZXR1cm47XG4gICAgICAgICAgICBpbnB1dC52YWx1ZSA9ICcnO1xuICAgICAgICAgICAgYXdhaXQgaC5hZGRNZFRhc2soZmlsZSwgdGV4dCk7XG4gICAgICAgICAgICBoLmludmFsaWRhdGVUYWJDYWNoZSgna2FuYmFuJyk7XG4gICAgICAgICAgICBoLnN3aXRjaFRhYigna2FuYmFuJyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgYWRkQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gdm9pZCBkb0FkZCgpKTtcbiAgICAgICAgaW5wdXQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG4gICAgICAgICAgICBpZiAoZS5rZXkgPT09ICdFbnRlcicpIHsgZS5wcmV2ZW50RGVmYXVsdCgpOyB2b2lkIGRvQWRkKCk7IH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqIFRhc2sgaW5wdXQgdGhhdCBhdXRvLWNyZWF0ZXMgdGhlIGRhaWx5IG5vdGUgZmlsZSAqL1xuICAgIHByaXZhdGUgcmVuZGVyVGFza0lucHV0Rm9yRGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50LCBkYXRlOiBtb21lbnQuTW9tZW50KTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGggPSB0aGlzLmhvc3Q7XG4gICAgICAgIGNvbnN0IHJvdyA9IGNvbnRhaW5lci5jcmVhdGVEaXYoJ3RsLXBlcmlvZGljLXRhc2staW5wdXQtcm93Jyk7XG4gICAgICAgIGNvbnN0IGlucHV0ID0gcm93LmNyZWF0ZUVsKCdpbnB1dCcsIHtcbiAgICAgICAgICAgIHR5cGU6ICd0ZXh0JyxcbiAgICAgICAgICAgIGNsczogJ3RsLXBlcmlvZGljLXRhc2staW5wdXQnLFxuICAgICAgICAgICAgYXR0cjogeyBwbGFjZWhvbGRlcjogdCgncGVyaW9kaWMuYWRkVGFza1BsYWNlaG9sZGVyJykgfSxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IGFkZEJ0biA9IHJvdy5jcmVhdGVFbCgnYnV0dG9uJywge1xuICAgICAgICAgICAgY2xzOiAndGwtcGVyaW9kaWMtdGFzay1hZGQtYnRuJyxcbiAgICAgICAgICAgIHRleHQ6ICcrJyxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgZG9BZGQgPSBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gaW5wdXQudmFsdWUudHJpbSgpO1xuICAgICAgICAgICAgaWYgKCF0ZXh0KSByZXR1cm47XG4gICAgICAgICAgICBpbnB1dC52YWx1ZSA9ICcnO1xuICAgICAgICAgICAgLy8gQXV0by1jcmVhdGUgZGFpbHkgbm90ZSBpZiBuZWVkZWRcbiAgICAgICAgICAgIGNvbnN0IGZpbGUgPSBhd2FpdCBoLnBsdWdpbi52YXVsdE1hbmFnZXIuZ2V0T3JDcmVhdGVEYWlseU5vdGUoZGF0ZS50b0RhdGUoKSk7XG4gICAgICAgICAgICBhd2FpdCBoLmFkZE1kVGFzayhmaWxlLCB0ZXh0KTtcbiAgICAgICAgICAgIGguaW52YWxpZGF0ZVRhYkNhY2hlKCdrYW5iYW4nKTtcbiAgICAgICAgICAgIGguc3dpdGNoVGFiKCdrYW5iYW4nKTtcbiAgICAgICAgfTtcblxuICAgICAgICBhZGRCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB2b2lkIGRvQWRkKCkpO1xuICAgICAgICBpbnB1dC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcbiAgICAgICAgICAgIGlmIChlLmtleSA9PT0gJ0VudGVyJykgeyBlLnByZXZlbnREZWZhdWx0KCk7IHZvaWQgZG9BZGQoKTsgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKiogVGFzayBpbnB1dCB0aGF0IGF1dG8tY3JlYXRlcyB0aGUgd2Vla2x5IHBsYW4gZmlsZSAqL1xuICAgIHByaXZhdGUgcmVuZGVyVGFza0lucHV0Rm9yV2Vlayhjb250YWluZXI6IEhUTUxFbGVtZW50LCB3ZWVrU3RhcnQ6IG1vbWVudC5Nb21lbnQsIHdlZWtMYWJlbDogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGggPSB0aGlzLmhvc3Q7XG4gICAgICAgIGNvbnN0IHJvdyA9IGNvbnRhaW5lci5jcmVhdGVEaXYoJ3RsLXBlcmlvZGljLXRhc2staW5wdXQtcm93Jyk7XG4gICAgICAgIGNvbnN0IGlucHV0ID0gcm93LmNyZWF0ZUVsKCdpbnB1dCcsIHtcbiAgICAgICAgICAgIHR5cGU6ICd0ZXh0JyxcbiAgICAgICAgICAgIGNsczogJ3RsLXBlcmlvZGljLXRhc2staW5wdXQnLFxuICAgICAgICAgICAgYXR0cjogeyBwbGFjZWhvbGRlcjogdCgncGVyaW9kaWMuYWRkV2Vla1Rhc2tQbGFjZWhvbGRlcicpIH0sXG4gICAgICAgIH0pO1xuICAgICAgICBjb25zdCBhZGRCdG4gPSByb3cuY3JlYXRlRWwoJ2J1dHRvbicsIHtcbiAgICAgICAgICAgIGNsczogJ3RsLXBlcmlvZGljLXRhc2stYWRkLWJ0bicsXG4gICAgICAgICAgICB0ZXh0OiAnKycsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IGRvQWRkID0gYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgdGV4dCA9IGlucHV0LnZhbHVlLnRyaW0oKTtcbiAgICAgICAgICAgIGlmICghdGV4dCkgcmV0dXJuO1xuICAgICAgICAgICAgaW5wdXQudmFsdWUgPSAnJztcbiAgICAgICAgICAgIGNvbnN0IHRtcGwgPSBoLnBsdWdpbi50ZW1wbGF0ZU1hbmFnZXIuZ2V0V2Vla2x5UGxhblRlbXBsYXRlKHdlZWtMYWJlbCwgd2Vla1N0YXJ0LmZvcm1hdCgnWVlZWS1NTScpKTtcbiAgICAgICAgICAgIGNvbnN0IGZpbGUgPSBhd2FpdCBoLnBsdWdpbi52YXVsdE1hbmFnZXIuZ2V0T3JDcmVhdGVXZWVrbHlQbGFuKHdlZWtTdGFydC50b0RhdGUoKSwgdG1wbCk7XG4gICAgICAgICAgICBhd2FpdCBoLmFkZE1kVGFzayhmaWxlLCB0ZXh0KTtcbiAgICAgICAgICAgIGguaW52YWxpZGF0ZVRhYkNhY2hlKCdrYW5iYW4nKTtcbiAgICAgICAgICAgIGguc3dpdGNoVGFiKCdrYW5iYW4nKTtcbiAgICAgICAgfTtcblxuICAgICAgICBhZGRCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB2b2lkIGRvQWRkKCkpO1xuICAgICAgICBpbnB1dC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcbiAgICAgICAgICAgIGlmIChlLmtleSA9PT0gJ0VudGVyJykgeyBlLnByZXZlbnREZWZhdWx0KCk7IHZvaWQgZG9BZGQoKTsgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKiogVGFzayBpbnB1dCB0aGF0IGF1dG8tY3JlYXRlcyB0aGUgbW9udGhseSBwbGFuIGZpbGUgKi9cbiAgICBwcml2YXRlIHJlbmRlclRhc2tJbnB1dEZvck1vbnRoKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGRhdGU6IG1vbWVudC5Nb21lbnQpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgaCA9IHRoaXMuaG9zdDtcbiAgICAgICAgY29uc3QgbW9udGhTdHIgPSBkYXRlLmZvcm1hdCgnWVlZWS1NTScpO1xuICAgICAgICBjb25zdCByb3cgPSBjb250YWluZXIuY3JlYXRlRGl2KCd0bC1wZXJpb2RpYy10YXNrLWlucHV0LXJvdycpO1xuICAgICAgICBjb25zdCBpbnB1dCA9IHJvdy5jcmVhdGVFbCgnaW5wdXQnLCB7XG4gICAgICAgICAgICB0eXBlOiAndGV4dCcsXG4gICAgICAgICAgICBjbHM6ICd0bC1wZXJpb2RpYy10YXNrLWlucHV0JyxcbiAgICAgICAgICAgIGF0dHI6IHsgcGxhY2Vob2xkZXI6IHQoJ3BlcmlvZGljLmFkZE1vbnRoVGFza1BsYWNlaG9sZGVyJykgfSxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IGFkZEJ0biA9IHJvdy5jcmVhdGVFbCgnYnV0dG9uJywge1xuICAgICAgICAgICAgY2xzOiAndGwtcGVyaW9kaWMtdGFzay1hZGQtYnRuJyxcbiAgICAgICAgICAgIHRleHQ6ICcrJyxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgZG9BZGQgPSBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gaW5wdXQudmFsdWUudHJpbSgpO1xuICAgICAgICAgICAgaWYgKCF0ZXh0KSByZXR1cm47XG4gICAgICAgICAgICBpbnB1dC52YWx1ZSA9ICcnO1xuICAgICAgICAgICAgY29uc3QgdG1wbCA9IGgucGx1Z2luLnRlbXBsYXRlTWFuYWdlci5nZXRNb250aGx5UGxhblRlbXBsYXRlKG1vbnRoU3RyKTtcbiAgICAgICAgICAgIGNvbnN0IGZpbGUgPSBhd2FpdCBoLnBsdWdpbi52YXVsdE1hbmFnZXIuZ2V0T3JDcmVhdGVNb250aGx5UGxhbihkYXRlLnRvRGF0ZSgpLCB0bXBsKTtcbiAgICAgICAgICAgIGF3YWl0IGguYWRkTWRUYXNrKGZpbGUsIHRleHQpO1xuICAgICAgICAgICAgaC5pbnZhbGlkYXRlVGFiQ2FjaGUoJ2thbmJhbicpO1xuICAgICAgICAgICAgaC5zd2l0Y2hUYWIoJ2thbmJhbicpO1xuICAgICAgICB9O1xuXG4gICAgICAgIGFkZEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHZvaWQgZG9BZGQoKSk7XG4gICAgICAgIGlucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuICAgICAgICAgICAgaWYgKGUua2V5ID09PSAnRW50ZXInKSB7IGUucHJldmVudERlZmF1bHQoKTsgdm9pZCBkb0FkZCgpOyB9XG4gICAgICAgIH0pO1xuICAgIH1cbn1cbiJdfQ==