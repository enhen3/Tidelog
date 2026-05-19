/**
 * Insights Renderer - weekly/monthly reports and profile analysis.
 */

import { MarkdownRenderer, TFile, TFolder, moment, Platform } from 'obsidian';
import type TideLogPlugin from '../main';
import type { App, Component } from 'obsidian';
import { t, getLanguage } from '../i18n';
import { ProModal } from './pro-modal';
import { loadDayLoopData } from './loop-utils';

export type InsightsMode = 'weekly' | 'monthly' | 'profile';

interface PeriodTarget {
    ref: moment.Moment;
    title: string;
    subtitle: string;
    start: moment.Moment;
    end: moment.Moment;
    timeReached: boolean;
    catchUp: boolean;
}

interface ReportStatus {
    existingFile: TFile | null;
    loops: number;
    target: PeriodTarget;
    isStale: boolean;
    latestInputMtime: number;
    reportMtime: number;
}

export interface InsightsHost extends Component {
    plugin: TideLogPlugin;
    app: App;
    insightsMode: InsightsMode;
    switchTab(tab: string): void;
    invalidateTabCache(tab: string): void;
}

export class InsightsRenderer {
    constructor(private host: InsightsHost) { }

    async render(panel: HTMLElement): Promise<void> {
        panel.addClass('tl-insights');
        if (Platform.isMobile) panel.addClass('is-mobile');

        if (!this.host.plugin.licenseManager.isPro()) {
            this.renderLocked(panel);
            return;
        }

        const body = panel.createDiv('tl-insights-body');
        if (this.host.insightsMode === 'weekly') {
            await this.renderWeekly(body);
        } else if (this.host.insightsMode === 'monthly') {
            await this.renderMonthly(body);
        } else {
            await this.renderProfile(body);
        }
    }

    private renderLocked(panel: HTMLElement): void {
        const card = panel.createDiv('tl-insights-card tl-insights-locked');
        card.createDiv({ cls: 'tl-insights-card-title', text: t('insights.lockedTitle') });
        card.createDiv({ cls: 'tl-insights-card-desc', text: t('insights.lockedDesc') });
        const btn = card.createEl('button', {
            cls: 'tl-insights-primary-btn',
            text: t('settings.reviewUpgradeBtn'),
            attr: { type: 'button' },
        });
        btn.addEventListener('click', () => {
            new ProModal(this.host.app, t('chat.tabInsights'), this.host.plugin.licenseManager).open();
        });
    }

    private async renderWeekly(body: HTMLElement): Promise<void> {
        const status = await this.getWeeklyStatus();
        await this.renderReportCard(body, {
            kind: 'weekly',
            title: status.target.title,
            subtitle: status.target.subtitle,
            minLoops: 3,
            status,
            generateLabel: t('insights.generateWeekly'),
        });
    }

    private async renderMonthly(body: HTMLElement): Promise<void> {
        const status = await this.getMonthlyStatus();
        await this.renderReportCard(body, {
            kind: 'monthly',
            title: status.target.title,
            subtitle: status.target.subtitle,
            minLoops: 8,
            status,
            generateLabel: t('insights.generateMonthly'),
        });
    }

    private async renderReportCard(
        body: HTMLElement,
        opts: {
            kind: 'weekly' | 'monthly';
            title: string;
            subtitle: string;
            minLoops: number;
            status: ReportStatus;
            generateLabel: string;
        },
    ): Promise<void> {
        const card = body.createDiv('tl-insights-card');
        const header = card.createDiv('tl-insights-card-header');
        const titleWrap = header.createDiv('tl-insights-card-title-wrap');
        titleWrap.createDiv({ cls: 'tl-insights-card-title', text: opts.title });
        titleWrap.createDiv({ cls: 'tl-insights-card-subtitle', text: opts.subtitle });

        const remaining = Math.max(0, opts.minLoops - opts.status.loops);
        this.renderUnlockTrack(card, opts.status.loops, opts.minLoops);

        const notice = card.createDiv('tl-insights-notice');
        const btn = card.createEl('button', {
            cls: 'tl-insights-primary-btn',
            attr: { type: 'button' },
        });
        const isUnlocked = remaining === 0;

        if (opts.status.existingFile) {
            const previewEl = await this.renderReportPreview(card, opts.status.existingFile);
            card.insertBefore(previewEl, notice);
            notice.addClass('tl-hidden');
            btn.setText(t('insights.openFullReport'));
            btn.addClass('tl-insights-open-doc-btn');
            btn.addEventListener('click', () => {
                if (opts.status.existingFile) void this.host.app.workspace.getLeaf().openFile(opts.status.existingFile);
            });
            if (opts.status.isStale) {
                notice.removeClass('tl-hidden');
                notice.addClass('tl-insights-notice-stale');
                notice.setText(t('insights.newDataNotice'));
                const updateBtn = card.createEl('button', {
                    cls: 'tl-insights-primary-btn tl-insights-primary-btn-ready tl-insights-primary-btn-update',
                    text: opts.kind === 'weekly' ? t('insights.updateWeekly') : t('insights.updateMonthly'),
                    attr: { type: 'button' },
                });
                updateBtn.addEventListener('click', () => {
                    void this.generateReport(opts.kind, opts.status.target.ref, card, updateBtn, notice, { force: true });
                });
            }
            return;
        }

        if (!isUnlocked) {
            notice.addClass('tl-hidden');
            btn.setText(this.getLockedActionText(opts.kind, remaining));
            btn.disabled = true;
            return;
        }

        notice.addClass('tl-hidden');
        btn.setText(opts.generateLabel);
        btn.addClass('tl-insights-primary-btn-ready');
        btn.addEventListener('click', () => {
            void this.generateReport(opts.kind, opts.status.target.ref, card, btn, notice);
        });
    }

    private async renderReportPreview(card: HTMLElement, file: TFile): Promise<HTMLElement> {
        const previewEl = card.createDiv('tl-insights-report-preview');
        previewEl.createDiv({ cls: 'tl-insights-report-preview-kicker', text: t('insights.reportPreviewKicker') });
        const bodyEl = previewEl.createDiv('tl-insights-report-preview-body');

        try {
            const content = await this.host.app.vault.cachedRead(file);
            const preview = this.buildReportPreview(content);
            if (preview.trim()) {
                await MarkdownRenderer.render(this.host.app, preview, bodyEl, file.path, this.host);
            } else {
                bodyEl.setText(t('insights.reportPreviewFallback'));
            }
        } catch {
            bodyEl.setText(t('insights.reportPreviewFallback'));
        }

        return previewEl;
    }

    private buildReportPreview(content: string): string {
        const clean = content
            .replace(/^---[\s\S]*?---\s*/m, '')
            .replace(/<profile_update>[\s\S]*?<\/profile_update>/g, '')
            .replace(/<new_patterns>[\s\S]*?<\/new_patterns>/g, '')
            .replace(/<new_principles>[\s\S]*?<\/new_principles>/g, '')
            .trim();

        if (!clean) return '';

        const lines = clean.split(/\r?\n/);
        const output: string[] = [];
        let titleSeen = false;
        let sectionCount = 0;
        let currentSectionLines = 0;
        let introLines = 0;

        for (const line of lines) {
            const trimmed = line.trim();
            const isTitle = /^#\s+/.test(trimmed);
            const isSection = /^#{2,3}\s+/.test(trimmed);

            if (isTitle && !titleSeen) {
                output.push(line);
                titleSeen = true;
                continue;
            }

            if (isTitle && titleSeen) continue;

            if (isSection) {
                sectionCount++;
                if (sectionCount > 3) break;
                currentSectionLines = 0;
                if (output.length > 0 && output[output.length - 1] !== '') output.push('');
                output.push(line);
                continue;
            }

            if (sectionCount === 0) {
                if (!trimmed) {
                    if (output.length > 0 && output[output.length - 1] !== '') output.push('');
                    continue;
                }
                if (introLines >= 5) continue;
                output.push(line);
                introLines++;
                continue;
            }

            if (currentSectionLines >= 7) continue;
            output.push(line);
            if (trimmed) currentSectionLines++;
        }

        return output.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    }

    private getLockedActionText(kind: 'weekly' | 'monthly', remaining: number): string {
        return kind === 'weekly'
            ? t('insights.weeklyLockedAction', String(remaining))
            : t('insights.monthlyLockedAction', String(remaining));
    }

    private renderUnlockTrack(card: HTMLElement, loops: number, minLoops: number): void {
        const track = card.createDiv('tl-insights-unlock-track');
        const dots = track.createDiv('tl-insights-unlock-dots');
        const activeCount = Math.min(loops, minLoops);
        for (let i = 0; i < minLoops; i++) {
            dots.createSpan({
                cls: `tl-insights-unlock-dot ${i < activeCount ? 'tl-insights-unlock-dot-active' : ''} ${i === activeCount - 1 && activeCount < minLoops ? 'tl-insights-unlock-dot-latest' : ''}`,
            });
        }

        const remaining = Math.max(0, minLoops - loops);
        const label = remaining === 0
            ? t('insights.unlockReady')
            : t('insights.unlockProgress', String(activeCount), String(minLoops), String(remaining));
        track.setAttr('aria-label', label);
    }

    private async renderProfile(body: HTMLElement): Promise<void> {
        const card = body.createDiv('tl-insights-card');
        const monthKey = moment().format('YYYY-MM');
        const existing = this.findProfileFileForMonth(monthKey);

        const header = card.createDiv('tl-insights-card-header');
        const titleWrap = header.createDiv('tl-insights-card-title-wrap');
        titleWrap.createDiv({ cls: 'tl-insights-card-title', text: t('insights.profileTitle') });
        titleWrap.createDiv({ cls: 'tl-insights-card-subtitle', text: t('insights.profileSubtitle', monthKey) });

        const notice = card.createDiv('tl-insights-notice');
        const btn = card.createEl('button', {
            cls: 'tl-insights-primary-btn',
            attr: { type: 'button' },
        });

        if (existing) {
            const previewEl = await this.renderReportPreview(card, existing);
            card.insertBefore(previewEl, notice);
            notice.addClass('tl-hidden');
            btn.setText(t('insights.openFullReport'));
            btn.addClass('tl-insights-open-doc-btn');
            btn.addEventListener('click', () => {
                if (existing) void this.host.app.workspace.getLeaf().openFile(existing);
            });
            return;
        }

        notice.addClass('tl-hidden');
        btn.setText(t('insights.generateProfile'));
        btn.addClass('tl-insights-primary-btn-ready');
        btn.addEventListener('click', () => {
            void this.generateProfile(card, btn, notice);
        });
    }

    private async generateReport(
        kind: 'weekly' | 'monthly',
        target: moment.Moment,
        card: HTMLElement,
        btn: HTMLButtonElement,
        notice: HTMLElement,
        options: { force?: boolean } = {},
    ): Promise<void> {
        btn.disabled = true;
        btn.addClass('tl-insights-primary-btn-loading');
        btn.empty();
        btn.createSpan('tl-insights-spinner');
        btn.createSpan({ cls: 'tl-insights-loading-label', text: t('insights.generatingEstimate') });
        notice.removeClass('tl-hidden');
        notice.setText(t('insights.generatingHint'));
        const stream = card.createDiv('tl-insights-stream');
        let fullContent = '';

        const onChunk = (chunk: string) => {
            fullContent += chunk;
            stream.empty();
            void MarkdownRenderer.render(this.host.app, fullContent, stream, '', this.host);
        };
        const onComplete = () => {
            notice.setText(t('insights.generated'));
            this.host.invalidateTabCache('review');
            this.host.switchTab('review');
        };

        if (kind === 'weekly') {
            await this.host.plugin.insightService.generateWeeklyInsight(onChunk, onComplete, target, options);
        } else {
            await this.host.plugin.insightService.generateMonthlyInsight(onChunk, onComplete, target, options);
        }

        this.host.plugin.planSuggestionService.refreshAfterInsight(kind, target).catch(err => {
            console.error('[Insights] Failed to refresh plan suggestions:', err);
        });
    }

    private async generateProfile(card: HTMLElement, btn: HTMLButtonElement, notice: HTMLElement): Promise<void> {
        btn.disabled = true;
        btn.addClass('tl-insights-primary-btn-loading');
        btn.empty();
        btn.createSpan('tl-insights-spinner');
        btn.createSpan({ cls: 'tl-insights-loading-label', text: t('insights.generatingEstimate') });
        notice.removeClass('tl-hidden');
        notice.setText(t('insights.generatingHint'));
        const stream = card.createDiv('tl-insights-stream');
        let fullContent = '';

        await this.host.plugin.insightService.generateProfileSuggestions(
            (chunk: string) => {
                fullContent += chunk;
                const displayContent = fullContent
                    .replace(/<profile_update>[\s\S]*?<\/profile_update>/g, '')
                    .replace(/<new_patterns>[\s\S]*?<\/new_patterns>/g, '')
                    .replace(/<new_principles>[\s\S]*?<\/new_principles>/g, '')
                    .trim();
                stream.empty();
                void MarkdownRenderer.render(this.host.app, displayContent, stream, '', this.host);
            },
            () => {
                notice.setText(t('insights.generated'));
                this.host.invalidateTabCache('review');
                this.host.switchTab('review');
            },
        );
    }

    private async getWeeklyStatus(): Promise<ReportStatus> {
        const today = moment();
        const current = this.buildWeeklyTarget(today, today.isoWeekday() === 7, false);
        const currentFile = this.findWeeklyReport(current.ref);
        const currentLoops = await this.countFullLoops(current.start, current.end);
        if (currentFile || current.timeReached) {
            return await this.withReportFreshness({
                existingFile: currentFile,
                loops: currentLoops,
                target: current,
            }, 'weekly');
        }

        const previousRef = today.clone().subtract(1, 'week');
        const previous = this.buildWeeklyTarget(previousRef, true, true);
        const previousFile = this.findWeeklyReport(previous.ref);
        const previousLoops = await this.countFullLoops(previous.start, previous.end);
        if (!previousFile && previousLoops >= 3) {
            return await this.withReportFreshness({ existingFile: null, loops: previousLoops, target: previous }, 'weekly');
        }

        return await this.withReportFreshness({
            existingFile: currentFile,
            loops: currentLoops,
            target: current,
        }, 'weekly');
    }

    private async getMonthlyStatus(): Promise<ReportStatus> {
        const today = moment();
        const isMonthEnd = today.date() === today.daysInMonth();
        const current = this.buildMonthlyTarget(today, isMonthEnd, false);
        const currentFile = this.findMonthlyReport(current.ref);
        const currentLoops = await this.countFullLoops(current.start, current.end);
        if (currentFile || current.timeReached) {
            return await this.withReportFreshness({
                existingFile: currentFile,
                loops: currentLoops,
                target: current,
            }, 'monthly');
        }

        const previousRef = today.clone().subtract(1, 'month');
        const previous = this.buildMonthlyTarget(previousRef, true, true);
        const previousFile = this.findMonthlyReport(previous.ref);
        const previousLoops = await this.countFullLoops(previous.start, previous.end);
        if (!previousFile && previousLoops >= 8) {
            return await this.withReportFreshness({ existingFile: null, loops: previousLoops, target: previous }, 'monthly');
        }

        return await this.withReportFreshness({
            existingFile: currentFile,
            loops: currentLoops,
            target: current,
        }, 'monthly');
    }

    private async withReportFreshness(
        status: Omit<ReportStatus, 'isStale' | 'latestInputMtime' | 'reportMtime'>,
        kind: 'weekly' | 'monthly',
    ): Promise<ReportStatus> {
        const latestInputMtime = await this.getLatestInputMtime(kind, status.target);
        const reportMtime = status.existingFile?.stat?.mtime ?? 0;
        return {
            ...status,
            latestInputMtime,
            reportMtime,
            isStale: !!status.existingFile && latestInputMtime > reportMtime,
        };
    }

    private async getLatestInputMtime(kind: 'weekly' | 'monthly', target: PeriodTarget): Promise<number> {
        const mtimes: number[] = [];
        const dailyNotes = this.host.plugin.vaultManager.getDailyNotesInRange(target.start, target.end);
        mtimes.push(...dailyNotes.map(file => file.stat?.mtime ?? 0));

        for (const path of this.getPlanInputPaths(kind, target)) {
            const file = this.host.app.vault.getAbstractFileByPath(path);
            if (file instanceof TFile) mtimes.push(file.stat?.mtime ?? 0);
        }

        return Math.max(0, ...mtimes);
    }

    private getPlanInputPaths(kind: 'weekly' | 'monthly', target: PeriodTarget): string[] {
        if (kind === 'weekly') {
            return [
                this.host.plugin.vaultManager.getWeeklyPlanPath(target.start.toDate()),
                this.host.plugin.vaultManager.getMonthlyPlanPath(target.start.toDate()),
            ];
        }

        const paths = new Set<string>([
            this.host.plugin.vaultManager.getMonthlyPlanPath(target.start.toDate()),
        ]);
        const cursor = target.start.clone().startOf('isoWeek');
        while (cursor.isSameOrBefore(target.end, 'day')) {
            paths.add(this.host.plugin.vaultManager.getWeeklyPlanPath(cursor.toDate()));
            cursor.add(1, 'week');
        }
        return [...paths];
    }

    private buildWeeklyTarget(ref: moment.Moment, timeReached: boolean, catchUp: boolean): PeriodTarget {
        const start = ref.clone().startOf('isoWeek');
        const end = ref.clone().endOf('isoWeek');
        const weekNum = String(start.isoWeek());
        return {
            ref: start,
            start,
            end,
            timeReached,
            catchUp,
            title: t('insights.weeklyTitle', String(start.isoWeekYear()), weekNum),
            subtitle: catchUp
                ? t('insights.catchUpRange', start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD'))
                : `${start.format('YYYY-MM-DD')} - ${end.format('YYYY-MM-DD')}`,
        };
    }

    private buildMonthlyTarget(ref: moment.Moment, timeReached: boolean, catchUp: boolean): PeriodTarget {
        const start = ref.clone().startOf('month');
        const end = ref.clone().endOf('month');
        const label = getLanguage() === 'en' ? start.format('MMMM YYYY') : start.format('YYYY年M月');
        return {
            ref: start,
            start,
            end,
            timeReached,
            catchUp,
            title: t('insights.monthlyTitle', label),
            subtitle: catchUp
                ? t('insights.catchUpRange', start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD'))
                : `${start.format('YYYY-MM-DD')} - ${end.format('YYYY-MM-DD')}`,
        };
    }

    private async countFullLoops(start: moment.Moment, end: moment.Moment): Promise<number> {
        let count = 0;
        const cursor = start.clone();
        while (cursor.isSameOrBefore(end, 'day')) {
            const data = await loadDayLoopData(this.host.app, this.host.plugin.settings, cursor.format('YYYY-MM-DD'));
            if (data?.hasPlan && data.hasReview) count++;
            cursor.add(1, 'day');
        }
        return count;
    }

    private findWeeklyReport(ref: moment.Moment): TFile | null {
        const year = String(ref.isoWeekYear());
        const week = String(ref.isoWeek());
        const candidates = [
            `${this.host.plugin.settings.archiveFolder}/Insights/${t('insight.weeklyFileName', year, week)}`,
            `${this.host.plugin.settings.archiveFolder}/Insights/${t('insight.weeklyFileName', year, week.padStart(2, '0'))}`,
        ];
        return this.findFirstFile(candidates);
    }

    private findMonthlyReport(ref: moment.Moment): TFile | null {
        return this.findFirstFile([
            `${this.host.plugin.settings.archiveFolder}/Insights/${t('insight.monthlyFileName', ref.format('YYYY-MM'))}`,
        ]);
    }

    private findFirstFile(paths: string[]): TFile | null {
        for (const path of paths) {
            const file = this.host.app.vault.getAbstractFileByPath(path);
            if (file instanceof TFile) return file;
        }
        return null;
    }

    private findProfileFileForMonth(monthKey: string): TFile | null {
        const folder = this.host.app.vault.getAbstractFileByPath(`${this.host.plugin.settings.archiveFolder}/Insights`);
        if (!(folder instanceof TFolder)) return null;
        const files = folder.children
            .filter((child): child is TFile => child instanceof TFile)
            .filter((file) => file.name.startsWith(monthKey) && (file.name.includes('画像更新') || file.name.includes('profile-update')))
            .sort((a, b) => b.name.localeCompare(a.name));
        return files[0] ?? null;
    }
}
