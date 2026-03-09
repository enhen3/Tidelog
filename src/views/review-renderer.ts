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

            // Premium split-ring SVG with gradients and glow
            const hasPlan = data?.hasPlan ?? false;
            const hasReview = data?.hasReview ?? false;
            const hasData = !!data;

            const svgNS = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(svgNS, 'svg');
            svg.setAttribute('width', '36');
            svg.setAttribute('height', '36');
            svg.setAttribute('viewBox', '0 0 36 36');
            svg.setAttribute('class', 'tl-cal-ring-svg');

            const cx = 18, cy = 18, r = 14;
            const fullC = 2 * Math.PI * r; // ~87.96
            const arcLen = fullC * 174 / 360; // 174° each half (3° gap on each junction)
            const gapLen = fullC - arcLen;
            const uid = `cr${d}`;

            // Define gradients + glow filter
            const defs = document.createElementNS(svgNS, 'defs');

            // Plan gradient (green light → deep)
            const pg = document.createElementNS(svgNS, 'linearGradient');
            pg.setAttribute('id', `${uid}pg`);
            pg.setAttribute('x1', '0'); pg.setAttribute('y1', '0');
            pg.setAttribute('x2', '0'); pg.setAttribute('y2', '1');
            const pgs1 = document.createElementNS(svgNS, 'stop');
            pgs1.setAttribute('offset', '0%'); pgs1.setAttribute('stop-color', '#6EE7B7');
            const pgs2 = document.createElementNS(svgNS, 'stop');
            pgs2.setAttribute('offset', '100%'); pgs2.setAttribute('stop-color', '#059669');
            pg.appendChild(pgs1); pg.appendChild(pgs2); defs.appendChild(pg);

            // Review gradient (blue light → deep)
            const rg = document.createElementNS(svgNS, 'linearGradient');
            rg.setAttribute('id', `${uid}rg`);
            rg.setAttribute('x1', '0'); rg.setAttribute('y1', '1');
            rg.setAttribute('x2', '0'); rg.setAttribute('y2', '0');
            const rgs1 = document.createElementNS(svgNS, 'stop');
            rgs1.setAttribute('offset', '0%'); rgs1.setAttribute('stop-color', '#93C5FD');
            const rgs2 = document.createElementNS(svgNS, 'stop');
            rgs2.setAttribute('offset', '100%'); rgs2.setAttribute('stop-color', '#2563EB');
            rg.appendChild(rgs1); rg.appendChild(rgs2); defs.appendChild(rg);

            // Glow filter
            const gf = document.createElementNS(svgNS, 'filter');
            gf.setAttribute('id', `${uid}gl`);
            gf.setAttribute('x', '-30%'); gf.setAttribute('y', '-30%');
            gf.setAttribute('width', '160%'); gf.setAttribute('height', '160%');
            const gb = document.createElementNS(svgNS, 'feGaussianBlur');
            gb.setAttribute('stdDeviation', '1.5'); gb.setAttribute('result', 'g');
            gf.appendChild(gb);
            const gm = document.createElementNS(svgNS, 'feMerge');
            const gm1 = document.createElementNS(svgNS, 'feMergeNode');
            gm1.setAttribute('in', 'g');
            const gm2 = document.createElementNS(svgNS, 'feMergeNode');
            gm2.setAttribute('in', 'SourceGraphic');
            gm.appendChild(gm1); gm.appendChild(gm2);
            gf.appendChild(gm); defs.appendChild(gf);

            svg.appendChild(defs);

            // Mood fill (center soft glow)
            if (data?.emotionScore) {
                const hue = Math.round(((data.emotionScore - 1) / 9) * 120);
                const moodCircle = document.createElementNS(svgNS, 'circle');
                moodCircle.setAttribute('cx', `${cx}`);
                moodCircle.setAttribute('cy', `${cy}`);
                moodCircle.setAttribute('r', '10');
                moodCircle.setAttribute('fill', `hsla(${hue}, 55%, 72%, 0.3)`);
                svg.appendChild(moodCircle);
            }

            if (hasData) {
                // Background track (subtle depth ring)
                const track = document.createElementNS(svgNS, 'circle');
                track.setAttribute('cx', `${cx}`);
                track.setAttribute('cy', `${cy}`);
                track.setAttribute('r', `${r}`);
                track.setAttribute('fill', 'none');
                track.setAttribute('stroke', 'var(--background-modifier-border)');
                track.setAttribute('stroke-width', '3.5');
                track.setAttribute('opacity', '0.4');
                svg.appendChild(track);

                // Left half (Plan) — rotated to start just past 6 o'clock
                const planArc = document.createElementNS(svgNS, 'circle');
                planArc.setAttribute('cx', `${cx}`);
                planArc.setAttribute('cy', `${cy}`);
                planArc.setAttribute('r', `${r}`);
                planArc.setAttribute('fill', 'none');
                planArc.setAttribute('stroke', hasPlan ? `url(#${uid}pg)` : 'var(--background-modifier-border)');
                planArc.setAttribute('stroke-width', '3.5');
                planArc.setAttribute('stroke-linecap', 'round');
                planArc.setAttribute('stroke-dasharray', `${arcLen} ${gapLen}`);
                planArc.setAttribute('transform', `rotate(93 ${cx} ${cy})`);
                if (hasPlan) planArc.setAttribute('filter', `url(#${uid}gl)`);
                if (!hasPlan) planArc.setAttribute('opacity', '0.5');
                svg.appendChild(planArc);

                // Right half (Review) — rotated to start just past 12 o'clock
                const revArc = document.createElementNS(svgNS, 'circle');
                revArc.setAttribute('cx', `${cx}`);
                revArc.setAttribute('cy', `${cy}`);
                revArc.setAttribute('r', `${r}`);
                revArc.setAttribute('fill', 'none');
                revArc.setAttribute('stroke', hasReview ? `url(#${uid}rg)` : 'var(--background-modifier-border)');
                revArc.setAttribute('stroke-width', '3.5');
                revArc.setAttribute('stroke-linecap', 'round');
                revArc.setAttribute('stroke-dasharray', `${arcLen} ${gapLen}`);
                revArc.setAttribute('transform', `rotate(-87 ${cx} ${cy})`);
                if (hasReview) revArc.setAttribute('filter', `url(#${uid}gl)`);
                if (!hasReview) revArc.setAttribute('opacity', '0.5');
                svg.appendChild(revArc);
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

            // Hover to show popover (no click needed)
            if (data?.filePath) {
                cell.addClass('tl-cal-cell-clickable');
                let popoverTimeout: ReturnType<typeof setTimeout> | null = null;

                cell.addEventListener('mouseenter', () => {
                    popoverTimeout = setTimeout(() => {
                        this.showTaskPopover(cell, data, dateStr);
                    }, 200);
                });
                cell.addEventListener('mouseleave', () => {
                    if (popoverTimeout) clearTimeout(popoverTimeout);
                    // Give a small delay so user can move into popover
                    setTimeout(() => {
                        const popover = cell.querySelector('.tl-cal-popover') as HTMLElement;
                        if (popover && !popover.matches(':hover')) {
                            popover.remove();
                        }
                    }, 150);
                });
                // Click to open note directly
                cell.addEventListener('click', () => {
                    const f = h.app.vault.getAbstractFileByPath(data.filePath);
                    if (f && f instanceof TFile) h.app.workspace.getLeaf().openFile(f);
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
        // Remove existing popover
        document.querySelectorAll('.tl-cal-popover').forEach(el => el.remove());

        const popover = document.createElement('div');
        popover.className = 'tl-cal-popover';

        // Header (no close button)
        const popHeader = popover.createDiv('tl-cal-popover-header');
        const dateLabel = dateStr.substring(5);
        const hasPlan = data.hasPlan;
        const hasReview = data.hasReview;
        popHeader.createEl('span', { text: dateLabel });
        if (hasPlan) popHeader.createEl('span', { cls: 'tl-cal-popover-badge tl-cal-popover-badge-plan', text: '计划' });
        if (hasReview) popHeader.createEl('span', { cls: 'tl-cal-popover-badge tl-cal-popover-badge-review', text: '复盘' });
        if (data.emotionScore) popHeader.createEl('span', { cls: 'tl-cal-popover-badge', text: `❤ ${data.emotionScore}` });

        // Tasks
        if (data.tasks.length > 0) {
            const popBody = popover.createDiv('tl-cal-popover-body');
            for (const task of data.tasks.slice(0, 4)) {
                const row = popBody.createDiv(`tl-cal-popover-task ${task.done ? 'tl-cal-popover-task-done' : ''}`);
                row.createEl('span', { text: task.done ? '✓' : '○', cls: 'tl-cal-popover-check' });
                row.createEl('span', { text: task.text });
            }
            if (data.tasks.length > 4) {
                popBody.createEl('span', { cls: 'tl-cal-popover-more', text: `+${data.tasks.length - 4} 更多` });
            }
        } else {
            popover.createDiv({ cls: 'tl-cal-popover-empty', text: '暂无任务' });
        }

        // Keep popover alive when hovering over it
        popover.addEventListener('mouseleave', () => {
            popover.remove();
        });

        anchor.appendChild(popover);
    }

    // --- Dashboard section ---

    private async renderReviewDashboard(panel: HTMLElement): Promise<void> {
        const h = this.host;

        // ---- Daily Insight ----
        const today = moment();
        const todayPath = `${h.plugin.settings.dailyFolder}/${today.format('YYYY-MM-DD')}.md`;
        const todayFile = h.app.vault.getAbstractFileByPath(todayPath);
        if (todayFile && todayFile instanceof TFile) {
            try {
                const content = await h.app.vault.read(todayFile);
                // Extract review summary if exists
                const reviewIdx = content.indexOf('## 晚间复盘');
                if (reviewIdx > 0) {
                    let reviewText = content.substring(reviewIdx + '## 晚间复盘'.length);
                    const endIdx = reviewText.indexOf('\n---');
                    if (endIdx > 0) reviewText = reviewText.substring(0, endIdx);
                    const lines = reviewText.split('\n').map((l: string) => l.trim()).filter((l: string) => l && !l.startsWith('#')).slice(0, 2);
                    if (lines.length > 0) {
                        const dailyCard = panel.createDiv('tl-pyramid-layer tl-dash-card');
                        const dHeader = dailyCard.createDiv('tl-pyramid-layer-header');
                        dHeader.createEl('span', { cls: 'tl-pyramid-layer-icon', text: '📖' });
                        dHeader.createEl('span', { cls: 'tl-pyramid-layer-title', text: '今日复盘' });
                        const dBody = dailyCard.createDiv('tl-dash-card-body');
                        for (const line of lines) {
                            dBody.createEl('p', { cls: 'tl-dash-insight-line', text: line.replace(/^[-*]\s*/, '') });
                        }
                    }
                }
            } catch { /* skip */ }
        }

        // ---- Weekly Insight ----
        const weekNum = today.isoWeek();
        const weekYear = today.isoWeekYear();
        const weekPatterns = [
            `${weekYear}-W${weekNum}-周报.md`,
            `${weekYear}-W${String(weekNum).padStart(2, '0')}-周报.md`,
        ];
        for (const wp of weekPatterns) {
            const wPath = `${h.plugin.settings.archiveFolder}/Insights/${wp}`;
            const wFile = h.app.vault.getAbstractFileByPath(wPath);
            if (wFile && wFile instanceof TFile) {
                try {
                    const content = await h.app.vault.read(wFile);
                    const weekCard = panel.createDiv('tl-pyramid-layer tl-dash-card');
                    const wHeader = weekCard.createDiv('tl-pyramid-layer-header');
                    wHeader.createEl('span', { cls: 'tl-pyramid-layer-icon', text: '📊' });
                    wHeader.createEl('span', { cls: 'tl-pyramid-layer-title', text: `W${weekNum} 周报洞察` });
                    const wBody = weekCard.createDiv('tl-dash-card-body');

                    // Extract key sections
                    const sections = ['本周概览', '成功模式', '下周建议'];
                    for (const sec of sections) {
                        const idx = content.indexOf(sec);
                        if (idx < 0) continue;
                        let text = content.substring(idx + sec.length);
                        const nextH = text.indexOf('\n###');
                        if (nextH > 0) text = text.substring(0, nextH);
                        const lines = text.split('\n').map((l: string) => l.trim()).filter((l: string) => l && !l.startsWith('#')).slice(0, 2);
                        if (lines.length > 0) {
                            wBody.createEl('div', { cls: 'tl-dash-insight-label', text: sec });
                            for (const line of lines) {
                                wBody.createEl('p', { cls: 'tl-dash-insight-line', text: line.replace(/^[-*\d.]+\s*/, '') });
                            }
                        }
                    }

                    // Link to full report
                    const link = wBody.createEl('div', { cls: 'tl-dash-insight-link', text: '查看完整周报 →' });
                    link.addEventListener('click', () => {
                        h.app.workspace.getLeaf().openFile(wFile as TFile);
                    });
                } catch { /* skip */ }
                break;
            }
        }

        // ---- Monthly Insight ----
        const monthKey = today.format('YYYY-MM');
        const mPath = `${h.plugin.settings.archiveFolder}/Insights/${monthKey}-月报.md`;
        const mFile = h.app.vault.getAbstractFileByPath(mPath);
        if (mFile && mFile instanceof TFile) {
            try {
                const content = await h.app.vault.read(mFile);
                const monthCard = panel.createDiv('tl-pyramid-layer tl-dash-card');
                const mHeader = monthCard.createDiv('tl-pyramid-layer-header');
                mHeader.createEl('span', { cls: 'tl-pyramid-layer-icon', text: '📅' });
                mHeader.createEl('span', { cls: 'tl-pyramid-layer-title', text: `${monthKey} 月报洞察` });
                const mBody = monthCard.createDiv('tl-dash-card-body');

                const lines = content.split('\n').map((l: string) => l.trim()).filter((l: string) => l && !l.startsWith('#') && !l.startsWith('---')).slice(0, 3);
                for (const line of lines) {
                    mBody.createEl('p', { cls: 'tl-dash-insight-line', text: line.replace(/^[-*\d.]+\s*/, '') });
                }

                const link = mBody.createEl('div', { cls: 'tl-dash-insight-link', text: '查看完整月报 →' });
                link.addEventListener('click', () => {
                    h.app.workspace.getLeaf().openFile(mFile as TFile);
                });
            } catch { /* skip */ }
        }

        // ---- Principles & Patterns ----
        let principle: string | null = null;
        const pPath = `${h.plugin.settings.archiveFolder}/principles.md`;
        const pFile = h.app.vault.getAbstractFileByPath(pPath);
        if (pFile && pFile instanceof TFile) {
            try {
                const content = await h.app.vault.read(pFile);
                const lines = content.split('\n').filter((l: string) => l.startsWith('- ')).map((l: string) => l.substring(2).trim());
                if (lines.length) principle = lines[Math.floor(Math.random() * lines.length)];
            } catch { /* skip */ }
        }

        let pattern: string | null = null;
        const ptPath = `${h.plugin.settings.archiveFolder}/patterns.md`;
        const ptFile = h.app.vault.getAbstractFileByPath(ptPath);
        if (ptFile && ptFile instanceof TFile) {
            try {
                const content = await h.app.vault.read(ptFile);
                const lines = content.split('\n').filter((l: string) => l.startsWith('- ')).map((l: string) => l.substring(2).trim());
                if (lines.length) pattern = lines[lines.length - 1];
            } catch { /* skip */ }
        }

        if (principle || pattern) {
            const ppCard = panel.createDiv('tl-pyramid-layer tl-dash-card');
            const ppHeader = ppCard.createDiv('tl-pyramid-layer-header');
            ppHeader.createEl('span', { cls: 'tl-pyramid-layer-icon', text: '💡' });
            ppHeader.createEl('span', { cls: 'tl-pyramid-layer-title', text: '原则与模式' });
            const ppBody = ppCard.createDiv('tl-dash-card-body');
            if (principle) ppBody.createEl('blockquote', { cls: 'tl-dash-quote', text: principle });
            if (pattern) ppBody.createEl('p', { cls: 'tl-dash-pattern', text: `🔄 ${pattern}` });
        }
    }
}
