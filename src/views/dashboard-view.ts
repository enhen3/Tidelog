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
import { t } from '../i18n';
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
    getDisplayText(): string { return t('dash.title').replace('📊 ', ''); }
    getIcon(): string { return 'layout-dashboard'; }

    async onOpen(): Promise<void> {
        const container = this.contentEl;
        container.empty();
        container.addClass('tl-dashboard-container');
        this.containerEl_ = container;

        // Pro gate
        if (!this.plugin.licenseManager.isPro()) {
            this.renderProLocked(container, t('view.dashboardDisplayText'));
            return;
        }

        await this.render();
    }

    /**
     * Render locked state for Free users
     */
    private renderProLocked(container: HTMLElement, featureName: string): void {
        const locked = container.createDiv('tl-pro-locked-view');
        locked.createEl('div', { cls: 'tl-pro-locked-icon', text: '🔒' });
        locked.createEl('h3', { cls: 'tl-pro-locked-title', text: `🔒 ${featureName}` });
        locked.createEl('p', { cls: 'tl-pro-locked-desc', text: t('settings.purchaseDesc') });

        const purchaseUrl = this.plugin.licenseManager.getPurchaseUrl();
        const btnGroup = locked.createDiv('tl-pro-locked-buttons');
        const buyBtn = btnGroup.createEl('a', {
            cls: 'tl-pro-cta-btn tl-pro-cta-cn',
            text: t('pro.purchase'),
            href: purchaseUrl,
        });
        buyBtn.setAttr('target', '_blank');
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
        titleBar.createEl('h2', { cls: 'tl-dash-title', text: t('dash.title') });

        const refreshBtn = titleBar.createEl('button', { cls: 'tl-dash-refresh-btn', text: t('dash.refresh') });
        refreshBtn.addEventListener('click', () => { void this.render(); });

        const grid = this.containerEl_.createDiv('tl-dash-grid');

        // Get data
        const weekProgress = await this.getWeekProgress();
        const principle = await this.getRandomPrinciple();
        const pattern = await this.getLatestPattern();

        // ---- Card 0: Today Focus ----
        const todayStr = moment().format('YYYY-MM-DD');
        const todayData = weekProgress.days.find(d => d.date === todayStr);
        const focusCard = grid.createDiv('tl-dash-card tl-dash-card-focus');
        focusCard.createEl('h3', { text: t('dash.todayFocus') });
        const focusBody = focusCard.createDiv('tl-dash-focus-body');

        // Today's tasks
        const todayFile = this.app.vault.getAbstractFileByPath(
            `${this.plugin.settings.dailyFolder}/${todayStr}.md`
        );
        interface FocusTask { text: string; done: boolean }
        const todayTasks: FocusTask[] = [];

        if (todayFile && todayFile instanceof TFile) {
            try {
                const content = await this.app.vault.read(todayFile);
                for (const line of content.split('\n')) {
                    const m = line.match(/^- \[([ x])\] (.+)$/);
                    if (m) todayTasks.push({ done: m[1] === 'x', text: m[2].trim() });
                }
            } catch { /* skip */ }
        }

        if (todayTasks.length > 0) {
            const doneCount = todayTasks.filter(t => t.done).length;
            const focusStats = focusBody.createDiv('tl-dash-focus-stats');
            focusStats.createEl('span', { text: t('dash.taskCount', String(doneCount), String(todayTasks.length)) });
            if (todayData?.emotionScore) {
                focusStats.createEl('span', { text: `  ${t('dash.emotionScore', String(todayData.emotionScore))}` });
            }

            // Carry-forward count
            try {
                const unfinished = await this.plugin.vaultManager.getUnfinishedTasks(3);
                const todayTexts = new Set(todayTasks.map(t => t.text));
                const carryCount = unfinished.filter(u => !todayTexts.has(u.text)).length;
                if (carryCount > 0) {
                    focusStats.createEl('span', { cls: 'tl-dash-focus-carry', text: `  ${t('dash.carryForward', String(carryCount))}` });
                }
            } catch { /* skip */ }

            // Task mini-list (top 5)
            const taskList = focusBody.createDiv('tl-dash-focus-tasks');
            for (const task of todayTasks.slice(0, 5)) {
                const row = taskList.createDiv(`tl-dash-focus-task ${task.done ? 'tl-dash-focus-task-done' : ''}`);
                row.createEl('span', { text: task.done ? '✓' : '○', cls: 'tl-dash-focus-check' });
                row.createEl('span', { text: task.text });
            }
            if (todayTasks.length > 5) {
                taskList.createEl('span', { cls: 'tl-dash-focus-more', text: t('dash.moreItems', String(todayTasks.length - 5)) });
            }
        } else {
            focusBody.createEl('p', { cls: 'tl-dash-focus-empty', text: t('dash.noPlan') });
        }

        // ---- Card 1: This Week Progress ----
        const progressCard = grid.createDiv('tl-dash-card tl-dash-card-progress');
        progressCard.createEl('h3', { text: t('dash.weekProgress') });

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
        const barInner = barOuter.createDiv('tl-dash-progress-bar-inner tl-dynamic-width');
        barInner.style.setProperty('--tl-width', `${pct}%`);

        // ---- Card 2: Emotion Trend (last 7 days) ----
        const emotionCard = grid.createDiv('tl-dash-card tl-dash-card-emotion');
        emotionCard.createEl('h3', { text: t('dash.weekEmotion') });

        const chart = emotionCard.createDiv('tl-dash-chart');
        const today = moment();
        const dayLabels = t('dash.weekdaysShort').split(',');

        for (let i = 0; i < 7; i++) {
            const dayStart = moment(today).startOf('isoWeek').add(i, 'days');
            const dayData = weekProgress.days.find(d => d.date === dayStart.format('YYYY-MM-DD'));
            const barCol = chart.createDiv('tl-dash-chart-col');

            const score = dayData?.emotionScore;
            const barH = score ? (score / 10) * 100 : 0;

            const barWrap = barCol.createDiv('tl-dash-chart-bar-wrap');
            if (score) {
                const bar = barWrap.createDiv('tl-dash-chart-bar tl-dynamic-height tl-dynamic-bg');
                bar.style.setProperty('--tl-height', `${barH}%`);
                // Color by score
                const hue = Math.round(((score - 1) / 9) * 120);
                bar.style.setProperty('--tl-bg', `hsl(${hue}, 55%, 60%)`);

                barWrap.createEl('span', { cls: 'tl-dash-chart-score', text: `${score}` });
            }

            barCol.createEl('span', {
                cls: `tl-dash-chart-label ${dayStart.isSame(today, 'day') ? 'tl-dash-chart-label-today' : ''}`,
                text: dayLabels[i],
            });
        }

        // ---- Card 3: Today's Principle ----
        const principleCard = grid.createDiv('tl-dash-card tl-dash-card-principle');
        principleCard.createEl('h3', { text: t('dash.todayPrinciple') });
        principleCard.createEl('blockquote', {
            cls: 'tl-dash-quote',
            text: principle || t('dash.noPrinciple'),
        });

        // ---- Card 4: Latest Pattern ----
        const patternCard = grid.createDiv('tl-dash-card tl-dash-card-pattern');
        patternCard.createEl('h3', { text: t('dash.activePattern') });
        patternCard.createEl('p', {
            cls: 'tl-dash-pattern',
            text: pattern || t('dash.noPattern'),
        });

        // ---- Quick Links ----
        const linksCard = grid.createDiv('tl-dash-card tl-dash-card-links');
        linksCard.createEl('h3', { text: t('dash.quickLinks') });

        const linkGrid = linksCard.createDiv('tl-dash-link-grid');

        this.createQuickLink(linkGrid, '📝', t('dash.linkDiary'), () => {
            void (async () => {
                const file = await this.plugin.vaultManager.getOrCreateDailyNote();
                void this.app.workspace.getLeaf().openFile(file);
            })();
        });

        this.createQuickLink(linkGrid, '📅', t('dash.linkWeekly'), () => {
            void (async () => {
                try {
                    const ed = this.plugin.vaultManager.getEffectiveDate();
                    const weekNum = `W${ed.format('ww')}`;
                    const monthRef = ed.format('YYYY-MM');
                    const tmpl = this.plugin.templateManager.getWeeklyPlanTemplate(weekNum, monthRef);
                    const file = await this.plugin.vaultManager.getOrCreateWeeklyPlan(undefined, tmpl);
                    void this.app.workspace.getLeaf().openFile(file);
                } catch {
                    // ignore
                }
            })();
        });

        this.createQuickLink(linkGrid, '📆', t('dash.linkMonthly'), () => {
            void (async () => {
                try {
                    const ed = this.plugin.vaultManager.getEffectiveDate();
                    const ym = ed.format('YYYY-MM');
                    const tmpl = this.plugin.templateManager.getMonthlyPlanTemplate(ym);
                    const file = await this.plugin.vaultManager.getOrCreateMonthlyPlan(undefined, tmpl);
                    void this.app.workspace.getLeaf().openFile(file);
                } catch {
                    // ignore
                }
            })();
        });

        this.createQuickLink(linkGrid, '📊', t('dash.linkKanban'), () => {
            void this.app.workspace.getLeaf(true).setViewState({ type: KANBAN_VIEW_TYPE, active: true });
        });

        this.createQuickLink(linkGrid, '🗓️', t('dash.linkCalendar'), () => {
            void this.app.workspace.getLeaf(true).setViewState({ type: CALENDAR_VIEW_TYPE, active: true });
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
