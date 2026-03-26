/**
 * Review Renderer - Renders the Review tab (calendar + dashboard)
 * Extracted from chat-view.ts for maintainability.
 */
import { TFile, moment } from 'obsidian';
import { t, getLanguage } from '../i18n';
export class ReviewRenderer {
    constructor(host) {
        this.host = host;
    }
    async render(panel) {
        panel.addClass('tl-review-scroll');
        await this.renderReviewCalendar(panel);
        await this.renderReviewDashboard(panel);
    }
    // ---- Shared data loader ----
    async loadDayData(dateStr) {
        const h = this.host;
        const path = `${h.plugin.settings.dailyFolder}/${dateStr}.md`;
        const file = h.app.vault.getAbstractFileByPath(path);
        if (!file || !(file instanceof TFile))
            return null;
        try {
            const content = await h.app.vault.read(file);
            const emotionScore = h.parseNoteScores(content);
            let status = 'todo';
            if (content.startsWith('---')) {
                const end = content.indexOf('---', 3);
                if (end > 0) {
                    const sm = content.substring(4, end).match(/status:\s*(\S+)/);
                    if (sm)
                        status = sm[1];
                }
            }
            const tasks = [];
            for (const line of content.split('\n')) {
                const m = line.match(/^- \[([ x])\] (.+)$/);
                if (m)
                    tasks.push({ done: m[1] === 'x', text: m[2].trim() });
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
        }
        catch {
            return null;
        }
    }
    // --- Calendar section ---
    async renderReviewCalendar(panel) {
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
    async renderMonthView(layer) {
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
        for (let i = 0; i < startPad; i++)
            grid.createDiv('tl-cal-cell tl-cal-cell-empty');
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
            pg.setAttribute('x1', '4');
            pg.setAttribute('y1', '18');
            pg.setAttribute('x2', '32');
            pg.setAttribute('y2', '18');
            for (const [offset, color] of [['0%', '#5ABECC'], ['50%', '#3B8EA5'], ['100%', '#2D7088']]) {
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
            rg.setAttribute('x1', '32');
            rg.setAttribute('y1', '18');
            rg.setAttribute('x2', '4');
            rg.setAttribute('y2', '18');
            for (const [offset, color] of [['0%', '#E8D5A0'], ['50%', '#D4B978'], ['100%', '#B89A58']]) {
                const stop = document.createElementNS(svgNS, 'stop');
                stop.setAttribute('offset', offset);
                stop.setAttribute('stop-color', color);
                rg.appendChild(stop);
            }
            defs.appendChild(rg);
            // Soft glow filter for active arcs
            const gf = document.createElementNS(svgNS, 'filter');
            gf.setAttribute('id', `${uid}gl`);
            gf.setAttribute('x', '-40%');
            gf.setAttribute('y', '-40%');
            gf.setAttribute('width', '180%');
            gf.setAttribute('height', '180%');
            const gb = document.createElementNS(svgNS, 'feGaussianBlur');
            gb.setAttribute('stdDeviation', '1.8');
            gb.setAttribute('result', 'g');
            gf.appendChild(gb);
            const gm = document.createElementNS(svgNS, 'feMerge');
            const gm1 = document.createElementNS(svgNS, 'feMergeNode');
            gm1.setAttribute('in', 'g');
            const gm2 = document.createElementNS(svgNS, 'feMergeNode');
            gm2.setAttribute('in', 'SourceGraphic');
            gm.appendChild(gm1);
            gm.appendChild(gm2);
            gf.appendChild(gm);
            defs.appendChild(gf);
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
                const makeArc = (rotateDeg, stroke, active) => {
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
                    }
                    else {
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
                let popoverTimeout = null;
                cell.addEventListener('mouseenter', () => {
                    popoverTimeout = setTimeout(() => {
                        this.showTaskPopover(cell, data, dateStr);
                    }, 200);
                });
                cell.addEventListener('mouseleave', () => {
                    if (popoverTimeout)
                        clearTimeout(popoverTimeout);
                    // Give a small delay so user can move into popover
                    setTimeout(() => {
                        const popover = cell.querySelector('.tl-cal-popover');
                        if (popover && !popover.matches(':hover')) {
                            popover.remove();
                        }
                    }, 150);
                });
                // Click to open note directly
                cell.addEventListener('click', () => {
                    const f = h.app.vault.getAbstractFileByPath(data.filePath);
                    if (f instanceof TFile)
                        void h.app.workspace.getLeaf().openFile(f);
                });
            }
        }
    }
    // ---- Week View ----
    async renderWeekView(layer, weekStart) {
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
                        if (f instanceof TFile)
                            void h.app.workspace.getLeaf().openFile(f);
                    });
                }
                // Stats at bottom
                const stats = taskArea.createDiv('tl-week-task-stats');
                stats.setText(`${data.completedCount}/${data.taskCount}`);
            }
            else {
                taskArea.createDiv({ cls: 'tl-week-empty', text: '—' });
            }
        }
    }
    // ---- Task Popover ----
    showTaskPopover(anchor, data, dateStr) {
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
        if (hasPlan)
            popHeader.createEl('span', { cls: 'tl-cal-popover-badge tl-cal-popover-badge-plan', text: t('review.plan') });
        if (hasReview)
            popHeader.createEl('span', { cls: 'tl-cal-popover-badge tl-cal-popover-badge-review', text: t('review.review') });
        if (data.emotionScore)
            popHeader.createEl('span', { cls: 'tl-cal-popover-badge', text: `❤ ${data.emotionScore}` });
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
        }
        else {
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
            if (!scrollParent)
                return;
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
            }
            else if (popRect2.right > parentRect.right - 4) {
                const shift = popRect2.right - parentRect.right + 4;
                popover.setCssProps({ '--tl-pop-left': `calc(50% - ${shift}px)` });
            }
        });
    }
    // --- Dashboard section ---
    async renderReviewDashboard(panel) {
        const h = this.host;
        const calMonth = h.calendarMonth; // Use the selected calendar month, not today
        // Helper: strip markdown formatting for clean display
        const stripMd = (s) => s.replace(/\*\*(.*?)\*\*/g, '$1') // bold
            .replace(/\*(.*?)\*/g, '$1') // italic
            .replace(/^>\s*/gm, '') // blockquote
            .replace(/^[-*]\s*/gm, '') // list bullets
            .replace(/^\d+\.\s*/gm, '') // numbered list
            .replace(/`(.*?)`/g, '$1') // inline code
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
                    if (nextH > 0)
                        summaryText = summaryText.substring(0, nextH);
                    const sLines = summaryText.split('\n')
                        .map((l) => stripMd(l))
                        .filter((l) => l.length > 0);
                    for (const line of sLines) {
                        mBody.createEl('p', { cls: 'tl-dash-insight-line', text: line });
                    }
                }
                else {
                    const fLines = content.split('\n')
                        .map((l) => stripMd(l))
                        .filter((l) => l.length > 4 && !l.startsWith('#') && !l.match(/^(生成于|报告结构|Generated|Report structure)/))
                        .slice(0, 3);
                    for (const line of fLines) {
                        mBody.createEl('p', { cls: 'tl-dash-insight-line', text: line });
                    }
                }
                const link = mBody.createEl('div', { cls: 'tl-dash-insight-link', text: t('review.viewFullReport') });
                link.addEventListener('click', () => {
                    if (mFile instanceof TFile)
                        void h.app.workspace.getLeaf().openFile(mFile);
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
            }
            catch { /* skip */ }
        }
        else {
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
                        await h.plugin.insightService.generateMonthlyInsight(() => { }, () => {
                            clearInterval(dotsInterval);
                            h.invalidateTabCache('review');
                            h.switchTab('review');
                        }, moment(calMonth));
                    }
                    catch {
                        clearInterval(dotsInterval);
                        genBtn.setText(t('review.generateFailed'));
                        genBtn.disabled = false;
                        genBtn.removeClass('tl-dash-generate-btn-loading');
                    }
                })();
            });
        }
        // ---- Principles & Patterns ----
        let principle = null;
        const pPath = `${h.plugin.settings.archiveFolder}/principles.md`;
        const pFile = h.app.vault.getAbstractFileByPath(pPath);
        if (pFile && pFile instanceof TFile) {
            try {
                const content = await h.app.vault.read(pFile);
                const lines = content.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.substring(2).trim());
                if (lines.length)
                    principle = lines[Math.floor(Math.random() * lines.length)];
            }
            catch { /* skip */ }
        }
        let pattern = null;
        const ptPath = `${h.plugin.settings.archiveFolder}/patterns.md`;
        const ptFile = h.app.vault.getAbstractFileByPath(ptPath);
        if (ptFile && ptFile instanceof TFile) {
            try {
                const content = await h.app.vault.read(ptFile);
                const lines = content.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.substring(2).trim());
                if (lines.length)
                    pattern = lines[lines.length - 1];
            }
            catch { /* skip */ }
        }
        if (principle || pattern) {
            const ppCard = panel.createDiv('tl-pyramid-layer tl-dash-card');
            const ppHeader = ppCard.createDiv('tl-pyramid-layer-header');
            ppHeader.createEl('span', { cls: 'tl-pyramid-layer-icon', text: '💡' });
            ppHeader.createEl('span', { cls: 'tl-pyramid-layer-title', text: t('review.principlesAndPatterns') });
            const ppBody = ppCard.createDiv('tl-dash-card-body');
            if (principle)
                ppBody.createEl('blockquote', { cls: 'tl-dash-quote', text: principle });
            if (pattern)
                ppBody.createEl('p', { cls: 'tl-dash-pattern', text: `🔄 ${pattern}` });
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmV2aWV3LXJlbmRlcmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicmV2aWV3LXJlbmRlcmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7R0FHRztBQUVILE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBR3pDLE9BQU8sRUFBRSxDQUFDLEVBQUUsV0FBVyxFQUFFLE1BQU0sU0FBUyxDQUFDO0FBaUJ6QyxNQUFNLE9BQU8sY0FBYztJQUN2QixZQUFvQixJQUFnQjtRQUFoQixTQUFJLEdBQUosSUFBSSxDQUFZO0lBQUksQ0FBQztJQUV6QyxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQWtCO1FBQzNCLEtBQUssQ0FBQyxRQUFRLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUNuQyxNQUFNLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN2QyxNQUFNLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBRUQsK0JBQStCO0lBRXZCLEtBQUssQ0FBQyxXQUFXLENBQUMsT0FBZTtRQUNyQyxNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDO1FBQ3BCLE1BQU0sSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsV0FBVyxJQUFJLE9BQU8sS0FBSyxDQUFDO1FBQzlELE1BQU0sSUFBSSxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3JELElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDLElBQUksWUFBWSxLQUFLLENBQUM7WUFBRSxPQUFPLElBQUksQ0FBQztRQUNuRCxJQUFJLENBQUM7WUFDRCxNQUFNLE9BQU8sR0FBRyxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZ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QUFDLEdBQUcsRUFBRSxFQUFFLEdBQUcsRUFBRSxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsTUFBTSxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDekYsQ0FBQztJQUNMLENBQUM7Q0FDSiIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogUmV2aWV3IFJlbmRlcmVyIC0gUmVuZGVycyB0aGUgUmV2aWV3IHRhYiAoY2FsZW5kYXIgKyBkYXNoYm9hcmQpXG4gKiBFeHRyYWN0ZWQgZnJvbSBjaGF0LXZpZXcudHMgZm9yIG1haW50YWluYWJpbGl0eS5cbiAqL1xuXG5pbXBvcnQgeyBURmlsZSwgbW9tZW50IH0gZnJvbSAnb2JzaWRpYW4nO1xuaW1wb3J0IHR5cGUgVGlkZUxvZ1BsdWdpbiBmcm9tICcuLi9tYWluJztcbmltcG9ydCB0eXBlIHsgQXBwIH0gZnJvbSAnb2JzaWRpYW4nO1xuaW1wb3J0IHsgdCwgZ2V0TGFuZ3VhZ2UgfSBmcm9tICcuLi9pMThuJztcblxuaW50ZXJmYWNlIENhbERhdGEgeyBlbW90aW9uU2NvcmU6IG51bWJlciB8IG51bGw7IHRhc2tDb3VudDogbnVtYmVyOyBjb21wbGV0ZWRDb3VudDogbnVtYmVyOyB0YXNrczogeyB0ZXh0OiBzdHJpbmc7IGRvbmU6IGJvb2xlYW4gfVtdOyBzdGF0dXM6IHN0cmluZzsgZmlsZVBhdGg6IHN0cmluZzsgaGFzUGxhbjogYm9vbGVhbjsgaGFzUmV2aWV3OiBib29sZWFuIH1cblxuLyoqIE1pbmltYWwgaW50ZXJmYWNlIGZvciB0aGUgaG9zdCB2aWV3IHRoYXQgb3ducyB0aGlzIHJlbmRlcmVyLiAqL1xuZXhwb3J0IGludGVyZmFjZSBSZXZpZXdIb3N0IHtcbiAgICBwbHVnaW46IFRpZGVMb2dQbHVnaW47XG4gICAgYXBwOiBBcHA7XG4gICAgY2FsZW5kYXJNb250aDogbW9tZW50Lk1vbWVudDtcbiAgICBjYWxlbmRhclZpZXdNb2RlOiAnbW9udGgnIHwgJ3dlZWsnO1xuICAgIGNhbGVuZGFyV2Vla09mZnNldDogbnVtYmVyO1xuICAgIHBhcnNlTm90ZVNjb3Jlcyhjb250ZW50OiBzdHJpbmcpOiBudW1iZXIgfCBudWxsO1xuICAgIHN3aXRjaFRhYih0YWI6IHN0cmluZyk6IHZvaWQ7XG4gICAgaW52YWxpZGF0ZVRhYkNhY2hlKHRhYjogc3RyaW5nKTogdm9pZDtcbiAgICBzdGFydENoYXRXaXRoQ29udGV4dChjb250ZXh0OiBzdHJpbmcpOiB2b2lkO1xufVxuXG5leHBvcnQgY2xhc3MgUmV2aWV3UmVuZGVyZXIge1xuICAgIGNvbnN0cnVjdG9yKHByaXZhdGUgaG9zdDogUmV2aWV3SG9zdCkgeyB9XG5cbiAgICBhc3luYyByZW5kZXIocGFuZWw6IEhUTUxFbGVtZW50KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIHBhbmVsLmFkZENsYXNzKCd0bC1yZXZpZXctc2Nyb2xsJyk7XG4gICAgICAgIGF3YWl0IHRoaXMucmVuZGVyUmV2aWV3Q2FsZW5kYXIocGFuZWwpO1xuICAgICAgICBhd2FpdCB0aGlzLnJlbmRlclJldmlld0Rhc2hib2FyZChwYW5lbCk7XG4gICAgfVxuXG4gICAgLy8gLS0tLSBTaGFyZWQgZGF0YSBsb2FkZXIgLS0tLVxuXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkRGF5RGF0YShkYXRlU3RyOiBzdHJpbmcpOiBQcm9taXNlPENhbERhdGEgfCBudWxsPiB7XG4gICAgICAgIGNvbnN0IGggPSB0aGlzLmhvc3Q7XG4gICAgICAgIGNvbnN0IHBhdGggPSBgJHtoLnBsdWdpbi5zZXR0aW5ncy5kYWlseUZvbGRlcn0vJHtkYXRlU3RyfS5tZGA7XG4gICAgICAgIGNvbnN0IGZpbGUgPSBoLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgocGF0aCk7XG4gICAgICAgIGlmICghZmlsZSB8fCAhKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkpIHJldHVybiBudWxsO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IGguYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgICAgICAgICBjb25zdCBlbW90aW9uU2NvcmUgPSBoLnBhcnNlTm90ZVNjb3Jlcyhjb250ZW50KTtcbiAgICAgICAgICAgIGxldCBzdGF0dXMgPSAndG9kbyc7XG4gICAgICAgICAgICBpZiAoY29udGVudC5zdGFydHNXaXRoKCctLS0nKSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGVuZCA9IGNvbnRlbnQuaW5kZXhPZignLS0tJywgMyk7XG4gICAgICAgICAgICAgICAgaWYgKGVuZCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc20gPSBjb250ZW50LnN1YnN0cmluZyg0LCBlbmQpLm1hdGNoKC9zdGF0dXM6XFxzKihcXFMrKS8pO1xuICAgICAgICAgICAgICAgICAgICBpZiAoc20pIHN0YXR1cyA9IHNtWzFdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHRhc2tzOiB7IHRleHQ6IHN0cmluZzsgZG9uZTogYm9vbGVhbiB9W10gPSBbXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgbGluZSBvZiBjb250ZW50LnNwbGl0KCdcXG4nKSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IG0gPSBsaW5lLm1hdGNoKC9eLSBcXFsoWyB4XSlcXF0gKC4rKSQvKTtcbiAgICAgICAgICAgICAgICBpZiAobSkgdGFza3MucHVzaCh7IGRvbmU6IG1bMV0gPT09ICd4JywgdGV4dDogbVsyXS50cmltKCkgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIGVtb3Rpb25TY29yZSxcbiAgICAgICAgICAgICAgICB0YXNrQ291bnQ6IHRhc2tzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICBjb21wbGV0ZWRDb3VudDogdGFza3MuZmlsdGVyKHQgPT4gdC5kb25lKS5sZW5ndGgsXG4gICAgICAgICAgICAgICAgdGFza3MsXG4gICAgICAgICAgICAgICAgc3RhdHVzLFxuICAgICAgICAgICAgICAgIGZpbGVQYXRoOiBmaWxlLnBhdGgsXG4gICAgICAgICAgICAgICAgaGFzUGxhbjogKGNvbnRlbnQuaW5jbHVkZXMoJyMjIOiuoeWIkicpIHx8IGNvbnRlbnQuaW5jbHVkZXMoJyMjIFBsYW4nKSkgJiYgdGFza3MubGVuZ3RoID4gMCxcbiAgICAgICAgICAgICAgICBoYXNSZXZpZXc6IGNvbnRlbnQuaW5jbHVkZXMoJyMjIOWkjeebmCcpIHx8IGNvbnRlbnQuaW5jbHVkZXMoJyMjIFJldmlldycpLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCB7IHJldHVybiBudWxsOyB9XG4gICAgfVxuXG4gICAgLy8gLS0tIENhbGVuZGFyIHNlY3Rpb24gLS0tXG5cbiAgICBwcml2YXRlIGFzeW5jIHJlbmRlclJldmlld0NhbGVuZGFyKHBhbmVsOiBIVE1MRWxlbWVudCk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBjb25zdCBoID0gdGhpcy5ob3N0O1xuICAgICAgICBjb25zdCBsYXllciA9IHBhbmVsLmNyZWF0ZURpdigndGwtcHlyYW1pZC1sYXllciB0bC1weXJhbWlkLXJldmlldy1jYWwnKTtcblxuICAgICAgICAvLyBIZWFkZXIgd2l0aCBuYXYgb25seSAobm8gbW9kZSB0b2dnbGUg4oCUIGFsd2F5cyBtb250aCB2aWV3KVxuICAgICAgICBjb25zdCBoZWFkZXIgPSBsYXllci5jcmVhdGVEaXYoJ3RsLXB5cmFtaWQtbGF5ZXItaGVhZGVyIHRsLWNhbC1oZWFkZXInKTtcbiAgICAgICAgY29uc3QgcHJldkJ0biA9IGhlYWRlci5jcmVhdGVFbCgnYnV0dG9uJywgeyBjbHM6ICd0bC1jYWwtbmF2LWJ0bicsIHRleHQ6ICfigLknIH0pO1xuICAgICAgICBjb25zdCB0aXRsZUVsID0gaGVhZGVyLmNyZWF0ZUVsKCdzcGFuJywgeyBjbHM6ICd0bC1jYWwtdGl0bGUnIH0pO1xuICAgICAgICBjb25zdCBuZXh0QnRuID0gaGVhZGVyLmNyZWF0ZUVsKCdidXR0b24nLCB7IGNsczogJ3RsLWNhbC1uYXYtYnRuJywgdGV4dDogJ+KAuicgfSk7XG5cbiAgICAgICAgdGl0bGVFbC5zZXRUZXh0KGdldExhbmd1YWdlKCkgPT09ICdlbicgPyBoLmNhbGVuZGFyTW9udGguZm9ybWF0KCdNTU1NIFlZWVknKSA6IGguY2FsZW5kYXJNb250aC5mb3JtYXQoJ1lZWVnlubQgTeaciCcpKTtcbiAgICAgICAgcHJldkJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHsgaC5jYWxlbmRhck1vbnRoLnN1YnRyYWN0KDEsICdtb250aCcpOyBoLmludmFsaWRhdGVUYWJDYWNoZSgncmV2aWV3Jyk7IGguc3dpdGNoVGFiKCdyZXZpZXcnKTsgfSk7XG4gICAgICAgIG5leHRCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7IGguY2FsZW5kYXJNb250aC5hZGQoMSwgJ21vbnRoJyk7IGguaW52YWxpZGF0ZVRhYkNhY2hlKCdyZXZpZXcnKTsgaC5zd2l0Y2hUYWIoJ3JldmlldycpOyB9KTtcbiAgICAgICAgYXdhaXQgdGhpcy5yZW5kZXJNb250aFZpZXcobGF5ZXIpO1xuICAgIH1cblxuICAgIC8vIC0tLS0gTW9udGggVmlldyAtLS0tXG5cbiAgICBwcml2YXRlIGFzeW5jIHJlbmRlck1vbnRoVmlldyhsYXllcjogSFRNTEVsZW1lbnQpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgY29uc3QgaCA9IHRoaXMuaG9zdDtcbiAgICAgICAgY29uc3QgYm9keSA9IGxheWVyLmNyZWF0ZURpdigndGwtcHlyYW1pZC1yZXZpZXctY2FsLWJvZHknKTtcblxuICAgICAgICAvLyBXZWVrZGF5IHJvd1xuICAgICAgICBjb25zdCB3ZWVrZGF5cyA9IHQoJ2NhbC53ZWVrZGF5cycpLnNwbGl0KCcsJyk7XG4gICAgICAgIGNvbnN0IGdyaWQgPSBib2R5LmNyZWF0ZURpdigndGwtY2FsLWdyaWQnKTtcbiAgICAgICAgZm9yIChjb25zdCB3ZCBvZiB3ZWVrZGF5cykge1xuICAgICAgICAgICAgZ3JpZC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICd0bC1jYWwtd2Vla2RheScsIHRleHQ6IHdkIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUGFkXG4gICAgICAgIGNvbnN0IGZpcnN0RGF5ID0gbW9tZW50KGguY2FsZW5kYXJNb250aCkuc3RhcnRPZignbW9udGgnKTtcbiAgICAgICAgY29uc3Qgc3RhcnRQYWQgPSBmaXJzdERheS5pc29XZWVrZGF5KCkgLSAxO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHN0YXJ0UGFkOyBpKyspIGdyaWQuY3JlYXRlRGl2KCd0bC1jYWwtY2VsbCB0bC1jYWwtY2VsbC1lbXB0eScpO1xuXG4gICAgICAgIGNvbnN0IGRheXNJbk1vbnRoID0gaC5jYWxlbmRhck1vbnRoLmRheXNJbk1vbnRoKCk7XG4gICAgICAgIGNvbnN0IHRvZGF5U3RyID0gbW9tZW50KCkuZm9ybWF0KCdZWVlZLU1NLUREJyk7XG5cbiAgICAgICAgZm9yIChsZXQgZCA9IDE7IGQgPD0gZGF5c0luTW9udGg7IGQrKykge1xuICAgICAgICAgICAgY29uc3QgZGF0ZVN0ciA9IG1vbWVudChoLmNhbGVuZGFyTW9udGgpLmRhdGUoZCkuZm9ybWF0KCdZWVlZLU1NLUREJyk7XG4gICAgICAgICAgICBjb25zdCBkYXRhID0gYXdhaXQgdGhpcy5sb2FkRGF5RGF0YShkYXRlU3RyKTtcbiAgICAgICAgICAgIGNvbnN0IGlzVG9kYXkgPSBkYXRlU3RyID09PSB0b2RheVN0cjtcblxuICAgICAgICAgICAgY29uc3QgY2VsbCA9IGdyaWQuY3JlYXRlRGl2KGB0bC1jYWwtY2VsbCAke2lzVG9kYXkgPyAndGwtY2FsLWNlbGwtdG9kYXknIDogJyd9YCk7XG5cbiAgICAgICAgICAgIC8vIFByZW1pdW0gaW50ZXJsb2NraW5nIHJpbmcgd2l0aCBncmFkaWVudCBibGVuZCBhdCBqdW5jdGlvbnNcbiAgICAgICAgICAgIGNvbnN0IGhhc1BsYW4gPSBkYXRhPy5oYXNQbGFuID8/IGZhbHNlO1xuICAgICAgICAgICAgY29uc3QgaGFzUmV2aWV3ID0gZGF0YT8uaGFzUmV2aWV3ID8/IGZhbHNlO1xuICAgICAgICAgICAgY29uc3QgaGFzRGF0YSA9ICEhZGF0YTtcblxuICAgICAgICAgICAgY29uc3Qgc3ZnTlMgPSAnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnO1xuICAgICAgICAgICAgY29uc3Qgc3ZnID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKHN2Z05TLCAnc3ZnJyk7XG4gICAgICAgICAgICBzdmcuc2V0QXR0cmlidXRlKCd3aWR0aCcsICczNicpO1xuICAgICAgICAgICAgc3ZnLnNldEF0dHJpYnV0ZSgnaGVpZ2h0JywgJzM2Jyk7XG4gICAgICAgICAgICBzdmcuc2V0QXR0cmlidXRlKCd2aWV3Qm94JywgJzAgMCAzNiAzNicpO1xuICAgICAgICAgICAgc3ZnLnNldEF0dHJpYnV0ZSgnY2xhc3MnLCAndGwtY2FsLXJpbmctc3ZnJyk7XG5cbiAgICAgICAgICAgIGNvbnN0IGN4ID0gMTgsIGN5ID0gMTgsIHIgPSAxNDtcbiAgICAgICAgICAgIGNvbnN0IGZ1bGxDID0gMiAqIE1hdGguUEkgKiByO1xuICAgICAgICAgICAgY29uc3QgdWlkID0gYGNyJHtkfWA7XG5cbiAgICAgICAgICAgIC8vIERlZmluZSBncmFkaWVudCBkZWZpbml0aW9uc1xuICAgICAgICAgICAgY29uc3QgZGVmcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhzdmdOUywgJ2RlZnMnKTtcblxuICAgICAgICAgICAgLy8gUGxhbiBhcmMgZ3JhZGllbnQ6IHB1cmUgdGVhbCBkZXB0aCAobGlnaHQg4oaSIGRlZXApXG4gICAgICAgICAgICBjb25zdCBwZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhzdmdOUywgJ2xpbmVhckdyYWRpZW50Jyk7XG4gICAgICAgICAgICBwZy5zZXRBdHRyaWJ1dGUoJ2lkJywgYCR7dWlkfXBnYCk7XG4gICAgICAgICAgICBwZy5zZXRBdHRyaWJ1dGUoJ2dyYWRpZW50VW5pdHMnLCAndXNlclNwYWNlT25Vc2UnKTtcbiAgICAgICAgICAgIHBnLnNldEF0dHJpYnV0ZSgneDEnLCAnNCcpOyBwZy5zZXRBdHRyaWJ1dGUoJ3kxJywgJzE4Jyk7XG4gICAgICAgICAgICBwZy5zZXRBdHRyaWJ1dGUoJ3gyJywgJzMyJyk7IHBnLnNldEF0dHJpYnV0ZSgneTInLCAnMTgnKTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgW29mZnNldCwgY29sb3JdIG9mIFtbJzAlJywgJyM1QUJFQ0MnXSwgWyc1MCUnLCAnIzNCOEVBNSddLCBbJzEwMCUnLCAnIzJENzA4OCddXSBhcyBjb25zdCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHN0b3AgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoc3ZnTlMsICdzdG9wJyk7XG4gICAgICAgICAgICAgICAgc3RvcC5zZXRBdHRyaWJ1dGUoJ29mZnNldCcsIG9mZnNldCk7XG4gICAgICAgICAgICAgICAgc3RvcC5zZXRBdHRyaWJ1dGUoJ3N0b3AtY29sb3InLCBjb2xvcik7XG4gICAgICAgICAgICAgICAgcGcuYXBwZW5kQ2hpbGQoc3RvcCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkZWZzLmFwcGVuZENoaWxkKHBnKTtcblxuICAgICAgICAgICAgLy8gUmV2aWV3IGFyYyBncmFkaWVudDogcHVyZSB3YXJtIGdvbGQgZGVwdGggKGxpZ2h0IOKGkiBkZWVwKVxuICAgICAgICAgICAgY29uc3QgcmcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoc3ZnTlMsICdsaW5lYXJHcmFkaWVudCcpO1xuICAgICAgICAgICAgcmcuc2V0QXR0cmlidXRlKCdpZCcsIGAke3VpZH1yZ2ApO1xuICAgICAgICAgICAgcmcuc2V0QXR0cmlidXRlKCdncmFkaWVudFVuaXRzJywgJ3VzZXJTcGFjZU9uVXNlJyk7XG4gICAgICAgICAgICByZy5zZXRBdHRyaWJ1dGUoJ3gxJywgJzMyJyk7IHJnLnNldEF0dHJpYnV0ZSgneTEnLCAnMTgnKTtcbiAgICAgICAgICAgIHJnLnNldEF0dHJpYnV0ZSgneDInLCAnNCcpOyByZy5zZXRBdHRyaWJ1dGUoJ3kyJywgJzE4Jyk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtvZmZzZXQsIGNvbG9yXSBvZiBbWycwJScsICcjRThENUEwJ10sIFsnNTAlJywgJyNENEI5NzgnXSwgWycxMDAlJywgJyNCODlBNTgnXV0gYXMgY29uc3QpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBzdG9wID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKHN2Z05TLCAnc3RvcCcpO1xuICAgICAgICAgICAgICAgIHN0b3Auc2V0QXR0cmlidXRlKCdvZmZzZXQnLCBvZmZzZXQpO1xuICAgICAgICAgICAgICAgIHN0b3Auc2V0QXR0cmlidXRlKCdzdG9wLWNvbG9yJywgY29sb3IpO1xuICAgICAgICAgICAgICAgIHJnLmFwcGVuZENoaWxkKHN0b3ApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGVmcy5hcHBlbmRDaGlsZChyZyk7XG5cbiAgICAgICAgICAgIC8vIFNvZnQgZ2xvdyBmaWx0ZXIgZm9yIGFjdGl2ZSBhcmNzXG4gICAgICAgICAgICBjb25zdCBnZiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhzdmdOUywgJ2ZpbHRlcicpO1xuICAgICAgICAgICAgZ2Yuc2V0QXR0cmlidXRlKCdpZCcsIGAke3VpZH1nbGApO1xuICAgICAgICAgICAgZ2Yuc2V0QXR0cmlidXRlKCd4JywgJy00MCUnKTsgZ2Yuc2V0QXR0cmlidXRlKCd5JywgJy00MCUnKTtcbiAgICAgICAgICAgIGdmLnNldEF0dHJpYnV0ZSgnd2lkdGgnLCAnMTgwJScpOyBnZi5zZXRBdHRyaWJ1dGUoJ2hlaWdodCcsICcxODAlJyk7XG4gICAgICAgICAgICBjb25zdCBnYiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhzdmdOUywgJ2ZlR2F1c3NpYW5CbHVyJyk7XG4gICAgICAgICAgICBnYi5zZXRBdHRyaWJ1dGUoJ3N0ZERldmlhdGlvbicsICcxLjgnKTsgZ2Iuc2V0QXR0cmlidXRlKCdyZXN1bHQnLCAnZycpO1xuICAgICAgICAgICAgZ2YuYXBwZW5kQ2hpbGQoZ2IpO1xuICAgICAgICAgICAgY29uc3QgZ20gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoc3ZnTlMsICdmZU1lcmdlJyk7XG4gICAgICAgICAgICBjb25zdCBnbTEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoc3ZnTlMsICdmZU1lcmdlTm9kZScpO1xuICAgICAgICAgICAgZ20xLnNldEF0dHJpYnV0ZSgnaW4nLCAnZycpO1xuICAgICAgICAgICAgY29uc3QgZ20yID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKHN2Z05TLCAnZmVNZXJnZU5vZGUnKTtcbiAgICAgICAgICAgIGdtMi5zZXRBdHRyaWJ1dGUoJ2luJywgJ1NvdXJjZUdyYXBoaWMnKTtcbiAgICAgICAgICAgIGdtLmFwcGVuZENoaWxkKGdtMSk7IGdtLmFwcGVuZENoaWxkKGdtMik7XG4gICAgICAgICAgICBnZi5hcHBlbmRDaGlsZChnbSk7IGRlZnMuYXBwZW5kQ2hpbGQoZ2YpO1xuXG4gICAgICAgICAgICBzdmcuYXBwZW5kQ2hpbGQoZGVmcyk7XG5cbiAgICAgICAgICAgIC8vIE1vb2QgZmlsbCAoY2VudGVyIHJhZGlhbCBnbG93KVxuICAgICAgICAgICAgaWYgKGRhdGE/LmVtb3Rpb25TY29yZSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGh1ZSA9IE1hdGgucm91bmQoKChkYXRhLmVtb3Rpb25TY29yZSAtIDEpIC8gOSkgKiAxMjApO1xuICAgICAgICAgICAgICAgIGNvbnN0IG1vb2RDaXJjbGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoc3ZnTlMsICdjaXJjbGUnKTtcbiAgICAgICAgICAgICAgICBtb29kQ2lyY2xlLnNldEF0dHJpYnV0ZSgnY3gnLCBgJHtjeH1gKTtcbiAgICAgICAgICAgICAgICBtb29kQ2lyY2xlLnNldEF0dHJpYnV0ZSgnY3knLCBgJHtjeX1gKTtcbiAgICAgICAgICAgICAgICBtb29kQ2lyY2xlLnNldEF0dHJpYnV0ZSgncicsICc5Jyk7XG4gICAgICAgICAgICAgICAgbW9vZENpcmNsZS5zZXRBdHRyaWJ1dGUoJ2ZpbGwnLCBgaHNsYSgke2h1ZX0sIDU1JSwgNzIlLCAwLjI1KWApO1xuICAgICAgICAgICAgICAgIHN2Zy5hcHBlbmRDaGlsZChtb29kQ2lyY2xlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGhhc0RhdGEpIHtcbiAgICAgICAgICAgICAgICAvLyBCYWNrZ3JvdW5kIHRyYWNrXG4gICAgICAgICAgICAgICAgY29uc3QgdHJhY2sgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoc3ZnTlMsICdjaXJjbGUnKTtcbiAgICAgICAgICAgICAgICB0cmFjay5zZXRBdHRyaWJ1dGUoJ2N4JywgYCR7Y3h9YCk7XG4gICAgICAgICAgICAgICAgdHJhY2suc2V0QXR0cmlidXRlKCdjeScsIGAke2N5fWApO1xuICAgICAgICAgICAgICAgIHRyYWNrLnNldEF0dHJpYnV0ZSgncicsIGAke3J9YCk7XG4gICAgICAgICAgICAgICAgdHJhY2suc2V0QXR0cmlidXRlKCdmaWxsJywgJ25vbmUnKTtcbiAgICAgICAgICAgICAgICB0cmFjay5zZXRBdHRyaWJ1dGUoJ3N0cm9rZScsICd2YXIoLS1iYWNrZ3JvdW5kLW1vZGlmaWVyLWJvcmRlciknKTtcbiAgICAgICAgICAgICAgICB0cmFjay5zZXRBdHRyaWJ1dGUoJ3N0cm9rZS13aWR0aCcsICczLjUnKTtcbiAgICAgICAgICAgICAgICB0cmFjay5zZXRBdHRyaWJ1dGUoJ29wYWNpdHknLCAnMC4yNScpO1xuICAgICAgICAgICAgICAgIHN2Zy5hcHBlbmRDaGlsZCh0cmFjayk7XG5cbiAgICAgICAgICAgICAgICAvLyBJbnRlcmxvY2tpbmcgYXJjIHBhcmFtc1xuICAgICAgICAgICAgICAgIC8vIEVhY2ggaGFsZiA9IDE3NcKwICg1wrAgdG90YWwgZ2FwIGRpc3RyaWJ1dGVkIGFjcm9zcyAyIGp1bmN0aW9uIHBvaW50cylcbiAgICAgICAgICAgICAgICBjb25zdCBoYWxmQXJjRGVnID0gMTc1O1xuICAgICAgICAgICAgICAgIGNvbnN0IGhhbGZBcmNMZW4gPSBmdWxsQyAqIGhhbGZBcmNEZWcgLyAzNjA7XG4gICAgICAgICAgICAgICAgY29uc3QgaGFsZkdhcExlbiA9IGZ1bGxDIC0gaGFsZkFyY0xlbjtcblxuICAgICAgICAgICAgICAgIGNvbnN0IG1ha2VBcmMgPSAocm90YXRlRGVnOiBudW1iZXIsIHN0cm9rZTogc3RyaW5nLCBhY3RpdmU6IGJvb2xlYW4pID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYXJjID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKHN2Z05TLCAnY2lyY2xlJyk7XG4gICAgICAgICAgICAgICAgICAgIGFyYy5zZXRBdHRyaWJ1dGUoJ2N4JywgYCR7Y3h9YCk7XG4gICAgICAgICAgICAgICAgICAgIGFyYy5zZXRBdHRyaWJ1dGUoJ2N5JywgYCR7Y3l9YCk7XG4gICAgICAgICAgICAgICAgICAgIGFyYy5zZXRBdHRyaWJ1dGUoJ3InLCBgJHtyfWApO1xuICAgICAgICAgICAgICAgICAgICBhcmMuc2V0QXR0cmlidXRlKCdmaWxsJywgJ25vbmUnKTtcbiAgICAgICAgICAgICAgICAgICAgYXJjLnNldEF0dHJpYnV0ZSgnc3Ryb2tlJywgc3Ryb2tlKTtcbiAgICAgICAgICAgICAgICAgICAgYXJjLnNldEF0dHJpYnV0ZSgnc3Ryb2tlLXdpZHRoJywgYWN0aXZlID8gJzMuNScgOiAnMi41Jyk7XG4gICAgICAgICAgICAgICAgICAgIGFyYy5zZXRBdHRyaWJ1dGUoJ3N0cm9rZS1saW5lY2FwJywgJ3JvdW5kJyk7XG4gICAgICAgICAgICAgICAgICAgIGFyYy5zZXRBdHRyaWJ1dGUoJ3N0cm9rZS1kYXNoYXJyYXknLCBgJHtoYWxmQXJjTGVufSAke2hhbGZHYXBMZW59YCk7XG4gICAgICAgICAgICAgICAgICAgIGFyYy5zZXRBdHRyaWJ1dGUoJ3RyYW5zZm9ybScsIGByb3RhdGUoJHtyb3RhdGVEZWd9ICR7Y3h9ICR7Y3l9KWApO1xuICAgICAgICAgICAgICAgICAgICBpZiAoYWN0aXZlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhcmMuc2V0QXR0cmlidXRlKCdmaWx0ZXInLCBgdXJsKCMke3VpZH1nbClgKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFyYy5jbGFzc0xpc3QuYWRkKCd0bC1jYWwtcmluZy1hcmMtYWN0aXZlJyk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhcmMuc2V0QXR0cmlidXRlKCdvcGFjaXR5JywgJzAuMycpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYXJjLnNldEF0dHJpYnV0ZSgnc3Ryb2tlLWRhc2hhcnJheScsICczIDQnKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYXJjO1xuICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICAvLyBQbGFuIGhhbGYgKGxlZnQgc2lkZTogOeKGkjMgbydjbG9jaylcbiAgICAgICAgICAgICAgICBjb25zdCBwbGFuU3Ryb2tlID0gaGFzUGxhbiA/IGB1cmwoIyR7dWlkfXBnKWAgOiAndmFyKC0tYmFja2dyb3VuZC1tb2RpZmllci1ib3JkZXIpJztcbiAgICAgICAgICAgICAgICAvLyBSZXZpZXcgaGFsZiAocmlnaHQgc2lkZTogM+KGkjkgbydjbG9jaylcbiAgICAgICAgICAgICAgICBjb25zdCByZXZTdHJva2UgPSBoYXNSZXZpZXcgPyBgdXJsKCMke3VpZH1yZylgIDogJ3ZhcigtLWJhY2tncm91bmQtbW9kaWZpZXItYm9yZGVyKSc7XG5cbiAgICAgICAgICAgICAgICAvLyBMYXllciAxIChib3R0b20pOiBSZXZpZXcgYXJjXG4gICAgICAgICAgICAgICAgc3ZnLmFwcGVuZENoaWxkKG1ha2VBcmMoLTIuNSwgcmV2U3Ryb2tlLCBoYXNSZXZpZXcpKTtcbiAgICAgICAgICAgICAgICAvLyBMYXllciAyICh0b3ApOiBQbGFuIGFyYyDigJQgb3ZlcmxhcHMgcmV2aWV3IGF0IHRvcCBqdW5jdGlvblxuICAgICAgICAgICAgICAgIHN2Zy5hcHBlbmRDaGlsZChtYWtlQXJjKDE3Ny41LCBwbGFuU3Ryb2tlLCBoYXNQbGFuKSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIERhdGUgbnVtYmVyXG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKHN2Z05TLCAndGV4dCcpO1xuICAgICAgICAgICAgdGV4dC5zZXRBdHRyaWJ1dGUoJ3gnLCBgJHtjeH1gKTtcbiAgICAgICAgICAgIHRleHQuc2V0QXR0cmlidXRlKCd5JywgYCR7Y3l9YCk7XG4gICAgICAgICAgICB0ZXh0LnNldEF0dHJpYnV0ZSgndGV4dC1hbmNob3InLCAnbWlkZGxlJyk7XG4gICAgICAgICAgICB0ZXh0LnNldEF0dHJpYnV0ZSgnZG9taW5hbnQtYmFzZWxpbmUnLCAnY2VudHJhbCcpO1xuICAgICAgICAgICAgdGV4dC5zZXRBdHRyaWJ1dGUoJ2NsYXNzJywgJ3RsLWNhbC1yaW5nLXRleHQnKTtcbiAgICAgICAgICAgIHRleHQudGV4dENvbnRlbnQgPSBgJHtkfWA7XG4gICAgICAgICAgICBzdmcuYXBwZW5kQ2hpbGQodGV4dCk7XG5cbiAgICAgICAgICAgIGNlbGwuYXBwZW5kQ2hpbGQoc3ZnKTtcblxuICAgICAgICAgICAgLy8gSG92ZXIgdG8gc2hvdyBwb3BvdmVyIChubyBjbGljayBuZWVkZWQpXG4gICAgICAgICAgICBpZiAoZGF0YT8uZmlsZVBhdGgpIHtcbiAgICAgICAgICAgICAgICBjZWxsLmFkZENsYXNzKCd0bC1jYWwtY2VsbC1jbGlja2FibGUnKTtcbiAgICAgICAgICAgICAgICBsZXQgcG9wb3ZlclRpbWVvdXQ6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgbnVsbCA9IG51bGw7XG5cbiAgICAgICAgICAgICAgICBjZWxsLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZW50ZXInLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHBvcG92ZXJUaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNob3dUYXNrUG9wb3ZlcihjZWxsLCBkYXRhLCBkYXRlU3RyKTtcbiAgICAgICAgICAgICAgICAgICAgfSwgMjAwKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBjZWxsLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbGVhdmUnLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChwb3BvdmVyVGltZW91dCkgY2xlYXJUaW1lb3V0KHBvcG92ZXJUaW1lb3V0KTtcbiAgICAgICAgICAgICAgICAgICAgLy8gR2l2ZSBhIHNtYWxsIGRlbGF5IHNvIHVzZXIgY2FuIG1vdmUgaW50byBwb3BvdmVyXG4gICAgICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcG9wb3ZlciA9IGNlbGwucXVlcnlTZWxlY3RvcignLnRsLWNhbC1wb3BvdmVyJykgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocG9wb3ZlciAmJiAhcG9wb3Zlci5tYXRjaGVzKCc6aG92ZXInKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBvcG92ZXIucmVtb3ZlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0sIDE1MCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgLy8gQ2xpY2sgdG8gb3BlbiBub3RlIGRpcmVjdGx5XG4gICAgICAgICAgICAgICAgY2VsbC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZiA9IGguYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChkYXRhLmZpbGVQYXRoKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGYgaW5zdGFuY2VvZiBURmlsZSkgdm9pZCBoLmFwcC53b3Jrc3BhY2UuZ2V0TGVhZigpLm9wZW5GaWxlKGYpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gLS0tLSBXZWVrIFZpZXcgLS0tLVxuXG4gICAgcHJpdmF0ZSBhc3luYyByZW5kZXJXZWVrVmlldyhsYXllcjogSFRNTEVsZW1lbnQsIHdlZWtTdGFydDogbW9tZW50Lk1vbWVudCk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBjb25zdCBoID0gdGhpcy5ob3N0O1xuICAgICAgICBjb25zdCB0b2RheVN0ciA9IG1vbWVudCgpLmZvcm1hdCgnWVlZWS1NTS1ERCcpO1xuICAgICAgICBjb25zdCB3ZWVrZGF5cyA9IGdldExhbmd1YWdlKCkgPT09ICdlbidcbiAgICAgICAgICAgID8gWydNb24nLCAnVHVlJywgJ1dlZCcsICdUaHUnLCAnRnJpJywgJ1NhdCcsICdTdW4nXVxuICAgICAgICAgICAgOiBbJ+WRqOS4gCcsICflkajkuownLCAn5ZGo5LiJJywgJ+WRqOWbmycsICflkajkupQnLCAn5ZGo5YWtJywgJ+WRqOaXpSddO1xuXG4gICAgICAgIGNvbnN0IHdlZWtHcmlkID0gbGF5ZXIuY3JlYXRlRGl2KCd0bC13ZWVrLWdyaWQnKTtcblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IDc7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgZCA9IG1vbWVudCh3ZWVrU3RhcnQpLmFkZChpLCAnZGF5cycpO1xuICAgICAgICAgICAgY29uc3QgZGF0ZVN0ciA9IGQuZm9ybWF0KCdZWVlZLU1NLUREJyk7XG4gICAgICAgICAgICBjb25zdCBpc1RvZGF5ID0gZGF0ZVN0ciA9PT0gdG9kYXlTdHI7XG4gICAgICAgICAgICBjb25zdCBkYXRhID0gYXdhaXQgdGhpcy5sb2FkRGF5RGF0YShkYXRlU3RyKTtcblxuICAgICAgICAgICAgY29uc3QgY29sID0gd2Vla0dyaWQuY3JlYXRlRGl2KGB0bC13ZWVrLWNvbCAke2lzVG9kYXkgPyAndGwtd2Vlay1jb2wtdG9kYXknIDogJyd9YCk7XG5cbiAgICAgICAgICAgIC8vIERheSBoZWFkZXJcbiAgICAgICAgICAgIGNvbnN0IGRheUhlYWRlciA9IGNvbC5jcmVhdGVEaXYoJ3RsLXdlZWstZGF5LWhlYWRlcicpO1xuICAgICAgICAgICAgZGF5SGVhZGVyLmNyZWF0ZUVsKCdzcGFuJywgeyBjbHM6ICd0bC13ZWVrLWRheS1uYW1lJywgdGV4dDogd2Vla2RheXNbaV0gfSk7XG4gICAgICAgICAgICBkYXlIZWFkZXIuY3JlYXRlRWwoJ3NwYW4nLCB7IGNsczogYHRsLXdlZWstZGF5LW51bSAke2lzVG9kYXkgPyAndGwtd2Vlay1kYXktbnVtLXRvZGF5JyA6ICcnfWAsIHRleHQ6IGAke2QuZGF0ZSgpfWAgfSk7XG5cbiAgICAgICAgICAgIC8vIEVtb3Rpb24gYmFkZ2VcbiAgICAgICAgICAgIGlmIChkYXRhPy5lbW90aW9uU2NvcmUpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBodWUgPSBNYXRoLnJvdW5kKCgoZGF0YS5lbW90aW9uU2NvcmUgLSAxKSAvIDkpICogMTIwKTtcbiAgICAgICAgICAgICAgICBjb25zdCBiYWRnZSA9IGRheUhlYWRlci5jcmVhdGVFbCgnc3BhbicsIHsgY2xzOiAndGwtd2Vlay1lbW90aW9uLWJhZGdlIHRsLWR5bmFtaWMtYmcnLCB0ZXh0OiBgJHtkYXRhLmVtb3Rpb25TY29yZX1gIH0pO1xuICAgICAgICAgICAgICAgIGJhZGdlLnN0eWxlLnNldFByb3BlcnR5KCctLXRsLWJnJywgYGhzbCgke2h1ZX0sIDU1JSwgNjAlKWApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBUYXNrIHN0cmlwc1xuICAgICAgICAgICAgY29uc3QgdGFza0FyZWEgPSBjb2wuY3JlYXRlRGl2KCd0bC13ZWVrLXRhc2stYXJlYScpO1xuICAgICAgICAgICAgaWYgKGRhdGEgJiYgZGF0YS50YXNrcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCB0YXNrIG9mIGRhdGEudGFza3MpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3RyaXAgPSB0YXNrQXJlYS5jcmVhdGVEaXYoYHRsLXdlZWstdGFzay1zdHJpcCAke3Rhc2suZG9uZSA/ICd0bC13ZWVrLXRhc2stc3RyaXAtZG9uZScgOiAnJ31gKTtcbiAgICAgICAgICAgICAgICAgICAgc3RyaXAuc2V0VGV4dCh0YXNrLnRleHQpO1xuICAgICAgICAgICAgICAgICAgICAvLyBDbGljayB0byBvcGVuIG5vdGVcbiAgICAgICAgICAgICAgICAgICAgc3RyaXAuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBmID0gaC5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGRhdGEuZmlsZVBhdGgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGYgaW5zdGFuY2VvZiBURmlsZSkgdm9pZCBoLmFwcC53b3Jrc3BhY2UuZ2V0TGVhZigpLm9wZW5GaWxlKGYpO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gU3RhdHMgYXQgYm90dG9tXG4gICAgICAgICAgICAgICAgY29uc3Qgc3RhdHMgPSB0YXNrQXJlYS5jcmVhdGVEaXYoJ3RsLXdlZWstdGFzay1zdGF0cycpO1xuICAgICAgICAgICAgICAgIHN0YXRzLnNldFRleHQoYCR7ZGF0YS5jb21wbGV0ZWRDb3VudH0vJHtkYXRhLnRhc2tDb3VudH1gKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGFza0FyZWEuY3JlYXRlRGl2KHsgY2xzOiAndGwtd2Vlay1lbXB0eScsIHRleHQ6ICfigJQnIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gLS0tLSBUYXNrIFBvcG92ZXIgLS0tLVxuXG4gICAgcHJpdmF0ZSBzaG93VGFza1BvcG92ZXIoYW5jaG9yOiBIVE1MRWxlbWVudCwgZGF0YTogQ2FsRGF0YSwgZGF0ZVN0cjogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIC8vIFJlbW92ZSBleGlzdGluZyBwb3BvdmVyXG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy50bC1jYWwtcG9wb3ZlcicpLmZvckVhY2goZWwgPT4gZWwucmVtb3ZlKCkpO1xuXG4gICAgICAgIGNvbnN0IHBvcG92ZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgcG9wb3Zlci5jbGFzc05hbWUgPSAndGwtY2FsLXBvcG92ZXInO1xuXG4gICAgICAgIC8vIEhlYWRlciAobm8gY2xvc2UgYnV0dG9uKVxuICAgICAgICBjb25zdCBwb3BIZWFkZXIgPSBwb3BvdmVyLmNyZWF0ZURpdigndGwtY2FsLXBvcG92ZXItaGVhZGVyJyk7XG4gICAgICAgIGNvbnN0IGRhdGVMYWJlbCA9IGRhdGVTdHIuc3Vic3RyaW5nKDUpO1xuICAgICAgICBjb25zdCBoYXNQbGFuID0gZGF0YS5oYXNQbGFuO1xuICAgICAgICBjb25zdCBoYXNSZXZpZXcgPSBkYXRhLmhhc1JldmlldztcbiAgICAgICAgcG9wSGVhZGVyLmNyZWF0ZUVsKCdzcGFuJywgeyB0ZXh0OiBkYXRlTGFiZWwgfSk7XG4gICAgICAgIGlmIChoYXNQbGFuKSBwb3BIZWFkZXIuY3JlYXRlRWwoJ3NwYW4nLCB7IGNsczogJ3RsLWNhbC1wb3BvdmVyLWJhZGdlIHRsLWNhbC1wb3BvdmVyLWJhZGdlLXBsYW4nLCB0ZXh0OiB0KCdyZXZpZXcucGxhbicpIH0pO1xuICAgICAgICBpZiAoaGFzUmV2aWV3KSBwb3BIZWFkZXIuY3JlYXRlRWwoJ3NwYW4nLCB7IGNsczogJ3RsLWNhbC1wb3BvdmVyLWJhZGdlIHRsLWNhbC1wb3BvdmVyLWJhZGdlLXJldmlldycsIHRleHQ6IHQoJ3Jldmlldy5yZXZpZXcnKSB9KTtcbiAgICAgICAgaWYgKGRhdGEuZW1vdGlvblNjb3JlKSBwb3BIZWFkZXIuY3JlYXRlRWwoJ3NwYW4nLCB7IGNsczogJ3RsLWNhbC1wb3BvdmVyLWJhZGdlJywgdGV4dDogYOKdpCAke2RhdGEuZW1vdGlvblNjb3JlfWAgfSk7XG5cbiAgICAgICAgLy8gVGFza3NcbiAgICAgICAgaWYgKGRhdGEudGFza3MubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY29uc3QgcG9wQm9keSA9IHBvcG92ZXIuY3JlYXRlRGl2KCd0bC1jYWwtcG9wb3Zlci1ib2R5Jyk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHRhc2sgb2YgZGF0YS50YXNrcy5zbGljZSgwLCA0KSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJvdyA9IHBvcEJvZHkuY3JlYXRlRGl2KGB0bC1jYWwtcG9wb3Zlci10YXNrICR7dGFzay5kb25lID8gJ3RsLWNhbC1wb3BvdmVyLXRhc2stZG9uZScgOiAnJ31gKTtcbiAgICAgICAgICAgICAgICByb3cuY3JlYXRlRWwoJ3NwYW4nLCB7IHRleHQ6IHRhc2suZG9uZSA/ICfinJMnIDogJ+KXiycsIGNsczogJ3RsLWNhbC1wb3BvdmVyLWNoZWNrJyB9KTtcbiAgICAgICAgICAgICAgICByb3cuY3JlYXRlRWwoJ3NwYW4nLCB7IHRleHQ6IHRhc2sudGV4dCB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChkYXRhLnRhc2tzLmxlbmd0aCA+IDQpIHtcbiAgICAgICAgICAgICAgICBwb3BCb2R5LmNyZWF0ZUVsKCdzcGFuJywgeyBjbHM6ICd0bC1jYWwtcG9wb3Zlci1tb3JlJywgdGV4dDogdCgncmV2aWV3Lm1vcmUnLCBTdHJpbmcoZGF0YS50YXNrcy5sZW5ndGggLSA0KSkgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwb3BvdmVyLmNyZWF0ZURpdih7IGNsczogJ3RsLWNhbC1wb3BvdmVyLWVtcHR5JywgdGV4dDogdCgna2FuYmFuLm5vVGFza3MnKSB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEtlZXAgcG9wb3ZlciBhbGl2ZSB3aGVuIGhvdmVyaW5nIG92ZXIgaXRcbiAgICAgICAgcG9wb3Zlci5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWxlYXZlJywgKCkgPT4ge1xuICAgICAgICAgICAgcG9wb3Zlci5yZW1vdmUoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgYW5jaG9yLmFwcGVuZENoaWxkKHBvcG92ZXIpO1xuXG4gICAgICAgIC8vIENsYW1wIHBvcG92ZXIgd2l0aGluIHRoZSBzY3JvbGwgY29udGFpbmVyIHNvIGl0IGRvZXNuJ3QgY2xpcCBhdCBlZGdlc1xuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xuICAgICAgICAgICAgY29uc3Qgc2Nyb2xsUGFyZW50ID0gYW5jaG9yLmNsb3Nlc3QoJy50bC1yZXZpZXctc2Nyb2xsJykgfHwgYW5jaG9yLmNsb3Nlc3QoJy50bC1zaWRlYmFyJyk7XG4gICAgICAgICAgICBpZiAoIXNjcm9sbFBhcmVudCkgcmV0dXJuO1xuICAgICAgICAgICAgY29uc3QgcGFyZW50UmVjdCA9IHNjcm9sbFBhcmVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgICAgICAgIGNvbnN0IHBvcFJlY3QgPSBwb3BvdmVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXG4gICAgICAgICAgICAvLyBUb3AgY2xpcHBpbmc6IGZsaXAgcG9wb3ZlciBiZWxvdyB0aGUgY2VsbFxuICAgICAgICAgICAgaWYgKHBvcFJlY3QudG9wIDwgcGFyZW50UmVjdC50b3ApIHtcbiAgICAgICAgICAgICAgICBwb3BvdmVyLnNldENzc1Byb3BzKHsgJy0tdGwtcG9wLWJvdHRvbSc6ICdhdXRvJywgJy0tdGwtcG9wLXRvcCc6ICcxMDAlJyB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gTGVmdC9yaWdodCBjbGlwcGluZ1xuICAgICAgICAgICAgY29uc3QgcG9wUmVjdDIgPSBwb3BvdmVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgICAgICAgaWYgKHBvcFJlY3QyLmxlZnQgPCBwYXJlbnRSZWN0LmxlZnQgKyA0KSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc2hpZnQgPSBwYXJlbnRSZWN0LmxlZnQgKyA0IC0gcG9wUmVjdDIubGVmdDtcbiAgICAgICAgICAgICAgICBwb3BvdmVyLnNldENzc1Byb3BzKHsgJy0tdGwtcG9wLWxlZnQnOiBgY2FsYyg1MCUgKyAke3NoaWZ0fXB4KWAgfSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHBvcFJlY3QyLnJpZ2h0ID4gcGFyZW50UmVjdC5yaWdodCAtIDQpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBzaGlmdCA9IHBvcFJlY3QyLnJpZ2h0IC0gcGFyZW50UmVjdC5yaWdodCArIDQ7XG4gICAgICAgICAgICAgICAgcG9wb3Zlci5zZXRDc3NQcm9wcyh7ICctLXRsLXBvcC1sZWZ0JzogYGNhbGMoNTAlIC0gJHtzaGlmdH1weClgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyAtLS0gRGFzaGJvYXJkIHNlY3Rpb24gLS0tXG5cbiAgICBwcml2YXRlIGFzeW5jIHJlbmRlclJldmlld0Rhc2hib2FyZChwYW5lbDogSFRNTEVsZW1lbnQpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgY29uc3QgaCA9IHRoaXMuaG9zdDtcbiAgICAgICAgY29uc3QgY2FsTW9udGggPSBoLmNhbGVuZGFyTW9udGg7IC8vIFVzZSB0aGUgc2VsZWN0ZWQgY2FsZW5kYXIgbW9udGgsIG5vdCB0b2RheVxuXG4gICAgICAgIC8vIEhlbHBlcjogc3RyaXAgbWFya2Rvd24gZm9ybWF0dGluZyBmb3IgY2xlYW4gZGlzcGxheVxuICAgICAgICBjb25zdCBzdHJpcE1kID0gKHM6IHN0cmluZyk6IHN0cmluZyA9PlxuICAgICAgICAgICAgcy5yZXBsYWNlKC9cXCpcXCooLio/KVxcKlxcKi9nLCAnJDEnKSAgIC8vIGJvbGRcbiAgICAgICAgICAgICAgICAucmVwbGFjZSgvXFwqKC4qPylcXCovZywgJyQxJykgICAgICAgIC8vIGl0YWxpY1xuICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9ePlxccyovZ20sICcnKSAgICAgICAgICAgICAvLyBibG9ja3F1b3RlXG4gICAgICAgICAgICAgICAgLnJlcGxhY2UoL15bLSpdXFxzKi9nbSwgJycpICAgICAgICAgIC8vIGxpc3QgYnVsbGV0c1xuICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9eXFxkK1xcLlxccyovZ20sICcnKSAgICAgICAgIC8vIG51bWJlcmVkIGxpc3RcbiAgICAgICAgICAgICAgICAucmVwbGFjZSgvYCguKj8pYC9nLCAnJDEnKSAgICAgICAgICAvLyBpbmxpbmUgY29kZVxuICAgICAgICAgICAgICAgIC50cmltKCk7XG5cbiAgICAgICAgLy8gLS0tLSBNb250aGx5IEluc2lnaHQgb25seSAobm8gd2Vla2x5IG9uIGRhc2hib2FyZCkgLS0tLVxuICAgICAgICBjb25zdCBtb250aEtleSA9IGNhbE1vbnRoLmZvcm1hdCgnWVlZWS1NTScpO1xuICAgICAgICBjb25zdCBtUGF0aCA9IGAke2gucGx1Z2luLnNldHRpbmdzLmFyY2hpdmVGb2xkZXJ9L0luc2lnaHRzLyR7dCgnaW5zaWdodC5tb250aGx5RmlsZU5hbWUnLCBtb250aEtleSl9YDtcbiAgICAgICAgY29uc3QgbUZpbGUgPSBoLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgobVBhdGgpO1xuXG4gICAgICAgIGNvbnN0IG1vbnRoQ2FyZCA9IHBhbmVsLmNyZWF0ZURpdigndGwtcHlyYW1pZC1sYXllciB0bC1kYXNoLWNhcmQnKTtcbiAgICAgICAgY29uc3QgbUhlYWRlciA9IG1vbnRoQ2FyZC5jcmVhdGVEaXYoJ3RsLXB5cmFtaWQtbGF5ZXItaGVhZGVyJyk7XG4gICAgICAgIG1IZWFkZXIuY3JlYXRlRWwoJ3NwYW4nLCB7IGNsczogJ3RsLXB5cmFtaWQtbGF5ZXItaWNvbicsIHRleHQ6ICfwn5OFJyB9KTtcbiAgICAgICAgbUhlYWRlci5jcmVhdGVFbCgnc3BhbicsIHsgY2xzOiAndGwtcHlyYW1pZC1sYXllci10aXRsZScsIHRleHQ6IHQoJ3Jldmlldy5tb250aGx5SW5zaWdodCcsIG1vbnRoS2V5KSB9KTtcbiAgICAgICAgY29uc3QgbUJvZHkgPSBtb250aENhcmQuY3JlYXRlRGl2KCd0bC1kYXNoLWNhcmQtYm9keScpO1xuXG4gICAgICAgIGlmIChtRmlsZSAmJiBtRmlsZSBpbnN0YW5jZW9mIFRGaWxlKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBoLmFwcC52YXVsdC5yZWFkKG1GaWxlKTtcbiAgICAgICAgICAgICAgICBjb25zdCBzdW1tYXJ5SWR4ID0gY29udGVudC5pbmRleE9mKCfku6rooajnm5jmkZjopoEnKSAhPT0gLTEgPyBjb250ZW50LmluZGV4T2YoJ+S7quihqOebmOaRmOimgScpIDogY29udGVudC5pbmRleE9mKCdEYXNoYm9hcmQgU3VtbWFyeScpO1xuICAgICAgICAgICAgICAgIGlmIChzdW1tYXJ5SWR4ID49IDApIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbGFiZWwgPSBjb250ZW50LmluZGV4T2YoJ+S7quihqOebmOaRmOimgScpICE9PSAtMSA/ICfku6rooajnm5jmkZjopoEnIDogJ0Rhc2hib2FyZCBTdW1tYXJ5JztcbiAgICAgICAgICAgICAgICAgICAgbGV0IHN1bW1hcnlUZXh0ID0gY29udGVudC5zdWJzdHJpbmcoc3VtbWFyeUlkeCArIGxhYmVsLmxlbmd0aCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG5leHRIID0gc3VtbWFyeVRleHQuc2VhcmNoKC9cXG4jezIsM31cXHMvKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG5leHRIID4gMCkgc3VtbWFyeVRleHQgPSBzdW1tYXJ5VGV4dC5zdWJzdHJpbmcoMCwgbmV4dEgpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBzTGluZXMgPSBzdW1tYXJ5VGV4dC5zcGxpdCgnXFxuJylcbiAgICAgICAgICAgICAgICAgICAgICAgIC5tYXAoKGw6IHN0cmluZykgPT4gc3RyaXBNZChsKSlcbiAgICAgICAgICAgICAgICAgICAgICAgIC5maWx0ZXIoKGw6IHN0cmluZykgPT4gbC5sZW5ndGggPiAwKTtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBsaW5lIG9mIHNMaW5lcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgbUJvZHkuY3JlYXRlRWwoJ3AnLCB7IGNsczogJ3RsLWRhc2gtaW5zaWdodC1saW5lJywgdGV4dDogbGluZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZMaW5lcyA9IGNvbnRlbnQuc3BsaXQoJ1xcbicpXG4gICAgICAgICAgICAgICAgICAgICAgICAubWFwKChsOiBzdHJpbmcpID0+IHN0cmlwTWQobCkpXG4gICAgICAgICAgICAgICAgICAgICAgICAuZmlsdGVyKChsOiBzdHJpbmcpID0+IGwubGVuZ3RoID4gNCAmJiAhbC5zdGFydHNXaXRoKCcjJykgJiYgIWwubWF0Y2goL14o55Sf5oiQ5LqOfOaKpeWRiue7k+aehHxHZW5lcmF0ZWR8UmVwb3J0IHN0cnVjdHVyZSkvKSlcbiAgICAgICAgICAgICAgICAgICAgICAgIC5zbGljZSgwLCAzKTtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBsaW5lIG9mIGZMaW5lcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgbUJvZHkuY3JlYXRlRWwoJ3AnLCB7IGNsczogJ3RsLWRhc2gtaW5zaWdodC1saW5lJywgdGV4dDogbGluZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBsaW5rID0gbUJvZHkuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAndGwtZGFzaC1pbnNpZ2h0LWxpbmsnLCB0ZXh0OiB0KCdyZXZpZXcudmlld0Z1bGxSZXBvcnQnKSB9KTtcbiAgICAgICAgICAgICAgICBsaW5rLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAobUZpbGUgaW5zdGFuY2VvZiBURmlsZSkgdm9pZCBoLmFwcC53b3Jrc3BhY2UuZ2V0TGVhZigpLm9wZW5GaWxlKG1GaWxlKTtcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIC8vIENoYXQgYWJvdXQgbW9udGhseSBpbnNpZ2h0IGJ1dHRvblxuICAgICAgICAgICAgICAgIGNvbnN0IGluc2lnaHRUZXh0ID0gQXJyYXkuZnJvbShtQm9keS5xdWVyeVNlbGVjdG9yQWxsKCcudGwtZGFzaC1pbnNpZ2h0LWxpbmUnKSkubWFwKGVsID0+IGVsLnRleHRDb250ZW50KS5qb2luKCdcXG4nKTtcbiAgICAgICAgICAgICAgICBjb25zdCBjaGF0QnRuID0gbUJvZHkuY3JlYXRlRWwoJ2J1dHRvbicsIHtcbiAgICAgICAgICAgICAgICAgICAgY2xzOiAndGwtZGFzaC1jaGF0LWJ0bicsXG4gICAgICAgICAgICAgICAgICAgIHRleHQ6IHQoJ3Jldmlldy5jaGF0SW5zaWdodCcpLFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGNoYXRCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGguc3RhcnRDaGF0V2l0aENvbnRleHQodCgncmV2aWV3Lmluc2lnaHRDb250ZXh0JywgbW9udGhLZXksIGluc2lnaHRUZXh0KSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9IGNhdGNoIHsgLyogc2tpcCAqLyB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBtQm9keS5jcmVhdGVFbCgncCcsIHsgY2xzOiAndGwtZGFzaC1pbnNpZ2h0LWxpbmUgdGwtZGFzaC1lbXB0eS1oaW50JywgdGV4dDogdCgncmV2aWV3Lm5vSW5zaWdodCcpIH0pO1xuICAgICAgICAgICAgY29uc3QgZ2VuQnRuID0gbUJvZHkuY3JlYXRlRWwoJ2J1dHRvbicsIHtcbiAgICAgICAgICAgICAgICBjbHM6ICd0bC1kYXNoLWdlbmVyYXRlLWJ0bicsXG4gICAgICAgICAgICAgICAgdGV4dDogdCgncmV2aWV3LmdlbmVyYXRlSW5zaWdodCcpLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBnZW5CdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgdm9pZCAoYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGdlbkJ0bi5zZXRUZXh0KHQoJ3Jldmlldy5nZW5lcmF0aW5nJykpO1xuICAgICAgICAgICAgICAgIGdlbkJ0bi5kaXNhYmxlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgZ2VuQnRuLmFkZENsYXNzKCd0bC1kYXNoLWdlbmVyYXRlLWJ0bi1sb2FkaW5nJyk7XG4gICAgICAgICAgICAgICAgLy8gQW5pbWF0ZWQgZG90c1xuICAgICAgICAgICAgICAgIGNvbnN0IGJhc2VUZXh0ID0gdCgncmV2aWV3LmdlbmVyYXRpbmcnKS5yZXBsYWNlKC9cXC4rJC8sICcnKTtcbiAgICAgICAgICAgICAgICBsZXQgZG90Q291bnQgPSAwO1xuICAgICAgICAgICAgICAgIGNvbnN0IGRvdHNJbnRlcnZhbCA9IHNldEludGVydmFsKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgZG90Q291bnQgPSAoZG90Q291bnQgKyAxKSAlIDQ7XG4gICAgICAgICAgICAgICAgICAgIGdlbkJ0bi5zZXRUZXh0KGJhc2VUZXh0ICsgJy4nLnJlcGVhdChkb3RDb3VudCkpO1xuICAgICAgICAgICAgICAgIH0sIDUwMCk7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgaC5wbHVnaW4uaW5zaWdodFNlcnZpY2UuZ2VuZXJhdGVNb250aGx5SW5zaWdodChcbiAgICAgICAgICAgICAgICAgICAgICAgICgpID0+IHt9LFxuICAgICAgICAgICAgICAgICAgICAgICAgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwoZG90c0ludGVydmFsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBoLmludmFsaWRhdGVUYWJDYWNoZSgncmV2aWV3Jyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaC5zd2l0Y2hUYWIoJ3JldmlldycpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1vbWVudChjYWxNb250aCksXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwoZG90c0ludGVydmFsKTtcbiAgICAgICAgICAgICAgICAgICAgZ2VuQnRuLnNldFRleHQodCgncmV2aWV3LmdlbmVyYXRlRmFpbGVkJykpO1xuICAgICAgICAgICAgICAgICAgICBnZW5CdG4uZGlzYWJsZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgZ2VuQnRuLnJlbW92ZUNsYXNzKCd0bC1kYXNoLWdlbmVyYXRlLWJ0bi1sb2FkaW5nJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gLS0tLSBQcmluY2lwbGVzICYgUGF0dGVybnMgLS0tLVxuICAgICAgICBsZXQgcHJpbmNpcGxlOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICAgICAgY29uc3QgcFBhdGggPSBgJHtoLnBsdWdpbi5zZXR0aW5ncy5hcmNoaXZlRm9sZGVyfS9wcmluY2lwbGVzLm1kYDtcbiAgICAgICAgY29uc3QgcEZpbGUgPSBoLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgocFBhdGgpO1xuICAgICAgICBpZiAocEZpbGUgJiYgcEZpbGUgaW5zdGFuY2VvZiBURmlsZSkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgaC5hcHAudmF1bHQucmVhZChwRmlsZSk7XG4gICAgICAgICAgICAgICAgY29uc3QgbGluZXMgPSBjb250ZW50LnNwbGl0KCdcXG4nKS5maWx0ZXIoKGw6IHN0cmluZykgPT4gbC5zdGFydHNXaXRoKCctICcpKS5tYXAoKGw6IHN0cmluZykgPT4gbC5zdWJzdHJpbmcoMikudHJpbSgpKTtcbiAgICAgICAgICAgICAgICBpZiAobGluZXMubGVuZ3RoKSBwcmluY2lwbGUgPSBsaW5lc1tNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBsaW5lcy5sZW5ndGgpXTtcbiAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBza2lwICovIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBwYXR0ZXJuOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICAgICAgY29uc3QgcHRQYXRoID0gYCR7aC5wbHVnaW4uc2V0dGluZ3MuYXJjaGl2ZUZvbGRlcn0vcGF0dGVybnMubWRgO1xuICAgICAgICBjb25zdCBwdEZpbGUgPSBoLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgocHRQYXRoKTtcbiAgICAgICAgaWYgKHB0RmlsZSAmJiBwdEZpbGUgaW5zdGFuY2VvZiBURmlsZSkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgaC5hcHAudmF1bHQucmVhZChwdEZpbGUpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGxpbmVzID0gY29udGVudC5zcGxpdCgnXFxuJykuZmlsdGVyKChsOiBzdHJpbmcpID0+IGwuc3RhcnRzV2l0aCgnLSAnKSkubWFwKChsOiBzdHJpbmcpID0+IGwuc3Vic3RyaW5nKDIpLnRyaW0oKSk7XG4gICAgICAgICAgICAgICAgaWYgKGxpbmVzLmxlbmd0aCkgcGF0dGVybiA9IGxpbmVzW2xpbmVzLmxlbmd0aCAtIDFdO1xuICAgICAgICAgICAgfSBjYXRjaCB7IC8qIHNraXAgKi8gfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHByaW5jaXBsZSB8fCBwYXR0ZXJuKSB7XG4gICAgICAgICAgICBjb25zdCBwcENhcmQgPSBwYW5lbC5jcmVhdGVEaXYoJ3RsLXB5cmFtaWQtbGF5ZXIgdGwtZGFzaC1jYXJkJyk7XG4gICAgICAgICAgICBjb25zdCBwcEhlYWRlciA9IHBwQ2FyZC5jcmVhdGVEaXYoJ3RsLXB5cmFtaWQtbGF5ZXItaGVhZGVyJyk7XG4gICAgICAgICAgICBwcEhlYWRlci5jcmVhdGVFbCgnc3BhbicsIHsgY2xzOiAndGwtcHlyYW1pZC1sYXllci1pY29uJywgdGV4dDogJ/CfkqEnIH0pO1xuICAgICAgICAgICAgcHBIZWFkZXIuY3JlYXRlRWwoJ3NwYW4nLCB7IGNsczogJ3RsLXB5cmFtaWQtbGF5ZXItdGl0bGUnLCB0ZXh0OiB0KCdyZXZpZXcucHJpbmNpcGxlc0FuZFBhdHRlcm5zJykgfSk7XG4gICAgICAgICAgICBjb25zdCBwcEJvZHkgPSBwcENhcmQuY3JlYXRlRGl2KCd0bC1kYXNoLWNhcmQtYm9keScpO1xuICAgICAgICAgICAgaWYgKHByaW5jaXBsZSkgcHBCb2R5LmNyZWF0ZUVsKCdibG9ja3F1b3RlJywgeyBjbHM6ICd0bC1kYXNoLXF1b3RlJywgdGV4dDogcHJpbmNpcGxlIH0pO1xuICAgICAgICAgICAgaWYgKHBhdHRlcm4pIHBwQm9keS5jcmVhdGVFbCgncCcsIHsgY2xzOiAndGwtZGFzaC1wYXR0ZXJuJywgdGV4dDogYPCflIQgJHtwYXR0ZXJufWAgfSk7XG4gICAgICAgIH1cbiAgICB9XG59XG4iXX0=