/**
 * Dashboard View - Self-contained dashboard with progress, emotion trend, principles, and links
 * No external plugin dependency (no Dataview).
 */

import {
    ItemView,
    WorkspaceLeaf,
    TFile,
    moment,
} from 'obsidian';

import TideLogPlugin from '../main';
import { KANBAN_VIEW_TYPE } from './kanban-view';
import { CALENDAR_VIEW_TYPE } from './calendar-view';

export const DASHBOARD_VIEW_TYPE = 'tl-dashboard-view';

interface WeekProgress {
    totalTasks: number;
    completedTasks: number;
    days: { date: string; emotionScore: number | null; taskCount: number; completedCount: number }[];
}

export class DashboardView extends ItemView {
    private plugin: TideLogPlugin;
    private containerEl_: HTMLElement | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: TideLogPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return DASHBOARD_VIEW_TYPE; }
    getDisplayText(): string { return '仪表盘'; }
    getIcon(): string { return 'layout-dashboard'; }

    async onOpen(): Promise<void> {
        const container = this.contentEl;
        container.empty();
        container.addClass('tl-dashboard-container');
        this.containerEl_ = container;
        await this.render();
    }

    async onClose(): Promise<void> {
        this.containerEl_ = null;
    }

    // =========================================================================
    // Render
    // =========================================================================

    private async render(): Promise<void> {
        if (!this.containerEl_) return;
        this.containerEl_.empty();

        // Title bar
        const titleBar = this.containerEl_.createDiv('tl-dash-title-bar');
        titleBar.createEl('h2', { cls: 'tl-dash-title', text: '📊 AI Flow 仪表盘' });

        const refreshBtn = titleBar.createEl('button', { cls: 'tl-dash-refresh-btn', text: '刷新' });
        refreshBtn.addEventListener('click', () => this.render());

        const grid = this.containerEl_.createDiv('tl-dash-grid');

        // Get data
        const weekProgress = await this.getWeekProgress();
        const principle = await this.getRandomPrinciple();
        const pattern = await this.getLatestPattern();

        // ---- Card 1: This Week Progress ----
        const progressCard = grid.createDiv('tl-dash-card tl-dash-card-progress');
        progressCard.createEl('h3', { text: '📋 本周进度' });

        const pct = weekProgress.totalTasks > 0
            ? Math.round((weekProgress.completedTasks / weekProgress.totalTasks) * 100)
            : 0;

        const progressInfo = progressCard.createDiv('tl-dash-progress-info');
        progressInfo.createEl('span', {
            cls: 'tl-dash-progress-number',
            text: `${weekProgress.completedTasks}/${weekProgress.totalTasks}`,
        });
        progressInfo.createEl('span', {
            cls: 'tl-dash-progress-pct',
            text: `${pct}%`,
        });

        const barOuter = progressCard.createDiv('tl-dash-progress-bar-outer');
        const barInner = barOuter.createDiv('tl-dash-progress-bar-inner');
        barInner.style.width = `${pct}%`;

        // ---- Card 2: Emotion Trend (last 7 days) ----
        const emotionCard = grid.createDiv('tl-dash-card tl-dash-card-emotion');
        emotionCard.createEl('h3', { text: '💭 本周情绪' });

        const chart = emotionCard.createDiv('tl-dash-chart');
        const today = moment();
        const dayLabels = ['一', '二', '三', '四', '五', '六', '日'];

        for (let i = 0; i < 7; i++) {
            const dayStart = moment(today).startOf('isoWeek').add(i, 'days');
            const dayData = weekProgress.days.find(d => d.date === dayStart.format('YYYY-MM-DD'));
            const barCol = chart.createDiv('tl-dash-chart-col');

            const score = dayData?.emotionScore;
            const barH = score ? (score / 10) * 100 : 0;

            const barWrap = barCol.createDiv('tl-dash-chart-bar-wrap');
            if (score) {
                const bar = barWrap.createDiv('tl-dash-chart-bar');
                bar.style.height = `${barH}%`;
                // Color by score
                const hue = Math.round(((score - 1) / 9) * 120);
                bar.style.backgroundColor = `hsl(${hue}, 55%, 60%)`;

                barWrap.createEl('span', { cls: 'tl-dash-chart-score', text: `${score}` });
            }

            barCol.createEl('span', {
                cls: `tl-dash-chart-label ${dayStart.isSame(today, 'day') ? 'tl-dash-chart-label-today' : ''}`,
                text: dayLabels[i],
            });
        }

        // ---- Card 3: Today's Principle ----
        const principleCard = grid.createDiv('tl-dash-card tl-dash-card-principle');
        principleCard.createEl('h3', { text: '💡 今日原则' });
        principleCard.createEl('blockquote', {
            cls: 'tl-dash-quote',
            text: principle || '尚无原则数据。在聊天中积累原则吧！',
        });

        // ---- Card 4: Latest Pattern ----
        const patternCard = grid.createDiv('tl-dash-card tl-dash-card-pattern');
        patternCard.createEl('h3', { text: '🔄 活跃模式' });
        patternCard.createEl('p', {
            cls: 'tl-dash-pattern',
            text: pattern || '尚无模式数据。持续使用后将自动发现行为模式。',
        });

        // ---- Quick Links ----
        const linksCard = grid.createDiv('tl-dash-card tl-dash-card-links');
        linksCard.createEl('h3', { text: '🚀 快速入口' });

        const linkGrid = linksCard.createDiv('tl-dash-link-grid');

        this.createQuickLink(linkGrid, '📝', '今日日记', async () => {
            const file = await this.plugin.vaultManager.getOrCreateDailyNote();
            this.app.workspace.getLeaf().openFile(file);
        });

        this.createQuickLink(linkGrid, '📅', '周计划', async () => {
            try {
                const ed = this.plugin.vaultManager.getEffectiveDate();
                const weekNum = `W${ed.format('ww')}`;
                const monthRef = ed.format('YYYY-MM');
                const tmpl = this.plugin.templateManager.getWeeklyPlanTemplate(weekNum, monthRef);
                const file = await this.plugin.vaultManager.getOrCreateWeeklyPlan(undefined, tmpl);
                this.app.workspace.getLeaf().openFile(file);
            } catch {
                // ignore
            }
        });

        this.createQuickLink(linkGrid, '📆', '月计划', async () => {
            try {
                const ed = this.plugin.vaultManager.getEffectiveDate();
                const ym = ed.format('YYYY-MM');
                const tmpl = this.plugin.templateManager.getMonthlyPlanTemplate(ym);
                const file = await this.plugin.vaultManager.getOrCreateMonthlyPlan(undefined, tmpl);
                this.app.workspace.getLeaf().openFile(file);
            } catch {
                // ignore
            }
        });

        this.createQuickLink(linkGrid, '📊', '看板', () => {
            this.app.workspace.getLeaf(true).setViewState({ type: KANBAN_VIEW_TYPE, active: true });
        });

        this.createQuickLink(linkGrid, '🗓️', '日历', () => {
            this.app.workspace.getLeaf(true).setViewState({ type: CALENDAR_VIEW_TYPE, active: true });
        });
    }

    private createQuickLink(container: HTMLElement, icon: string, label: string, onClick: () => void): void {
        const link = container.createDiv('tl-dash-link');
        link.createEl('span', { cls: 'tl-dash-link-icon', text: icon });
        link.createEl('span', { cls: 'tl-dash-link-label', text: label });
        link.addEventListener('click', onClick);
    }

    // =========================================================================
    // Data
    // =========================================================================

    private async getWeekProgress(): Promise<WeekProgress> {
        const result: WeekProgress = { totalTasks: 0, completedTasks: 0, days: [] };
        const folder = this.plugin.settings.dailyFolder;
        const weekStart = moment().startOf('isoWeek');

        for (let i = 0; i < 7; i++) {
            const d = moment(weekStart).add(i, 'days');
            const dateStr = d.format('YYYY-MM-DD');
            const path = `${folder}/${dateStr}.md`;
            const file = this.app.vault.getAbstractFileByPath(path);

            let emotionScore: number | null = null;
            let taskCount = 0;
            let completedCount = 0;

            if (file && file instanceof TFile) {
                try {
                    const content = await this.app.vault.read(file);

                    // Parse YAML
                    if (content.startsWith('---')) {
                        const endIdx = content.indexOf('---', 3);
                        if (endIdx > 0) {
                            const yaml = content.substring(4, endIdx);
                            const em = yaml.match(/emotion_score:\s*(\d+)/);
                            if (em) emotionScore = parseInt(em[1], 10);
                        }
                    }

                    // Count tasks
                    const allTasks = content.match(/^- \[[ x]\] /gm);
                    const doneTasks = content.match(/^- \[x\] /gm);
                    taskCount = allTasks ? allTasks.length : 0;
                    completedCount = doneTasks ? doneTasks.length : 0;
                } catch {
                    // Skip
                }
            }

            result.totalTasks += taskCount;
            result.completedTasks += completedCount;
            result.days.push({ date: dateStr, emotionScore, taskCount, completedCount });
        }

        return result;
    }

    private async getRandomPrinciple(): Promise<string | null> {
        return (await this.plugin.dashboardService.getRandomPrinciple()) || null;
    }

    private async getLatestPattern(): Promise<string | null> {
        return (await this.plugin.dashboardService.getLatestPattern()) || null;
    }
}
