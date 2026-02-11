/**
 * Review Renderer - Renders the Review tab (calendar + dashboard)
 * Extracted from chat-view.ts for maintainability.
 */

import { TFile, moment } from 'obsidian';
import type AIFlowManagerPlugin from '../main';
import type { App } from 'obsidian';

/** Minimal interface for the host view that owns this renderer. */
export interface ReviewHost {
    plugin: AIFlowManagerPlugin;
    app: App;
    calendarMonth: moment.Moment;
    parseNoteScores(content: string): number | null;
    switchTab(tab: string): void;
}

export class ReviewRenderer {
    constructor(private host: ReviewHost) { }

    async render(panel: HTMLElement): Promise<void> {
        panel.addClass('af-review-scroll');
        await this.renderReviewCalendar(panel);
        await this.renderReviewDashboard(panel);
    }

    // --- Calendar section ---

    private async renderReviewCalendar(panel: HTMLElement): Promise<void> {
        const h = this.host;
        const layer = panel.createDiv('af-pyramid-layer af-pyramid-review-cal');
        // Header
        const header = layer.createDiv('af-pyramid-layer-header af-cal-header');
        const prevBtn = header.createEl('button', { cls: 'af-cal-nav-btn', text: '‹' });
        prevBtn.addEventListener('click', () => {
            h.calendarMonth.subtract(1, 'month');
            h.switchTab('review');
        });
        header.createEl('span', { cls: 'af-cal-title', text: h.calendarMonth.format('YYYY年 M月') });
        const nextBtn = header.createEl('button', { cls: 'af-cal-nav-btn', text: '›' });
        nextBtn.addEventListener('click', () => {
            h.calendarMonth.add(1, 'month');
            h.switchTab('review');
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
        const folder = h.plugin.settings.dailyFolder;
        const yearMonth = h.calendarMonth.format('YYYY-MM');
        const files = h.app.vault.getFiles().filter(f => f.path.startsWith(folder + '/') && f.name.startsWith(yearMonth));

        interface CalData { emotionScore: number | null; taskCount: number; completedCount: number; status: string; filePath: string }
        const dataMap = new Map<string, CalData>();

        for (const file of files) {
            try {
                const content = await h.app.vault.read(file);
                const dm = file.name.match(/(\d{4}-\d{2}-\d{2})/);
                if (!dm) continue;
                const emotionScore = h.parseNoteScores(content);
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
        const firstDay = moment(h.calendarMonth).startOf('month');
        const startPad = firstDay.isoWeekday() - 1;
        for (let i = 0; i < startPad; i++) grid.createDiv('af-cal-cell af-cal-cell-empty');

        const daysInMonth = h.calendarMonth.daysInMonth();
        const todayStr = moment().format('YYYY-MM-DD');

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = moment(h.calendarMonth).date(d).format('YYYY-MM-DD');
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
                    const f = h.app.vault.getAbstractFileByPath(data.filePath);
                    if (f && f instanceof TFile) h.app.workspace.getLeaf().openFile(f);
                });
            }
        }
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
        const pPath = `${h.plugin.settings.archiveFolder}/principles.md`;
        const pFile = h.app.vault.getAbstractFileByPath(pPath);
        if (pFile && pFile instanceof TFile) {
            try {
                const content = await h.app.vault.read(pFile);
                const lines = content.split('\n').filter(l => l.startsWith('- ')).map(l => l.substring(2).trim());
                if (lines.length) principle = lines[Math.floor(Math.random() * lines.length)];
            } catch { /* skip */ }
        }
        insightBody.createEl('blockquote', { cls: 'af-dash-quote', text: principle || '尚无原则数据' });

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
