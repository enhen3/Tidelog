/**
 * Review Renderer - Renders the Review tab (calendar + dashboard)
 * Extracted from chat-view.ts for maintainability.
 */

import { TFile, moment, Platform } from 'obsidian';
import type TideLogPlugin from '../main';
import type { App } from 'obsidian';
import { t, getLanguage } from '../i18n';

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
    startChatWithContext(context: string): void;
}

export class ReviewRenderer {
    constructor(private host: ReviewHost) { }

    async render(panel: HTMLElement): Promise<void> {
        panel.addClass('tl-review-scroll');
        if (Platform.isMobile) panel.addClass('is-mobile');
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
                hasPlan: (content.includes('## 计划') || content.includes('## Plan')) && tasks.length > 0,
                hasReview: content.includes('## 复盘') || content.includes('## Review'),
            };
        } catch { return null; }
    }

    // --- Calendar section ---

    private async renderReviewCalendar(panel: HTMLElement): Promise<void> {
        const h = this.host;
        const layer = panel.createDiv('tl-pyramid-layer tl-pyramid-review-cal');

        // Header with nav only (no mode toggle — always month view)
        const header = layer.createDiv('tl-pyramid-layer-header tl-cal-header');
        const prevBtn = header.createEl('button', { cls: 'tl-cal-nav-btn', text: '‹' });
        const titleEl = header.createEl('span', { cls: 'tl-cal-title' });
        const nextBtn = header.createEl('button', { cls: 'tl-cal-nav-btn', text: '›' });

        titleEl.setText(getLanguage() === 'en' ? h.calendarMonth.format('MMMM YYYY') : h.calendarMonth.format('YYYY年 M月'));
        prevBtn.addEventListener('click', () => { h.calendarMonth.subtract(1, 'month'); h.invalidateTabCache('review'); h.switchTab('review'); });
        nextBtn.addEventListener('click', () => { h.calendarMonth.add(1, 'month'); h.invalidateTabCache('review'); h.switchTab('review'); });
        await this.renderMonthView(layer);
    }

    // ---- Month View ----

    private async renderMonthView(layer: HTMLElement): Promise<void> {
        const h = this.host;
        const body = layer.createDiv('tl-pyramid-review-cal-body');

        // Weekday row
        const weekdays = t('cal.weekdays').split(',');
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

            // Premium interlocking ring with gradient blend at junctions
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
            const fullC = 2 * Math.PI * r;
            const uid = `cr${d}`;

            // Define gradient definitions
            const defs = document.createElementNS(svgNS, 'defs');

            // Plan arc gradient: pure teal depth (light → deep)
            const pg = document.createElementNS(svgNS, 'linearGradient');
            pg.setAttribute('id', `${uid}pg`);
            pg.setAttribute('gradientUnits', 'userSpaceOnUse');
            pg.setAttribute('x1', '4'); pg.setAttribute('y1', '18');
            pg.setAttribute('x2', '32'); pg.setAttribute('y2', '18');
            for (const [offset, color] of [['0%', '#5ABECC'], ['50%', '#3B8EA5'], ['100%', '#2D7088']] as const) {
                const stop = document.createElementNS(svgNS, 'stop');
                stop.setAttribute('offset', offset);
                stop.setAttribute('stop-color', color);
                pg.appendChild(stop);
            }
            defs.appendChild(pg);

            // Review arc gradient: pure warm gold depth (light → deep)
            const rg = document.createElementNS(svgNS, 'linearGradient');
            rg.setAttribute('id', `${uid}rg`);
            rg.setAttribute('gradientUnits', 'userSpaceOnUse');
            rg.setAttribute('x1', '32'); rg.setAttribute('y1', '18');
            rg.setAttribute('x2', '4'); rg.setAttribute('y2', '18');
            for (const [offset, color] of [['0%', '#E8D5A0'], ['50%', '#D4B978'], ['100%', '#B89A58']] as const) {
                const stop = document.createElementNS(svgNS, 'stop');
                stop.setAttribute('offset', offset);
                stop.setAttribute('stop-color', color);
                rg.appendChild(stop);
            }
            defs.appendChild(rg);

            // Soft glow filter for active arcs
            const gf = document.createElementNS(svgNS, 'filter');
            gf.setAttribute('id', `${uid}gl`);
            gf.setAttribute('x', '-40%'); gf.setAttribute('y', '-40%');
            gf.setAttribute('width', '180%'); gf.setAttribute('height', '180%');
            const gb = document.createElementNS(svgNS, 'feGaussianBlur');
            gb.setAttribute('stdDeviation', '1.8'); gb.setAttribute('result', 'g');
            gf.appendChild(gb);
            const gm = document.createElementNS(svgNS, 'feMerge');
            const gm1 = document.createElementNS(svgNS, 'feMergeNode');
            gm1.setAttribute('in', 'g');
            const gm2 = document.createElementNS(svgNS, 'feMergeNode');
            gm2.setAttribute('in', 'SourceGraphic');
            gm.appendChild(gm1); gm.appendChild(gm2);
            gf.appendChild(gm); defs.appendChild(gf);

            svg.appendChild(defs);

            // Mood fill (center radial glow)
            if (data?.emotionScore) {
                const hue = Math.round(((data.emotionScore - 1) / 9) * 120);
                const moodCircle = document.createElementNS(svgNS, 'circle');
                moodCircle.setAttribute('cx', `${cx}`);
                moodCircle.setAttribute('cy', `${cy}`);
                moodCircle.setAttribute('r', '9');
                moodCircle.setAttribute('fill', `hsla(${hue}, 55%, 72%, 0.25)`);
                svg.appendChild(moodCircle);
            }

            if (hasData) {
                // Background track
                const track = document.createElementNS(svgNS, 'circle');
                track.setAttribute('cx', `${cx}`);
                track.setAttribute('cy', `${cy}`);
                track.setAttribute('r', `${r}`);
                track.setAttribute('fill', 'none');
                track.setAttribute('stroke', 'var(--background-modifier-border)');
                track.setAttribute('stroke-width', '3.5');
                track.setAttribute('opacity', '0.25');
                svg.appendChild(track);

                // Interlocking arc params
                // Each half = 175° (5° total gap distributed across 2 junction points)
                const halfArcDeg = 175;
                const halfArcLen = fullC * halfArcDeg / 360;
                const halfGapLen = fullC - halfArcLen;

                const makeArc = (rotateDeg: number, stroke: string, active: boolean) => {
                    const arc = document.createElementNS(svgNS, 'circle');
                    arc.setAttribute('cx', `${cx}`);
                    arc.setAttribute('cy', `${cy}`);
                    arc.setAttribute('r', `${r}`);
                    arc.setAttribute('fill', 'none');
                    arc.setAttribute('stroke', stroke);
                    arc.setAttribute('stroke-width', active ? '3.5' : '2.5');
                    arc.setAttribute('stroke-linecap', 'round');
                    arc.setAttribute('stroke-dasharray', `${halfArcLen} ${halfGapLen}`);
                    arc.setAttribute('transform', `rotate(${rotateDeg} ${cx} ${cy})`);
                    if (active) {
                        arc.setAttribute('filter', `url(#${uid}gl)`);
                        arc.classList.add('tl-cal-ring-arc-active');
                    } else {
                        arc.setAttribute('opacity', '0.3');
                        arc.setAttribute('stroke-dasharray', '3 4');
                    }
                    return arc;
                };

                // Plan half (left side: 9→3 o'clock)
                const planStroke = hasPlan ? `url(#${uid}pg)` : 'var(--background-modifier-border)';
                // Review half (right side: 3→9 o'clock)
                const revStroke = hasReview ? `url(#${uid}rg)` : 'var(--background-modifier-border)';

                // Layer 1 (bottom): Review arc
                svg.appendChild(makeArc(-2.5, revStroke, hasReview));
                // Layer 2 (top): Plan arc — overlaps review at top junction
                svg.appendChild(makeArc(177.5, planStroke, hasPlan));
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

                if (Platform.isMobile) {
                    // Mobile: tap to toggle popover, second tap to open note
                    cell.addEventListener('click', (e) => {
                        const existing = cell.querySelector('.tl-cal-popover');
                        if (existing) {
                            existing.remove();
                            // Open note on second tap
                            const f = h.app.vault.getAbstractFileByPath(data.filePath);
                            if (f instanceof TFile) void h.app.workspace.getLeaf().openFile(f);
                            return;
                        }
                        // Remove any other popovers
                        document.querySelectorAll('.tl-cal-popover').forEach(el => el.remove());
                        e.stopPropagation();
                        this.showTaskPopover(cell, data, dateStr);
                    });
                    // Dismiss popover on outside tap
                    document.addEventListener('click', (ev) => {
                        if (!cell.contains(ev.target as Node)) {
                            cell.querySelector('.tl-cal-popover')?.remove();
                        }
                    });
                } else {
                    // Desktop: hover to show popover
                    let popoverTimeout: ReturnType<typeof setTimeout> | null = null;
                    cell.addEventListener('mouseenter', () => {
                        popoverTimeout = setTimeout(() => {
                            this.showTaskPopover(cell, data, dateStr);
                        }, 200);
                    });
                    cell.addEventListener('mouseleave', () => {
                        if (popoverTimeout) clearTimeout(popoverTimeout);
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
                        if (f instanceof TFile) void h.app.workspace.getLeaf().openFile(f);
                    });
                }
            }
        }
    }

    // ---- Week View ----

    private async renderWeekView(layer: HTMLElement, weekStart: moment.Moment): Promise<void> {
        const h = this.host;
        const todayStr = moment().format('YYYY-MM-DD');
        const weekdays = getLanguage() === 'en'
            ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
            : ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

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
                const badge = dayHeader.createEl('span', { cls: 'tl-week-emotion-badge tl-dynamic-bg', text: `${data.emotionScore}` });
                badge.style.setProperty('--tl-bg', `hsl(${hue}, 55%, 60%)`);
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
                        if (f instanceof TFile) void h.app.workspace.getLeaf().openFile(f);
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
        if (hasPlan) popHeader.createEl('span', { cls: 'tl-cal-popover-badge tl-cal-popover-badge-plan', text: t('review.plan') });
        if (hasReview) popHeader.createEl('span', { cls: 'tl-cal-popover-badge tl-cal-popover-badge-review', text: t('review.review') });
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
                popBody.createEl('span', { cls: 'tl-cal-popover-more', text: t('review.more', String(data.tasks.length - 4)) });
            }
        } else {
            popover.createDiv({ cls: 'tl-cal-popover-empty', text: t('kanban.noTasks') });
        }

        // Keep popover alive when hovering over it
        popover.addEventListener('mouseleave', () => {
            popover.remove();
        });

        anchor.appendChild(popover);

        // Clamp popover within the scroll container so it doesn't clip at edges
        requestAnimationFrame(() => {
            const scrollParent = anchor.closest('.tl-review-scroll') || anchor.closest('.tl-sidebar');
            if (!scrollParent) return;
            const parentRect = scrollParent.getBoundingClientRect();
            const popRect = popover.getBoundingClientRect();

            // Top clipping: flip popover below the cell
            if (popRect.top < parentRect.top) {
                popover.setCssProps({ '--tl-pop-bottom': 'auto', '--tl-pop-top': '100%' });
            }

            // Left/right clipping
            const popRect2 = popover.getBoundingClientRect();
            if (popRect2.left < parentRect.left + 4) {
                const shift = parentRect.left + 4 - popRect2.left;
                popover.setCssProps({ '--tl-pop-left': `calc(50% + ${shift}px)` });
            } else if (popRect2.right > parentRect.right - 4) {
                const shift = popRect2.right - parentRect.right + 4;
                popover.setCssProps({ '--tl-pop-left': `calc(50% - ${shift}px)` });
            }
        });
    }

    // --- Dashboard section ---

    private async renderReviewDashboard(panel: HTMLElement): Promise<void> {
        const h = this.host;
        const calMonth = h.calendarMonth; // Use the selected calendar month, not today

        // Helper: strip markdown formatting for clean display
        const stripMd = (s: string): string =>
            s.replace(/\*\*(.*?)\*\*/g, '$1')   // bold
                .replace(/\*(.*?)\*/g, '$1')        // italic
                .replace(/^>\s*/gm, '')             // blockquote
                .replace(/^[-*]\s*/gm, '')          // list bullets
                .replace(/^\d+\.\s*/gm, '')         // numbered list
                .replace(/`(.*?)`/g, '$1')          // inline code
                .trim();

        // ---- Monthly Insight only (no weekly on dashboard) ----
        const monthKey = calMonth.format('YYYY-MM');
        const mPath = `${h.plugin.settings.archiveFolder}/Insights/${t('insight.monthlyFileName', monthKey)}`;
        const mFile = h.app.vault.getAbstractFileByPath(mPath);

        const monthCard = panel.createDiv('tl-pyramid-layer tl-dash-card');
        const mHeader = monthCard.createDiv('tl-pyramid-layer-header');
        mHeader.createEl('span', { cls: 'tl-pyramid-layer-icon', text: '📅' });
        mHeader.createEl('span', { cls: 'tl-pyramid-layer-title', text: t('review.monthlyInsight', monthKey) });
        const mBody = monthCard.createDiv('tl-dash-card-body');

        if (mFile && mFile instanceof TFile) {
            try {
                const content = await h.app.vault.read(mFile);
                const summaryIdx = content.indexOf('仪表盘摘要') !== -1 ? content.indexOf('仪表盘摘要') : content.indexOf('Dashboard Summary');
                if (summaryIdx >= 0) {
                    const label = content.indexOf('仪表盘摘要') !== -1 ? '仪表盘摘要' : 'Dashboard Summary';
                    let summaryText = content.substring(summaryIdx + label.length);
                    const nextH = summaryText.search(/\n#{2,3}\s/);
                    if (nextH > 0) summaryText = summaryText.substring(0, nextH);
                    const sLines = summaryText.split('\n')
                        .map((l: string) => stripMd(l))
                        .filter((l: string) => l.length > 0);
                    for (const line of sLines) {
                        mBody.createEl('p', { cls: 'tl-dash-insight-line', text: line });
                    }
                } else {
                    const fLines = content.split('\n')
                        .map((l: string) => stripMd(l))
                        .filter((l: string) => l.length > 4 && !l.startsWith('#') && !l.match(/^(生成于|报告结构|Generated|Report structure)/))
                        .slice(0, 3);
                    for (const line of fLines) {
                        mBody.createEl('p', { cls: 'tl-dash-insight-line', text: line });
                    }
                }
                const link = mBody.createEl('div', { cls: 'tl-dash-insight-link', text: t('review.viewFullReport') });
                link.addEventListener('click', () => {
                    if (mFile instanceof TFile) void h.app.workspace.getLeaf().openFile(mFile);
                });

                // Chat about monthly insight button
                const insightText = Array.from(mBody.querySelectorAll('.tl-dash-insight-line')).map(el => el.textContent).join('\n');
                const chatBtn = mBody.createEl('button', {
                    cls: 'tl-dash-chat-btn',
                    text: t('review.chatInsight'),
                });
                chatBtn.addEventListener('click', () => {
                    h.startChatWithContext(t('review.insightContext', monthKey, insightText));
                });
            } catch { /* skip */ }
        } else {
            mBody.createEl('p', { cls: 'tl-dash-insight-line tl-dash-empty-hint', text: t('review.noInsight') });
            const genBtn = mBody.createEl('button', {
                cls: 'tl-dash-generate-btn',
                text: t('review.generateInsight'),
            });
            genBtn.addEventListener('click', () => {
                void (async () => {
                genBtn.setText(t('review.generating'));
                genBtn.disabled = true;
                genBtn.addClass('tl-dash-generate-btn-loading');
                // Animated dots
                const baseText = t('review.generating').replace(/\.+$/, '');
                let dotCount = 0;
                const dotsInterval = setInterval(() => {
                    dotCount = (dotCount + 1) % 4;
                    genBtn.setText(baseText + '.'.repeat(dotCount));
                }, 500);
                try {
                    await h.plugin.insightService.generateMonthlyInsight(
                        () => {},
                        () => {
                            clearInterval(dotsInterval);
                            h.invalidateTabCache('review');
                            h.switchTab('review');
                        },
                        moment(calMonth),
                    );
                } catch {
                    clearInterval(dotsInterval);
                    genBtn.setText(t('review.generateFailed'));
                    genBtn.disabled = false;
                    genBtn.removeClass('tl-dash-generate-btn-loading');
                }
                })();
            });
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
            ppHeader.createEl('span', { cls: 'tl-pyramid-layer-title', text: t('review.principlesAndPatterns') });
            const ppBody = ppCard.createDiv('tl-dash-card-body');
            if (principle) ppBody.createEl('blockquote', { cls: 'tl-dash-quote', text: principle });
            if (pattern) ppBody.createEl('p', { cls: 'tl-dash-pattern', text: `🔄 ${pattern}` });
        }
    }
}
