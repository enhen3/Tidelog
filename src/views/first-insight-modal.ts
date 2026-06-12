/**
 * First Insight Modal
 *
 * User-facing path for importing old journals and generating the first
 * evidence-backed profile insight report.
 */

import { Component, MarkdownRenderer, Modal, Notice } from 'obsidian';
import type TideLogPlugin from '../main';
import { t } from '../i18n';
import type { LegacyDailyImportResult, LegacyImportScanResult } from '../services/legacy-import-service';
import type { FirstInsightReportDraft } from '../services/first-insight-service';
import { stripProfileTags } from '../services/first-insight-service';

export class FirstInsightModal extends Modal {
    private folderInputEl!: HTMLInputElement | HTMLSelectElement;
    private scanPreviewEl!: HTMLElement;
    private actionEl!: HTMLElement;
    private reportEl!: HTMLElement;
    private importToDailyEl!: HTMLInputElement;
    private markdownComponent!: Component;
    private scanResult: LegacyImportScanResult | null = null;
    private draft: FirstInsightReportDraft | null = null;

    constructor(app: TideLogPlugin['app'], private plugin: TideLogPlugin) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        this.markdownComponent = new Component();
        this.markdownComponent.load();
        this.modalEl.addClass('tl-first-insight-shell');
        contentEl.addClass('tl-first-insight-modal');

        const headerEl = contentEl.createDiv('tl-first-insight-header');
        headerEl.createDiv({ cls: 'tl-insights-report-preview-kicker', text: t('firstInsight.kicker') });
        headerEl.createEl('h2', { cls: 'tl-first-insight-title', text: t('firstInsight.title') });
        headerEl.createDiv({ cls: 'tl-insights-card-desc', text: t('firstInsight.desc') });
        headerEl.createDiv({ cls: 'tl-first-insight-privacy-note', text: t('firstInsight.privacyNote') });

        const stepperEl = contentEl.createDiv('tl-first-insight-stepper');
        [
            t('firstInsight.stepChoose'),
            t('firstInsight.stepScan'),
            t('firstInsight.stepReport'),
        ].forEach((label, index) => {
            const itemEl = stepperEl.createDiv('tl-first-insight-stepper-item');
            itemEl.createSpan({ cls: 'tl-first-insight-stepper-index', text: String(index + 1) });
            itemEl.createSpan({ cls: 'tl-first-insight-stepper-label', text: label });
        });

        this.renderSetupCard(contentEl);
        this.scanPreviewEl = contentEl.createDiv('tl-first-insight-preview');
        this.actionEl = contentEl.createDiv('tl-first-insight-actions');
        this.reportEl = contentEl.createDiv('tl-first-insight-report');
    }

    onClose(): void {
        this.markdownComponent?.unload();
        this.modalEl.removeClass('tl-first-insight-shell');
        this.contentEl.empty();
    }

    private renderSetupCard(containerEl: HTMLElement): void {
        const card = containerEl.createDiv('tl-insights-card tl-first-insight-setup-card');
        const header = card.createDiv('tl-insights-card-header');
        const titleWrap = header.createDiv('tl-insights-card-title-wrap');
        titleWrap.createDiv({ cls: 'tl-insights-card-title', text: t('firstInsight.setupTitle') });
        titleWrap.createDiv({ cls: 'tl-insights-card-subtitle', text: t('firstInsight.setupSubtitle') });

        const fieldsEl = card.createDiv('tl-first-insight-fields');
        const folderField = fieldsEl.createDiv('tl-first-insight-field tl-first-insight-field-wide');
        folderField.createEl('label', { text: t('firstInsight.folderLabel') });

        const folderOptions = this.plugin.legacyImportService.listVaultFolders();
        if (folderOptions.length > 0) {
            const folderSelectEl = folderField.createEl('select', { cls: 'tl-first-insight-folder-select' });
            const defaultFolder = this.pickDefaultFolder(folderOptions);
            folderOptions.forEach((folderPath) => {
                const optionEl = folderSelectEl.createEl('option', { text: folderPath });
                optionEl.value = folderPath;
                if (folderPath === defaultFolder) optionEl.selected = true;
            });
            folderSelectEl.value = defaultFolder;
            this.folderInputEl = folderSelectEl;
        } else {
            this.folderInputEl = folderField.createEl('input', {
                attr: {
                    type: 'text',
                    placeholder: t('firstInsight.folderPlaceholder'),
                    value: this.plugin.settings.dailyFolder,
                },
            });
            this.folderInputEl.value = this.plugin.settings.dailyFolder;
        }

        card.createDiv({ cls: 'tl-first-insight-folder-note', text: t('firstInsight.folderNote') });

        const importOptionEl = card.createEl('label', { cls: 'tl-first-insight-system-import-option' });
        this.importToDailyEl = importOptionEl.createEl('input', { attr: { type: 'checkbox' } });
        const importCopyEl = importOptionEl.createSpan('tl-first-insight-system-import-copy');
        importCopyEl.createSpan({ cls: 'tl-first-insight-system-import-title', text: t('firstInsight.systemImportTitle') });
        importCopyEl.createSpan({ cls: 'tl-first-insight-system-import-desc', text: t('firstInsight.systemImportDesc') });

        const generateButton = card.createEl('button', {
            cls: 'tl-insights-primary-btn tl-insights-primary-btn-ready',
            text: t('firstInsight.generateBtn'),
            attr: { type: 'button' },
        });
        const resetGeneratedState = () => {
            this.resetGeneratedStateForFolderChange(generateButton);
        };
        this.folderInputEl.addEventListener('change', resetGeneratedState);
        this.folderInputEl.addEventListener('input', resetGeneratedState);
        generateButton.addEventListener('click', () => {
            void this.startFirstInsight(generateButton);
        });
    }

    private resetGeneratedStateForFolderChange(button: HTMLButtonElement): void {
        if (button.classList.contains('tl-insights-primary-btn-loading')) return;
        if (!this.draft && !this.scanResult) return;

        this.scanPreviewEl.empty();
        this.actionEl.empty();
        this.reportEl.empty();
        this.scanResult = null;
        this.draft = null;
        button.parentElement?.querySelector('.tl-first-insight-generating-status')?.remove();
        button.disabled = false;
        button.removeClass('tl-insights-primary-btn-complete');
        button.setText(t('firstInsight.generateBtn'));
    }

    private pickDefaultFolder(folderOptions: string[]): string {
        const archiveFolder = this.plugin.settings.archiveFolder;
        const isImportableFolder = (folderPath: string) => {
            return !folderPath.startsWith(`${archiveFolder}/`)
                && folderPath !== archiveFolder;
        };

        const legacyLike = folderOptions.find((folderPath) => {
            const normalized = folderPath.toLowerCase();
            return isImportableFolder(folderPath)
                && /(legacy|journal|diary|日记)/i.test(normalized);
        });
        if (legacyLike) return legacyLike;

        const dailyLike = folderOptions.find((folderPath) => {
            return isImportableFolder(folderPath)
                && /daily/i.test(folderPath.toLowerCase());
        });
        if (dailyLike) return dailyLike;

        if (folderOptions.includes(this.plugin.settings.dailyFolder)) {
            return this.plugin.settings.dailyFolder;
        }

        return folderOptions[0] ?? '';
    }

    private async startFirstInsight(button: HTMLButtonElement): Promise<void> {
        const folderPath = this.folderInputEl.value.trim();
        if (!folderPath) {
            new Notice(t('firstInsight.folderRequired'));
            return;
        }

        button.disabled = true;
        button.addClass('tl-insights-primary-btn-loading');
        button.empty();
        button.createSpan('tl-insights-spinner');
        button.createSpan({ cls: 'tl-insights-loading-label', text: t('firstInsight.scanning') });
        this.scanPreviewEl.empty();
        this.actionEl.empty();
        this.reportEl.empty();
        this.scanResult = null;
        this.draft = null;

        let completed = false;
        try {
            const scan = await this.plugin.legacyImportService.scanFolder(folderPath);
            this.scanResult = scan;
            this.renderScanPreview(scan);
            if (!scan.canGenerate) {
                return;
            }
            completed = await this.generate(button);
        } catch (error) {
            this.scanPreviewEl.createDiv({
                cls: 'tl-insights-notice tl-insights-notice-stale',
                text: error instanceof Error ? error.message : t('firstInsight.scanFailed'),
            });
        } finally {
            button.removeClass('tl-insights-primary-btn-loading');
            if (completed) {
                button.disabled = true;
                button.addClass('tl-insights-primary-btn-complete');
                button.setText(t('firstInsight.generatedBtn'));
            } else {
                button.disabled = false;
                button.removeClass('tl-insights-primary-btn-complete');
                button.setText(t('firstInsight.generateBtn'));
            }
        }
    }

    private renderScanPreview(scan: LegacyImportScanResult): void {
        this.scanPreviewEl.empty();
        const card = this.scanPreviewEl.createDiv('tl-insights-card tl-first-insight-scan-card');
        const header = card.createDiv('tl-insights-card-header');
        const titleWrap = header.createDiv('tl-insights-card-title-wrap');
        titleWrap.createDiv({ cls: 'tl-insights-card-title', text: t('firstInsight.scanPreviewTitle') });
        titleWrap.createDiv({
            cls: 'tl-insights-card-subtitle',
            text: t('firstInsight.scanPreviewSubtitle', scan.folderPath, scan.dateRange.start, scan.dateRange.end),
        });

        const stats = card.createDiv('tl-first-insight-stats');
        this.renderStat(stats, t('firstInsight.candidateCount'), String(scan.candidateCount));
        this.renderStat(stats, t('firstInsight.validCount'), String(scan.validCount));
        this.renderStat(stats, t('firstInsight.excludedCount'), String(scan.excludedEntries.length));

        const notice = card.createDiv('tl-insights-notice');
        if (scan.canGenerate) {
            const estimate = this.buildGenerationEstimate(scan);
            notice.setText(t('firstInsight.readyNotice', String(scan.candidateCount), String(scan.validCount), estimate.label));
        } else {
            notice.addClass('tl-insights-notice-stale');
            notice.setText(t('firstInsight.tooFewNotice', String(scan.validCount)));
        }

        if (scan.excludedEntries.length > 0) {
            const excludedEl = card.createDiv('tl-first-insight-excluded');
            excludedEl.createDiv({ cls: 'tl-first-insight-section-title', text: t('firstInsight.excludedTitle') });
            const listEl = excludedEl.createEl('ul');
            scan.excludedEntries.slice(0, 8).forEach((item) => {
                listEl.createEl('li', {
                    text: `${item.path} · ${this.reasonLabel(item.reason)}${item.date ? ` · ${item.date}` : ''}`,
                });
            });
            if (scan.excludedEntries.length > 8) {
                excludedEl.createDiv({ cls: 'tl-first-insight-muted', text: t('firstInsight.excludedMore', String(scan.excludedEntries.length - 8)) });
            }
        }

        this.revealElement(card);
    }

    private async generate(button: HTMLButtonElement): Promise<boolean> {
        if (!this.scanResult) return false;
        button.disabled = true;
        button.addClass('tl-insights-primary-btn-loading');
        button.empty();
        button.createSpan('tl-insights-spinner');
        button.createSpan({ cls: 'tl-insights-loading-label', text: t('firstInsight.generating') });
        button.parentElement?.querySelector('.tl-first-insight-generating-status')?.remove();
        const progressEl = button.parentElement?.createDiv('tl-first-insight-generating-status');

        this.reportEl.empty();
        const card = this.reportEl.createDiv('tl-insights-card tl-first-insight-report-card');
        const header = card.createDiv('tl-insights-card-header');
        const titleWrap = header.createDiv('tl-insights-card-title-wrap');
        titleWrap.createDiv({ cls: 'tl-insights-card-title', text: t('firstInsight.reportPreviewTitle') });
        titleWrap.createDiv({ cls: 'tl-insights-card-subtitle', text: t('firstInsight.reportPreviewSubtitle') });
        const notice = card.createDiv({ cls: 'tl-insights-notice', text: t('firstInsight.reportGeneratingNotice') });
        const stream = card.createDiv('tl-insights-stream');
        let fullContent = '';
        this.revealElement(card);
        const startedAt = Date.now();
        let stage = t('firstInsight.stagePreparing');
        const estimate = this.buildGenerationEstimate(this.scanResult);
        const updateProgress = () => {
            const remaining = this.formatRemainingMinutes(estimate, Date.now() - startedAt);
            const key = Date.now() - startedAt >= estimate.maxSeconds * 1000
                ? 'firstInsight.generatingLongHint'
                : 'firstInsight.generatingHint';
            const progressText = t(key, estimate.label, String(estimate.journalCount), stage, remaining);
            progressEl?.setText(progressText);
        };
        updateProgress();
        const progressTimer = activeWindow.setInterval(updateProgress, 1000);

        try {
            stage = t('firstInsight.stagePreparing');
            updateProgress();
            const session = await this.plugin.legacyImportService.createImport(this.scanResult);
            let dailyImportResult: LegacyDailyImportResult | null = null;
            if (this.importToDailyEl.checked) {
                stage = t('firstInsight.stageImporting');
                updateProgress();
                dailyImportResult = await this.plugin.legacyImportService.importSessionToDailyNotes(session);
            }
            stage = t('firstInsight.stageGenerating');
            updateProgress();
            const draft = await this.plugin.firstInsightService.generateFirstInsight(session, (chunk) => {
                fullContent += chunk;
                const displayContent = stripProfileTags(fullContent);
                stream.empty();
                try {
                    void MarkdownRenderer.render(this.app, displayContent, stream, '', this.markdownComponent).catch((error) => {
                        console.warn('TideLog first insight preview render failed:', error);
                    });
                } catch (error) {
                    console.warn('TideLog first insight preview render failed:', error);
                }
            });
            this.draft = draft;
            stream.empty();
            await MarkdownRenderer.render(this.app, draft.report, stream, '', this.markdownComponent);
            notice.setText(dailyImportResult
                ? t(
                    'firstInsight.generatedDraftNoticeWithImport',
                    String(dailyImportResult.createdPaths.length),
                    String(dailyImportResult.appendedPaths.length),
                    String(dailyImportResult.skippedPaths.length),
                )
                : t('firstInsight.generatedDraftNotice'));
            this.renderSaveAction(card);
            this.revealElement(card);
            activeWindow.setTimeout(() => this.revealElement(card), 120);
            return true;
        } catch (error) {
            notice.addClass('tl-insights-notice-stale');
            notice.setText(error instanceof Error ? error.message : t('firstInsight.generateFailed'));
            return false;
        } finally {
            activeWindow.clearInterval(progressTimer);
            progressEl?.remove();
            button.removeClass('tl-insights-primary-btn-loading');
        }
    }

    private revealElement(element: HTMLElement): void {
        const reveal = () => {
            const container = this.contentEl;
            if (container.contains(element) && typeof container.scrollTo === 'function') {
                const containerRect = container.getBoundingClientRect();
                const elementRect = element.getBoundingClientRect();
                const top = Math.max(0, container.scrollTop + elementRect.top - containerRect.top - 8);
                container.scrollTo({ top, behavior: 'smooth' });
                return;
            }
            if (typeof element.scrollIntoView === 'function') {
                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        };

        if (typeof activeWindow !== 'undefined' && typeof activeWindow.requestAnimationFrame === 'function') {
            activeWindow.requestAnimationFrame(reveal);
        } else {
            activeWindow.setTimeout(reveal, 0);
        }
    }

    private buildGenerationEstimate(scan: LegacyImportScanResult): {
        label: string;
        minSeconds: number;
        maxSeconds: number;
        journalCount: number;
    } {
        const evidenceChars = scan.validEntries.reduce((sum, entry) => {
            return sum + Math.min(entry.analyzableBody.length, 1600);
        }, 0);
        const expectedSeconds = 300 + (scan.validCount * 18) + (Math.ceil(evidenceChars / 1000) * 30);
        const minSeconds = Math.min(960, Math.max(300, Math.ceil((expectedSeconds * 0.65) / 60) * 60));
        const maxSeconds = Math.min(1200, Math.max(minSeconds + 120, Math.ceil((expectedSeconds * 1.05) / 60) * 60));

        return {
            label: this.formatEstimateRange(minSeconds, maxSeconds),
            minSeconds,
            maxSeconds,
            journalCount: scan.validCount,
        };
    }

    private formatEstimateRange(minSeconds: number, maxSeconds: number): string {
        const minMinutes = Math.max(1, Math.round(minSeconds / 60));
        const maxMinutes = Math.max(minMinutes, Math.round(maxSeconds / 60));
        if (minMinutes === maxMinutes) {
            return t('firstInsight.estimateMinutes', String(maxMinutes));
        }
        return t('firstInsight.estimateMinutesRange', String(minMinutes), String(maxMinutes));
    }

    private formatRemainingMinutes(
        estimate: { minSeconds: number; maxSeconds: number },
        elapsedMs: number,
    ): string {
        const elapsedSeconds = Math.floor(elapsedMs / 1000);
        const minRemainingSeconds = estimate.minSeconds - elapsedSeconds;
        const maxRemainingSeconds = estimate.maxSeconds - elapsedSeconds;
        if (maxRemainingSeconds <= 0) {
            return t('firstInsight.remainingModelWait');
        }
        const maxMinutes = Math.max(1, Math.ceil(maxRemainingSeconds / 60));
        if (minRemainingSeconds <= 60) {
            return t('firstInsight.remainingMinutesUpper', String(maxMinutes));
        }
        const minMinutes = Math.max(1, Math.ceil(minRemainingSeconds / 60));
        if (minMinutes === maxMinutes) {
            return t('firstInsight.remainingMinutes', String(maxMinutes));
        }
        return t('firstInsight.remainingMinutesRange', String(minMinutes), String(maxMinutes));
    }

    private renderSaveAction(card: HTMLElement): void {
        const confirmEl = card.createDiv('tl-first-insight-confirm');
        confirmEl.createDiv({ cls: 'tl-first-insight-section-title', text: t('firstInsight.saveQuestion') });
        confirmEl.createDiv({ cls: 'tl-insights-card-desc', text: t('firstInsight.saveDesc') });
        const saveButton = confirmEl.createEl('button', {
            cls: 'tl-insights-primary-btn tl-insights-primary-btn-ready',
            text: t('firstInsight.saveBtn'),
            attr: { type: 'button' },
        });
        saveButton.addEventListener('click', () => {
            void this.saveDraft(saveButton);
        });
    }

    private async saveDraft(saveButton: HTMLButtonElement): Promise<void> {
        if (!this.draft) return;
        saveButton.disabled = true;
        saveButton.setText(t('firstInsight.saving'));
        try {
            const profileFile = await this.plugin.firstInsightService.saveInitialProfile(this.draft);
            new Notice(t('firstInsight.savedNotice'));
            if (profileFile) {
                await this.app.workspace.getLeaf().openFile(profileFile);
            }
            this.close();
        } catch (error) {
            new Notice(error instanceof Error ? error.message : t('firstInsight.saveFailed'));
            saveButton.disabled = false;
            saveButton.setText(t('firstInsight.saveBtn'));
        }
    }

    private renderStat(containerEl: HTMLElement, label: string, value: string): void {
        const item = containerEl.createDiv('tl-first-insight-stat');
        item.createDiv({ cls: 'tl-first-insight-stat-value', text: value });
        item.createDiv({ cls: 'tl-first-insight-stat-label', text: label });
    }

    private reasonLabel(reason: LegacyImportScanResult['excludedEntries'][number]['reason']): string {
        switch (reason) {
            case 'outside_range': return t('firstInsight.reasonOutsideRange');
            case 'missing_date': return t('firstInsight.reasonMissingDate');
            case 'too_short': return t('firstInsight.reasonTooShort');
            case 'read_error': return t('firstInsight.reasonReadError');
            default: return reason;
        }
    }
}
