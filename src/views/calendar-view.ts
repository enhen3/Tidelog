/**
 * Calendar View - Built-in calendar heatmap with emotion score and task density
 * No external plugin dependency — pure HTML/CSS rendering.
 */

import {
    ItemView,
    WorkspaceLeaf,
    TFile,
    moment,
} from 'obsidian';

import TideLogPlugin from '../main';
import { t, getLanguage } from '../i18n';

export const CALENDAR_VIEW_TYPE = 'tl-calendar-view';

interface DayCellData {
    date: moment.Moment;
    emotionScore: number | null;
    taskCount: number;
    completedCount: number;
    status: string;
    filePath: string | null;
}

export class CalendarView extends ItemView {
    private plugin: TideLogPlugin;
    private containerEl_: HTMLElement | null = null;
    private currentMonth: moment.Moment = moment();

    constructor(leaf: WorkspaceLeaf, plugin: TideLogPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return CALENDAR_VIEW_TYPE; }
    getDisplayText(): string { return t('cal.displayText'); }
    getIcon(): string { return 'calendar-days'; }

    async onOpen(): Promise<void> {
        const container = this.contentEl;
        container.empty();
        container.addClass('tl-calendar-container');
        this.containerEl_ = container;

        // Pro gate
        if (!this.plugin.licenseManager.isPro()) {
            this.renderProLocked(container, t('cal.heatmap'));
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
        locked.createEl('h3', { cls: 'tl-pro-locked-title', text: t('pro.featureTitle', featureName) });
        locked.createEl('p', { cls: 'tl-pro-locked-desc', text: t('pro.calendarDesc') });

        const urls = this.plugin.licenseManager.getPurchaseUrls();
        const btnGroup = locked.createDiv('tl-pro-locked-buttons');
        const cnBtn = btnGroup.createEl('a', {
            cls: 'tl-pro-cta-btn tl-pro-cta-cn',
            text: t('pro.mianbaoduo'),
            href: urls.mianbaoduo,
        });
        cnBtn.setAttr('target', '_blank');
        const intlBtn = btnGroup.createEl('a', {
            cls: 'tl-pro-cta-btn tl-pro-cta-intl',
            text: '🌍 Gumroad',
            href: urls.gumroad,
        });
        intlBtn.setAttr('target', '_blank');
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

        // Header
        const header = this.containerEl_.createDiv('tl-cal-header');

        const prevBtn = header.createEl('button', { cls: 'tl-cal-nav-btn', text: '‹' });
        prevBtn.addEventListener('click', () => {
            this.currentMonth.subtract(1, 'month');
            void this.render();
        });

        header.createEl('span', {
            cls: 'tl-cal-title',
            text: getLanguage() === 'en' ? this.currentMonth.format('MMMM YYYY') : this.currentMonth.format('YYYY年 M月'),
        });

        const nextBtn = header.createEl('button', { cls: 'tl-cal-nav-btn', text: '›' });
        nextBtn.addEventListener('click', () => {
            this.currentMonth.add(1, 'month');
            void this.render();
        });

        // Legend
        const legend = this.containerEl_.createDiv('tl-cal-legend');
        legend.createEl('span', { cls: 'tl-cal-legend-item', text: t('cal.legend') });
        const gradient = legend.createDiv('tl-cal-legend-gradient');
        gradient.createEl('span', { text: t('cal.low') });
        gradient.createEl('div', { cls: 'tl-cal-gradient-bar' });
        gradient.createEl('span', { text: t('cal.high') });

        // Day-of-week header
        const weekdays = t('cal.weekdays').split(',');
        const grid = this.containerEl_.createDiv('tl-cal-grid');

        for (const wd of weekdays) {
            grid.createEl('div', { cls: 'tl-cal-weekday', text: wd });
        }

        // Get data for this month
        const monthData = await this.getMonthData();

        // Determine grid start (pad preceding days)
        const firstDay = moment(this.currentMonth).startOf('month');
        const startPad = (firstDay.isoWeekday() - 1); // Mon=0

        for (let i = 0; i < startPad; i++) {
            grid.createDiv('tl-cal-cell tl-cal-cell-empty');
        }

        const daysInMonth = this.currentMonth.daysInMonth();
        const today = moment().format('YYYY-MM-DD');

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = moment(this.currentMonth).date(d).format('YYYY-MM-DD');
            const data = monthData.get(dateStr);
            const isToday = dateStr === today;

            const cell = grid.createDiv(`tl-cal-cell ${isToday ? 'tl-cal-cell-today' : ''}`);

            // Date number
            cell.createEl('div', { cls: 'tl-cal-date', text: `${d}` });

            // Emotion heatmap background
            if (data?.emotionScore !== undefined && data.emotionScore !== null) {
                const color = this.emotionToColor(data.emotionScore);
                cell.addClass('tl-dynamic-bg');
                cell.style.setProperty('--tl-bg', color);
            }

            // Task density dots
            if (data && data.taskCount > 0) {
                const dots = cell.createDiv('tl-cal-dots');
                const total = Math.min(data.taskCount, 5);
                for (let i = 0; i < total; i++) {
                    const dot = dots.createEl('span', { cls: 'tl-cal-dot' });
                    if (data.completedCount > i) {
                        dot.addClass('tl-cal-dot-done');
                    }
                }
            }

            // Status badge
            if (data?.status === 'completed') {
                cell.createEl('div', { cls: 'tl-cal-status-badge tl-cal-status-done', text: '✓' });
            }

            // Click to open daily note
            if (data?.filePath) {
                cell.addClass('tl-cal-cell-clickable');
                cell.addEventListener('click', () => {
                    const file = this.app.vault.getAbstractFileByPath(data.filePath!);
                    if (file instanceof TFile) {
                        const leaf = this.app.workspace.getLeaf();
                        void leaf.openFile(file);
                    }
                });
            }
        }
    }

    // =========================================================================
    // Data
    // =========================================================================

    private async getMonthData(): Promise<Map<string, DayCellData>> {
        const map = new Map<string, DayCellData>();
        const folder = this.plugin.settings.dailyFolder;
        const yearMonth = this.currentMonth.format('YYYY-MM');

        // List all files in the daily folder
        const dailyFolder = this.app.vault.getAbstractFileByPath(folder);
        if (!dailyFolder) return map;

        const files = this.app.vault.getFiles().filter(f =>
            f.path.startsWith(folder + '/') && f.name.startsWith(yearMonth)
        );

        for (const file of files) {
            try {
                const content = await this.app.vault.read(file);
                const dateMatch = file.name.match(/(\d{4}-\d{2}-\d{2})/);
                if (!dateMatch) continue;

                const dateStr = dateMatch[1];
                const data = this.parseYAMLData(content, dateStr, file.path);
                map.set(dateStr, data);
            } catch {
                // Skip unreadable files
            }
        }

        return map;
    }

    private parseYAMLData(content: string, dateStr: string, filePath: string): DayCellData {
        let emotionScore: number | null = null;
        let status = 'todo';

        // Parse YAML frontmatter
        if (content.startsWith('---')) {
            const endIdx = content.indexOf('---', 3);
            if (endIdx > 0) {
                const yaml = content.substring(4, endIdx);
                const emotionMatch = yaml.match(/emotion_score:\s*(\d+)/);
                if (emotionMatch) {
                    emotionScore = parseInt(emotionMatch[1], 10);
                }
                const statusMatch = yaml.match(/status:\s*(\S+)/);
                if (statusMatch) {
                    status = statusMatch[1];
                }
            }
        }

        // Count tasks
        const taskMatches = content.match(/^- \[[ x]\] /gm);
        const doneMatches = content.match(/^- \[x\] /gm);
        const taskCount = taskMatches ? taskMatches.length : 0;
        const completedCount = doneMatches ? doneMatches.length : 0;

        return {
            date: moment(dateStr),
            emotionScore,
            taskCount,
            completedCount,
            status,
            filePath,
        };
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Map emotion score (1-10) to a color (red → yellow → green)
     */
    private emotionToColor(score: number): string {
        const clamped = Math.max(1, Math.min(10, score));
        const normalized = (clamped - 1) / 9; // 0 to 1

        // HSL: red=0, yellow=60, green=120
        const hue = Math.round(normalized * 120);
        return `hsla(${hue}, 55%, 75%, 0.35)`;
    }
}
