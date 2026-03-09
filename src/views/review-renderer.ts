/**
 * Review Renderer - Renders the Review tab (calendar + dashboard)
 * Extracted from chat-view.ts for maintainability.
 */

import { TFile, moment } from 'obsidian';
import type TideLogPlugin from '../main';
import type { App } from 'obsidian';

interface CalData { emotionScore: number | null; taskCount: number; completedCount: number; tasks: { text: string; done: boolean }[]; status: string; filePath: string; hasPlan: boolean; hasReview: boolean }

/** Minimal interface for the host view that owns this renderer. */
export interface ReviewHost {
    plugin: TideLogPlugin;
    app: App;
    calendarMonth: moment.Moment;
    calendarViewMode: 'month' | 'week';
    calendarWeekOffset: number;
    parseNoteScores(content: string): number | null;
    switchTab(tab: string): void;
    invalidateTabCache(tab: string): void;
}

export class ReviewRenderer {
    constructor(private host: ReviewHost) { }

    async render(panel: HTMLElement): Promise<void> {
        panel.addClass('tl-review-scroll');
        await this.renderReviewCalendar(panel);
        await this.renderReviewDashboard(panel);
    }

    // ---- Shared data loader ----

    private async loadDayData(dateStr: string): Promise<CalData | null> {
        const h = this.host;
        const path = `${h.plugin.settings.dailyFolder}/${dateStr}.md`;
        const file = h.app.vault.getAbstractFileByPath(path);
        if (!file || !(file instanceof TFile)) return null;
        try {
            const content = await h.app.vault.read(file);
            const emotionScore = h.parseNoteScores(content);
            let status = 'todo';
            if (content.startsWith('---')) {
                const end = content.indexOf('---', 3);
                if (end > 0) {
                    const sm = content.substring(4, end).match(/status:\s*(\S+)/);
                    if (sm) status = sm[1];
                }
            }
            const tasks: { text: string; done: boolean }[] = [];
            for (const line of content.split('\n')) {
                const m = line.match(/^- \[([ x])\] (.+)$/);
                if (m) tasks.push({ done: m[1] === 'x', text: m[2].trim() });
            }
            return {
                emotionScore,
                taskCount: tasks.length,
                completedCount: tasks.filter(t => t.done).length,
                tasks,
                status,
                filePath: file.path,
                hasPlan: content.includes('## 晨间计划') && tasks.length > 0,
                hasReview: content.includes('## 晚间复盘'),
            };
        } catch { return null; }
    }

    // --- Calendar section ---

    private async renderReviewCalendar(panel: HTMLElement): Promise<void> {
        const h = this.host;
        const mode = h.calendarViewMode || 'month';
        const layer = panel.createDiv('tl-pyramid-layer tl-pyramid-review-cal');

        // Header with nav + mode toggle
        const header = layer.createDiv('tl-pyramid-layer-header tl-cal-header');
        const prevBtn = header.createEl('button', { cls: 'tl-cal-nav-btn', text: '‹' });
        const titleEl = header.createEl('span', { cls: 'tl-cal-title' });
        const nextBtn = header.createEl('button', { cls: 'tl-cal-nav-btn', text: '›' });

        // Mode toggle
        const modeToggle = header.createDiv('tl-cal-mode-toggle');
        const monthBtn = modeToggle.createEl('button', {
            cls: `tl-cal-mode-btn ${mode === 'month' ? 'tl-cal-mode-btn-active' : ''}`,
            text: '月',
        });
        const weekBtn = modeToggle.createEl('button', {
            cls: `tl-cal-mode-btn ${mode === 'week' ? 'tl-cal-mode-btn-active' : ''}`,
            text: '周',
        });
        monthBtn.addEventListener('click', () => { h.calendarViewMode = 'month'; h.invalidateTabCache('review'); h.switchTab('review'); });
        weekBtn.addEventListener('click', () => { h.calendarViewMode = 'week'; h.calendarWeekOffset = 0; h.invalidateTabCache('review'); h.switchTab('review'); });

        if (mode === 'month') {
            titleEl.setText(h.calendarMonth.format('YYYY年 M月'));
            prevBtn.addEventListener('click', () => { h.calendarMonth.subtract(1, 'month'); h.invalidateTabCache('review'); h.switchTab('review'); });
            nextBtn.addEventListener('click', () => { h.calendarMonth.add(1, 'month'); h.invalidateTabCache('review'); h.switchTab('review'); });
            await this.renderMonthView(layer);
        } else {
            const weekStart = moment().startOf('isoWeek').add(h.calendarWeekOffset, 'weeks');
            titleEl.setText(`${weekStart.format('M月D日')} — ${moment(weekStart).add(6, 'days').format('M月D日')}`);
            prevBtn.addEventListener('click', () => { h.calendarWeekOffset--; h.invalidateTabCache('review'); h.switchTab('review'); });
            nextBtn.addEventListener('click', () => { h.calendarWeekOffset++; h.invalidateTabCache('review'); h.switchTab('review'); });

            // "Today" button
            if (h.calendarWeekOffset !== 0) {
                const todayBtn = header.createEl('button', { cls: 'tl-cal-today-btn', text: '本周' });
                todayBtn.addEventListener('click', () => { h.calendarWeekOffset = 0; h.invalidateTabCache('review'); h.switchTab('review'); });
            }

            await this.renderWeekView(layer, weekStart);
        }
    }

    // ---- Month View ----

    private async renderMonthView(layer: HTMLElement): Promise<void> {
        const h = this.host;
        const body = layer.createDiv('tl-pyramid-review-cal-body');

        // Weekday row
        const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
        const grid = body.createDiv('tl-cal-grid');
        for (const wd of weekdays) {
            grid.createEl('div', { cls: 'tl-cal-weekday', text: wd });
        }

        // Pad
        const firstDay = moment(h.calendarMonth).startOf('month');
        const startPad = firstDay.isoWeekday() - 1;
        for (let i = 0; i < startPad; i++) grid.createDiv('tl-cal-cell tl-cal-cell-empty');

        const daysInMonth = h.calendarMonth.daysInMonth();
        const todayStr = moment().format('YYYY-MM-DD');

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = moment(h.calendarMonth).date(d).format('YYYY-MM-DD');
            const data = await this.loadDayData(dateStr);
            const isToday = dateStr === todayStr;

            const cell = grid.createDiv(`tl-cal-cell ${isToday ? 'tl-cal-cell-today' : ''}`);

            // Apple Watch-style SVG activity ring
            const hasPlan = data?.hasPlan ?? false;
            const hasReview = data?.hasReview ?? false;
            const hasData = !!data;

            const svgNS = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(svgNS, 'svg');
            svg.setAttribute('width', '32');
            svg.setAttribute('height', '32');
            svg.setAttribute('viewBox', '0 0 32 32');
            svg.setAttribute('class', 'tl-cal-ring-svg');

            const cx = 16, cy = 16;

            // Mood fill circle (center)
            if (data?.emotionScore) {
                const hue = Math.round(((data.emotionScore - 1) / 9) * 120);
                const fillCircle = document.createElementNS(svgNS, 'circle');
                fillCircle.setAttribute('cx', `${cx}`);
                fillCircle.setAttribute('cy', `${cy}`);
                fillCircle.setAttribute('r', '6');
                fillCircle.setAttribute('fill', `hsl(${hue}, 60%, 70%)`);
                svg.appendChild(fillCircle);
            }

            if (hasData) {
                // Outer ring: Plan (green #34D399)
                const outerR = 13;
                const outerC = 2 * Math.PI * outerR; // ~81.68
                const outerTrack = document.createElementNS(svgNS, 'circle');
                outerTrack.setAttribute('cx', `${cx}`);
                outerTrack.setAttribute('cy', `${cy}`);
                outerTrack.setAttribute('r', `${outerR}`);
                outerTrack.setAttribute('fill', 'none');
                outerTrack.setAttribute('stroke', 'var(--background-modifier-border)');
                outerTrack.setAttribute('stroke-width', '2.5');
                svg.appendChild(outerTrack);

                if (hasPlan) {
                    const outerArc = document.createElementNS(svgNS, 'circle');
                    outerArc.setAttribute('cx', `${cx}`);
                    outerArc.setAttribute('cy', `${cy}`);
                    outerArc.setAttribute('r', `${outerR}`);
                    outerArc.setAttribute('fill', 'none');
                    outerArc.setAttribute('stroke', '#34D399');
                    outerArc.setAttribute('stroke-width', '2.5');
                    outerArc.setAttribute('stroke-linecap', 'round');
                    outerArc.setAttribute('stroke-dasharray', `${outerC}`);
                    outerArc.setAttribute('stroke-dashoffset', '0');
                    outerArc.setAttribute('transform', `rotate(-90 ${cx} ${cy})`);
                    svg.appendChild(outerArc);
                }

                // Inner ring: Review (blue #60A5FA)
                const innerR = 9.5;
                const innerC = 2 * Math.PI * innerR; // ~59.69
                const innerTrack = document.createElementNS(svgNS, 'circle');
                innerTrack.setAttribute('cx', `${cx}`);
                innerTrack.setAttribute('cy', `${cy}`);
                innerTrack.setAttribute('r', `${innerR}`);
                innerTrack.setAttribute('fill', 'none');
                innerTrack.setAttribute('stroke', 'var(--background-modifier-border)');
                innerTrack.setAttribute('stroke-width', '2.5');
                svg.appendChild(innerTrack);

                if (hasReview) {
                    const innerArc = document.createElementNS(svgNS, 'circle');
                    innerArc.setAttribute('cx', `${cx}`);
                    innerArc.setAttribute('cy', `${cy}`);
                    innerArc.setAttribute('r', `${innerR}`);
                    innerArc.setAttribute('fill', 'none');
                    innerArc.setAttribute('stroke', '#60A5FA');
                    innerArc.setAttribute('stroke-width', '2.5');
                    innerArc.setAttribute('stroke-linecap', 'round');
                    innerArc.setAttribute('stroke-dasharray', `${innerC}`);
                    innerArc.setAttribute('stroke-dashoffset', '0');
                    innerArc.setAttribute('transform', `rotate(-90 ${cx} ${cy})`);
                    svg.appendChild(innerArc);
                }
            }

            // Date number
            const text = document.createElementNS(svgNS, 'text');
            text.setAttribute('x', `${cx}`);
            text.setAttribute('y', `${cy}`);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'central');
            text.setAttribute('class', 'tl-cal-ring-text');
            text.textContent = `${d}`;
            svg.appendChild(text);

            cell.appendChild(svg);

            // Tooltip
            if (data?.filePath) {
                cell.addClass('tl-cal-cell-clickable');
                const tipParts: string[] = [];
                if (hasPlan) tipParts.push('🟢 计划');
                if (hasReview) tipParts.push('🔵 复盘');
                if (data.emotionScore) tipParts.push(`心情 ${data.emotionScore}/10`);
                if (data.taskCount > 0) tipParts.push(`任务 ${data.completedCount}/${data.taskCount}`);
                if (tipParts.length) cell.setAttribute('aria-label', tipParts.join(' · '));

                cell.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.showTaskPopover(cell, data, dateStr);
                });
            }
        }
    }

    // ---- Week View ----

    private async renderWeekView(layer: HTMLElement, weekStart: moment.Moment): Promise<void> {
        const h = this.host;
        const todayStr = moment().format('YYYY-MM-DD');
        const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

        const weekGrid = layer.createDiv('tl-week-grid');

        for (let i = 0; i < 7; i++) {
            const d = moment(weekStart).add(i, 'days');
            const dateStr = d.format('YYYY-MM-DD');
            const isToday = dateStr === todayStr;
            const data = await this.loadDayData(dateStr);

            const col = weekGrid.createDiv(`tl-week-col ${isToday ? 'tl-week-col-today' : ''}`);

            // Day header
            const dayHeader = col.createDiv('tl-week-day-header');
            dayHeader.createEl('span', { cls: 'tl-week-day-name', text: weekdays[i] });
            dayHeader.createEl('span', { cls: `tl-week-day-num ${isToday ? 'tl-week-day-num-today' : ''}`, text: `${d.date()}` });

            // Emotion badge
            if (data?.emotionScore) {
                const hue = Math.round(((data.emotionScore - 1) / 9) * 120);
                const badge = dayHeader.createEl('span', { cls: 'tl-week-emotion-badge', text: `${data.emotionScore}` });
                badge.style.backgroundColor = `hsl(${hue}, 55%, 60%)`;
            }

            // Task strips
            const taskArea = col.createDiv('tl-week-task-area');
            if (data && data.tasks.length > 0) {
                for (const task of data.tasks) {
                    const strip = taskArea.createDiv(`tl-week-task-strip ${task.done ? 'tl-week-task-strip-done' : ''}`);
                    strip.setText(task.text);
                    // Click to open note
                    strip.addEventListener('click', () => {
                        const f = h.app.vault.getAbstractFileByPath(data.filePath);
                        if (f && f instanceof TFile) h.app.workspace.getLeaf().openFile(f);
                    });
                }
                // Stats at bottom
                const stats = taskArea.createDiv('tl-week-task-stats');
                stats.setText(`${data.completedCount}/${data.taskCount}`);
            } else {
                taskArea.createDiv({ cls: 'tl-week-empty', text: '—' });
            }
        }
    }

    // ---- Task Popover ----

    private showTaskPopover(anchor: HTMLElement, data: CalData, dateStr: string): void {
        const h = this.host;
        // Remove existing popover
        document.querySelectorAll('.tl-cal-popover').forEach(el => el.remove());

        const popover = document.createElement('div');
        popover.className = 'tl-cal-popover';

        const popHeader = popover.createDiv('tl-cal-popover-header');
        popHeader.createEl('span', { text: `📋 ${dateStr.substring(5)}` });
        const closeBtn = popHeader.createEl('button', { cls: 'tl-cal-popover-close', text: '✕' });
        closeBtn.addEventListener('click', () => popover.remove());

        if (data.emotionScore) {
            popHeader.createEl('span', { cls: 'tl-cal-popover-emotion', text: `💭 ${data.emotionScore}/10` });
        }

        const popBody = popover.createDiv('tl-cal-popover-body');
        for (const task of data.tasks) {
            const row = popBody.createDiv(`tl-cal-popover-task ${task.done ? 'tl-cal-popover-task-done' : ''}`);
            row.createEl('span', { text: task.done ? '✓' : '○', cls: 'tl-cal-popover-check' });
            row.createEl('span', { text: task.text });

            // Click to toggle task
            row.addEventListener('click', async () => {
                const f = h.app.vault.getAbstractFileByPath(data.filePath);
                if (f && f instanceof TFile) {
                    const content = await h.app.vault.read(f);
                    const oldMark = task.done ? '- [x] ' : '- [ ] ';
                    const newMark = task.done ? '- [ ] ' : '- [x] ';
                    const newContent = content.replace(oldMark + task.text, newMark + task.text);
                    await h.app.vault.modify(f, newContent);
                    task.done = !task.done;
                    row.toggleClass('tl-cal-popover-task-done', task.done);
                    row.querySelector('.tl-cal-popover-check')!.textContent = task.done ? '✓' : '○';
                }
            });
        }

        if (data.tasks.length === 0) {
            popBody.createDiv({ cls: 'tl-cal-popover-empty', text: '暂无任务' });
        }

        // Open note button
        const openBtn = popover.createDiv('tl-cal-popover-open');
        openBtn.setText('打开日记 →');
        openBtn.addEventListener('click', () => {
            const f = h.app.vault.getAbstractFileByPath(data.filePath);
            if (f && f instanceof TFile) h.app.workspace.getLeaf().openFile(f);
            popover.remove();
        });

        anchor.appendChild(popover);

        // Dismiss on outside click
        const dismiss = (ev: MouseEvent) => {
            if (!popover.contains(ev.target as Node)) {
                popover.remove();
                document.removeEventListener('click', dismiss);
            }
        };
        setTimeout(() => document.addEventListener('click', dismiss), 50);
    }

    // --- Dashboard section ---

    private async renderReviewDashboard(panel: HTMLElement): Promise<void> {
        const h = this.host;

        // Dashboard cards rendered as individual pyramid layers

        // Gather week data
        const folder = h.plugin.settings.dailyFolder;
        const weekStart = moment().startOf('isoWeek');
        let totalTasks = 0, completedTasks = 0;
        const days: { date: string; emotionScore: number | null }[] = [];

        for (let i = 0; i < 7; i++) {
            const d = moment(weekStart).add(i, 'days');
            const dateStr = d.format('YYYY-MM-DD');
            const path = `${folder}/${dateStr}.md`;
            const file = h.app.vault.getAbstractFileByPath(path);
            let emotionScore: number | null = null;

            if (file && file instanceof TFile) {
                try {
                    const content = await h.app.vault.read(file);
                    emotionScore = h.parseNoteScores(content);
                    const allT = content.match(/^- \[[ x]\] /gm);
                    const doneT = content.match(/^- \[x\] /gm);
                    totalTasks += allT ? allT.length : 0;
                    completedTasks += doneT ? doneT.length : 0;
                } catch { /* skip */ }
            }
            days.push({ date: dateStr, emotionScore });
        }

        // Card 1: Progress
        const progressCard = panel.createDiv('tl-pyramid-layer tl-dash-card tl-dash-card-progress');
        const progressHeader = progressCard.createDiv('tl-pyramid-layer-header');
        progressHeader.createEl('span', { cls: 'tl-pyramid-layer-icon', text: '📋' });
        progressHeader.createEl('span', { cls: 'tl-pyramid-layer-title', text: '本周进度' });
        const progressBody = progressCard.createDiv('tl-dash-card-body');
        const pct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
        const pInfo = progressBody.createDiv('tl-dash-progress-info');
        pInfo.createEl('span', { cls: 'tl-dash-progress-number', text: `${completedTasks}/${totalTasks}` });
        pInfo.createEl('span', { cls: 'tl-dash-progress-pct', text: `${pct}%` });
        const barOuter = progressBody.createDiv('tl-dash-progress-bar-outer');
        const barInner = barOuter.createDiv('tl-dash-progress-bar-inner');
        barInner.style.width = `${pct}%`;

        // Card 2: Emotion trend
        const emotionCard = panel.createDiv('tl-pyramid-layer tl-dash-card tl-dash-card-emotion');
        const emotionHeader = emotionCard.createDiv('tl-pyramid-layer-header');
        emotionHeader.createEl('span', { cls: 'tl-pyramid-layer-icon', text: '💭' });
        emotionHeader.createEl('span', { cls: 'tl-pyramid-layer-title', text: '本周情绪' });
        const emotionBody = emotionCard.createDiv('tl-dash-card-body');
        const chart = emotionBody.createDiv('tl-dash-chart');
        const dayLabels = ['一', '二', '三', '四', '五', '六', '日'];
        const today = moment();

        for (let i = 0; i < 7; i++) {
            const dayStart = moment(today).startOf('isoWeek').add(i, 'days');
            const dayData = days.find(dd => dd.date === dayStart.format('YYYY-MM-DD'));
            const barCol = chart.createDiv('tl-dash-chart-col');
            const score = dayData?.emotionScore;

            const bWrap = barCol.createDiv('tl-dash-chart-bar-wrap');
            if (score) {
                const barH = (score / 10) * 100;
                const bar = bWrap.createDiv('tl-dash-chart-bar');
                bar.style.height = `${barH}%`;
                const hue = Math.round(((score - 1) / 9) * 120);
                bar.style.backgroundColor = `hsl(${hue}, 55%, 60%)`;
                bWrap.createEl('span', { cls: 'tl-dash-chart-score', text: `${score}` });
            }

            barCol.createEl('span', {
                cls: `tl-dash-chart-label ${dayStart.isSame(today, 'day') ? 'tl-dash-chart-label-today' : ''}`,
                text: dayLabels[i],
            });
        }

        // Card 3: Principle + Pattern (combined)
        const insightCard = panel.createDiv('tl-pyramid-layer tl-dash-card tl-dash-card-insight');
        const insightHeader = insightCard.createDiv('tl-pyramid-layer-header');
        insightHeader.createEl('span', { cls: 'tl-pyramid-layer-icon', text: '💡' });
        insightHeader.createEl('span', { cls: 'tl-pyramid-layer-title', text: '洞察' });
        const insightBody = insightCard.createDiv('tl-dash-card-body');

        // Principle section
        let principle: string | null = null;
        const pPath = `${h.plugin.settings.archiveFolder}/principles.md`;
        const pFile = h.app.vault.getAbstractFileByPath(pPath);
        if (pFile && pFile instanceof TFile) {
            try {
                const content = await h.app.vault.read(pFile);
                const lines = content.split('\n').filter(l => l.startsWith('- ')).map(l => l.substring(2).trim());
                if (lines.length) principle = lines[Math.floor(Math.random() * lines.length)];
            } catch { /* skip */ }
        }
        insightBody.createEl('blockquote', { cls: 'tl-dash-quote', text: principle || '尚无原则数据' });

        // Pattern section
        let pattern: string | null = null;
        const ptPath = `${h.plugin.settings.archiveFolder}/patterns.md`;
        const ptFile = h.app.vault.getAbstractFileByPath(ptPath);
        if (ptFile && ptFile instanceof TFile) {
            try {
                const content = await h.app.vault.read(ptFile);
                const lines = content.split('\n').filter(l => l.startsWith('- ')).map(l => l.substring(2).trim());
                if (lines.length) pattern = lines[lines.length - 1];
            } catch { /* skip */ }
        }
        if (pattern) {
            insightBody.createEl('p', { cls: 'tl-dash-pattern', text: `🔄 ${pattern}` });
        }

        // Card 4: Quick links
        const linksCard = panel.createDiv('tl-pyramid-layer tl-dash-card tl-dash-card-links');
        const linksHeader = linksCard.createDiv('tl-pyramid-layer-header');
        linksHeader.createEl('span', { cls: 'tl-pyramid-layer-icon', text: '🚀' });
        linksHeader.createEl('span', { cls: 'tl-pyramid-layer-title', text: '快速入口' });
        const linkGrid = linksCard.createDiv('tl-dash-link-grid');

        const makeLink = (icon: string, label: string, onClick: () => void) => {
            const link = linkGrid.createDiv('tl-dash-link');
            link.createEl('span', { cls: 'tl-dash-link-icon', text: icon });
            link.createEl('span', { cls: 'tl-dash-link-label', text: label });
            link.addEventListener('click', onClick);
        };

        makeLink('📝', '今日日记', async () => {
            const f = await h.plugin.vaultManager.getOrCreateDailyNote();
            h.app.workspace.getLeaf().openFile(f);
        });
        makeLink('📅', '周计划', async () => {
            try {
                const ed = h.plugin.vaultManager.getEffectiveDate();
                const tmpl = h.plugin.templateManager.getWeeklyPlanTemplate(`W${ed.format('ww')}`, ed.format('YYYY-MM'));
                const f = await h.plugin.vaultManager.getOrCreateWeeklyPlan(undefined, tmpl);
                h.app.workspace.getLeaf().openFile(f);
            } catch { /* skip */ }
        });
        makeLink('📆', '月计划', async () => {
            try {
                const ed = h.plugin.vaultManager.getEffectiveDate();
                const tmpl = h.plugin.templateManager.getMonthlyPlanTemplate(ed.format('YYYY-MM'));
                const f = await h.plugin.vaultManager.getOrCreateMonthlyPlan(undefined, tmpl);
                h.app.workspace.getLeaf().openFile(f);
            } catch { /* skip */ }
        });
    }
}
