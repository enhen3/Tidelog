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

import AIFlowManagerPlugin from '../main';
import { KANBAN_VIEW_TYPE } from './kanban-view';
import { CALENDAR_VIEW_TYPE } from './calendar-view';

export const DASHBOARD_VIEW_TYPE = 'ai-flow-dashboard-view';

interface WeekProgress {
    totalTasks: number;
    completedTasks: number;
    days: { date: string; emotionScore: number | null; taskCount: number; completedCount: number }[];
}

export class DashboardView extends ItemView {
    private plugin: AIFlowManagerPlugin;
    private containerEl_: HTMLElement | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: AIFlowManagerPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return DASHBOARD_VIEW_TYPE; }
    getDisplayText(): string { return '仪表盘'; }
    getIcon(): string { return 'layout-dashboard'; }

    async onOpen(): Promise<void> {
        const container = this.contentEl;
        container.empty();
        container.addClass('af-dashboard-container');
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
        const titleBar = this.containerEl_.createDiv('af-dash-title-bar');
        titleBar.createEl('h2', { cls: 'af-dash-title', text: '📊 AI Flow 仪表盘' });

        const refreshBtn = titleBar.createEl('button', { cls: 'af-dash-refresh-btn', text: '刷新' });
        refreshBtn.addEventListener('click', () => this.render());

        const grid = this.containerEl_.createDiv('af-dash-grid');

        // Get data
        const weekProgress = await this.getWeekProgress();
        const principle = await this.getRandomPrinciple();
        const pattern = await this.getLatestPattern();

        // ---- Card 1: This Week Progress ----
        const progressCard = grid.createDiv('af-dash-card af-dash-card-progress');
        progressCard.createEl('h3', { text: '📋 本周进度' });

        const pct = weekProgress.totalTasks > 0
            ? Math.round((weekProgress.completedTasks / weekProgress.totalTasks) * 100)
            : 0;

        const progressInfo = progressCard.createDiv('af-dash-progress-info');
        progressInfo.createEl('span', {
            cls: 'af-dash-progress-number',
            text: `${weekProgress.completedTasks}/${weekProgress.totalTasks}`,
        });
        progressInfo.createEl('span', {
            cls: 'af-dash-progress-pct',
            text: `${pct}%`,
        });

        const barOuter = progressCard.createDiv('af-dash-progress-bar-outer');
        const barInner = barOuter.createDiv('af-dash-progress-bar-inner');
        barInner.style.width = `${pct}%`;

        // ---- Card 2: Emotion Trend (last 7 days) ----
        const emotionCard = grid.createDiv('af-dash-card af-dash-card-emotion');
        emotionCard.createEl('h3', { text: '💭 本周情绪' });

        const chart = emotionCard.createDiv('af-dash-chart');
        const today = moment();
        const dayLabels = ['一', '二', '三', '四', '五', '六', '日'];

        for (let i = 0; i < 7; i++) {
            const dayStart = moment(today).startOf('isoWeek').add(i, 'days');
            const dayData = weekProgress.days.find(d => d.date === dayStart.format('YYYY-MM-DD'));
            const barCol = chart.createDiv('af-dash-chart-col');

            const score = dayData?.emotionScore;
            const barH = score ? (score / 10) * 100 : 0;

            const barWrap = barCol.createDiv('af-dash-chart-bar-wrap');
            if (score) {
                const bar = barWrap.createDiv('af-dash-chart-bar');
                bar.style.height = `${barH}%`;
                // Color by score
                const hue = Math.round(((score - 1) / 9) * 120);
                bar.style.backgroundColor = `hsl(${hue}, 55%, 60%)`;

                barWrap.createEl('span', { cls: 'af-dash-chart-score', text: `${score}` });
            }

            barCol.createEl('span', {
                cls: `af-dash-chart-label ${dayStart.isSame(today, 'day') ? 'af-dash-chart-label-today' : ''}`,
                text: dayLabels[i],
            });
        }

        // ---- Card 3: Today's Principle ----
        const principleCard = grid.createDiv('af-dash-card af-dash-card-principle');
        principleCard.createEl('h3', { text: '💡 今日原则' });
        principleCard.createEl('blockquote', {
            cls: 'af-dash-quote',
            text: principle || '尚无原则数据。在聊天中积累原则吧！',
        });

        // ---- Card 4: Latest Pattern ----
        const patternCard = grid.createDiv('af-dash-card af-dash-card-pattern');
        patternCard.createEl('h3', { text: '🔄 活跃模式' });
        patternCard.createEl('p', {
            cls: 'af-dash-pattern',
            text: pattern || '尚无模式数据。持续使用后将自动发现行为模式。',
        });

        // ---- Quick Links ----
        const linksCard = grid.createDiv('af-dash-card af-dash-card-links');
        linksCard.createEl('h3', { text: '🚀 快速入口' });

        const linkGrid = linksCard.createDiv('af-dash-link-grid');

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
        const link = container.createDiv('af-dash-link');
        link.createEl('span', { cls: 'af-dash-link-icon', text: icon });
        link.createEl('span', { cls: 'af-dash-link-label', text: label });
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
        const path = `${this.plugin.settings.archiveFolder}/Insights/principles.md`;
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!file || !(file instanceof TFile)) return null;

        try {
            const content = await this.app.vault.read(file);
            const lines = content.split('\n')
                .filter(l => l.startsWith('- '))
                .map(l => l.substring(2).trim());
            if (lines.length === 0) return null;
            return lines[Math.floor(Math.random() * lines.length)];
        } catch {
            return null;
        }
    }

    private async getLatestPattern(): Promise<string | null> {
        const path = `${this.plugin.settings.archiveFolder}/Insights/patterns.md`;
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!file || !(file instanceof TFile)) return null;

        try {
            const content = await this.app.vault.read(file);
            const lines = content.split('\n')
                .filter(l => l.startsWith('- '))
                .map(l => l.substring(2).trim());
            return lines.length > 0 ? lines[lines.length - 1] : null;
        } catch {
            return null;
        }
    }
}
