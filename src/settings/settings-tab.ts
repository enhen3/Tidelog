/**
 * Settings Tab - Plugin configuration UI
 * Phase 5: Custom model names, custom provider, streamlined evening questions
 */

import {
    App,
    PluginSettingTab,
    Setting,
    Notice,
    Platform,
    normalizePath,
} from 'obsidian';

import TideLogPlugin from '../main';
import { EveningQuestionConfig } from '../types';
import { t } from '../i18n';
import type { Language } from '../i18n';
import { OnboardingModal } from '../views/onboarding-modal';
import { ProModal } from '../views/pro-modal';

export class TideLogSettingTab extends PluginSettingTab {
    plugin: TideLogPlugin;
    private legacyImportDescEl: HTMLElement | null = null;
    private legacyImportButtonEl: HTMLButtonElement | null = null;

    constructor(app: App, plugin: TideLogPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    private saveSettingsPreservingScroll(afterSave?: () => void): void {
        const scrollTop = this.containerEl.scrollTop;
        void this.plugin.saveSettings().then(() => {
            afterSave?.();
            window.requestAnimationFrame(() => {
                this.containerEl.scrollTop = scrollTop;
            });
        });
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.addClass('tl-settings-tab');
        if (Platform.isMobile) containerEl.addClass('is-mobile');
        this.legacyImportDescEl = null;
        this.legacyImportButtonEl = null;

        this.renderSettingsHero(containerEl);
        this.renderGettingStarted(containerEl);
        this.renderAISettings(containerEl);
        this.renderLegacyImportEntry(containerEl);
        this.renderProLicense(containerEl);
        this.renderEveningQuestions(containerEl);
        this.renderFolderSettings(containerEl);
        this.renderDayBoundarySetting(containerEl);
        this.renderLanguageSetting(containerEl);
    }

    private renderAISettings(containerEl: HTMLElement): void {
        const cardEl = containerEl.createDiv('tl-settings-guide-card tl-ai-managed-card');
        const copyEl = cardEl.createDiv('tl-settings-collapsible-summary-copy');
        copyEl.createDiv({ cls: 'tl-settings-card-kicker', text: t('settings.aiManagedKicker') });
        copyEl.createDiv({ cls: 'tl-settings-card-title', text: t('settings.aiManagedTitle') });
        copyEl.createDiv({ cls: 'tl-settings-card-desc', text: t('settings.aiManagedDesc') });
    }

    private renderFolderSettings(containerEl: HTMLElement): void {
        new Setting(containerEl).setName(t('settings.sectionFolders')).setHeading();

        new Setting(containerEl)
            .setName(t('settings.dailyFolder'))
            .setDesc(t('settings.dailyFolderDesc'))
            .addText((text) =>
                text
                    .setPlaceholder('01-daily')
                    .setValue(this.plugin.settings.dailyFolder)
                    .onChange((value) => {
                        this.plugin.settings.dailyFolder = normalizePath(value);
                        void this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName(t('settings.planFolder'))
            .setDesc(t('settings.planFolderDesc'))
            .addText((text) =>
                text
                    .setPlaceholder('02-plan')
                    .setValue(this.plugin.settings.planFolder)
                    .onChange((value) => {
                        this.plugin.settings.planFolder = normalizePath(value);
                        void this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName(t('settings.archiveFolder'))
            .setDesc(t('settings.archiveFolderDesc'))
            .addText((text) =>
                text
                    .setPlaceholder('03-archive')
                    .setValue(this.plugin.settings.archiveFolder)
                    .onChange((value) => {
                        this.plugin.settings.archiveFolder = normalizePath(value);
                        void this.plugin.saveSettings();
                    })
            );

        containerEl.createDiv({ cls: 'tl-settings-section-note', text: t('settings.folderSectionNote') });
    }

    private renderDayBoundarySetting(containerEl: HTMLElement): void {
        new Setting(containerEl).setName(t('settings.sectionDayBoundary')).setHeading();

        const getBoundaryExampleTime = (value: number) => {
            if (value <= 1) return '00:30';
            const exampleHour = Math.max(0, Math.min(7, value - 1));
            return `${String(exampleHour).padStart(2, '0')}:30`;
        };
        const formatBoundary = (value: number) => value === 0
            ? t('settings.dayBoundaryAtMidnight')
            : t('settings.dayBoundaryValue', `${String(value).padStart(2, '0')}:00`, getBoundaryExampleTime(value));

        const boundarySetting = new Setting(containerEl)
            .setName(t('settings.dayBoundaryHour'))
            .setDesc(t('settings.dayBoundaryHourDesc'));

        const clampedBoundaryHour = Math.min(8, this.plugin.settings.dayBoundaryHour);
        if (clampedBoundaryHour !== this.plugin.settings.dayBoundaryHour) {
            this.plugin.settings.dayBoundaryHour = clampedBoundaryHour;
            void this.plugin.saveSettings();
        }

        let valueEl: HTMLElement;
        boundarySetting.addSlider((slider) => {
            const sliderParentEl = slider.sliderEl.parentElement ?? containerEl;
            valueEl = sliderParentEl.createSpan('tl-settings-boundary-value');
            valueEl.setText(`${String(clampedBoundaryHour).padStart(2, '0')}:00`);
            slider.sliderEl.after(valueEl);

            return slider
                .setLimits(0, 8, 1)
                .setValue(clampedBoundaryHour)
                .onChange((value) => {
                    this.plugin.settings.dayBoundaryHour = value;
                    valueEl.setText(`${String(value).padStart(2, '0')}:00`);
                    boundaryNote.setText(formatBoundary(value));
                    void this.plugin.saveSettings();
                });
        });

        const boundaryNote = containerEl.createDiv({
            cls: 'tl-settings-boundary-note',
            text: formatBoundary(clampedBoundaryHour),
        });
    }

    private renderLanguageSetting(containerEl: HTMLElement): void {
        new Setting(containerEl).setName(t('settings.sectionPreferences')).setHeading();

        new Setting(containerEl)
            .setName(t('settings.language'))
            .setDesc(t('settings.languageDesc'))
            .addDropdown((dropdown) =>
                dropdown
                    .addOption('zh', '简体中文')
                    .addOption('en', 'English')
                    .setValue(this.plugin.settings.language)
                    .onChange((value) => {
                        this.plugin.settings.language = value as Language;
                        this.saveSettingsPreservingScroll(() => this.display());
                    })
            );
    }

    /**
     * Render a premium, brand-colored settings hero so the settings page feels
     * like a finished product surface instead of a default Obsidian form list.
     */
    private renderSettingsHero(containerEl: HTMLElement): void {
        const heroEl = containerEl.createDiv('tl-settings-hero');
        const copyEl = heroEl.createDiv('tl-settings-hero-copy');
        const lockupEl = copyEl.createDiv('tl-settings-lockup');
        const logoEl = lockupEl.createDiv('tl-settings-logo-mark');
        logoEl.createSpan('tl-settings-logo-line');
        logoEl.createSpan('tl-settings-logo-dot');
        const lockupCopyEl = lockupEl.createDiv('tl-settings-lockup-copy');
        lockupCopyEl.createDiv({ cls: 'tl-settings-eyebrow', text: t('settings.heroEyebrow') });
        lockupCopyEl.createDiv({ cls: 'tl-settings-lockup-subtitle', text: t('settings.heroSubtitle') });
        copyEl.createDiv({
            cls: 'tl-settings-hero-title',
            text: t('settings.heroTitle'),
        });
        copyEl.createEl('p', {
            cls: 'tl-settings-hero-desc',
            text: t('settings.heroDesc'),
        });

        const flowEl = copyEl.createDiv('tl-settings-flow');
        [t('chat.tabPlan'), t('chat.tabReview'), t('chat.tabInsights')].forEach((label) => {
            flowEl.createSpan({ cls: 'tl-settings-flow-pill', text: label });
        });

        const proofEl = copyEl.createDiv('tl-settings-proof-row');
        [
            t('settings.proofNoTelemetry'),
            t('settings.proofVaultNative'),
            t('settings.proofScopedReads'),
            t('settings.proofUserTriggeredAI'),
        ].forEach((label) => {
            proofEl.createSpan({ cls: 'tl-settings-proof-pill', text: label });
        });
    }

    /**
     * Render onboarding entry point for users who want to revisit setup.
     */
    private renderGettingStarted(containerEl: HTMLElement): void {
        new Setting(containerEl).setName(t('settings.gettingStarted')).setHeading();

        const guideEl = containerEl.createEl('details', { cls: 'tl-settings-guide-card tl-settings-collapsible-card' });
        guideEl.open = !this.plugin.settings.onboardingCompleted;
        const summaryEl = guideEl.createEl('summary', { cls: 'tl-settings-collapsible-summary' });
        const summaryCopyEl = summaryEl.createDiv('tl-settings-collapsible-summary-copy');
        summaryCopyEl.createDiv({ cls: 'tl-settings-card-kicker', text: t('settings.gettingStartedGuide') });
        summaryCopyEl.createDiv({ cls: 'tl-settings-card-title', text: t('settings.gettingStartedTitle') });
        summaryCopyEl.createDiv({ cls: 'tl-settings-card-desc', text: t('settings.gettingStartedDesc') });
        summaryEl.createSpan({ cls: 'tl-settings-collapse-icon', text: '⌄' });

        const bodyEl = guideEl.createDiv('tl-settings-collapsible-body');
        const mainEl = bodyEl.createDiv('tl-settings-guide-main');

        const stepsEl = mainEl.createDiv('tl-settings-guide-steps');
        [
            t('settings.guideStepAI'),
            t('settings.guideStepPlan'),
            t('settings.guideStepReview'),
            t('settings.guideStepInsights'),
        ].forEach((step, index) => {
            const stepEl = stepsEl.createDiv('tl-settings-guide-step');
            stepEl.createSpan({ cls: 'tl-settings-guide-step-number', text: String(index + 1) });
            stepEl.createSpan({ text: step });
        });

        const actionEl = bodyEl.createDiv('tl-settings-card-actions');
        const openBtn = actionEl.createEl('button', { cls: 'mod-cta tl-settings-action-btn', text: t('settings.openGettingStarted') });
        openBtn.addEventListener('click', () => {
            new OnboardingModal(this.app, this.plugin).open();
        });

    }

    private renderLegacyImportEntry(containerEl: HTMLElement): void {
        const guideEl = containerEl.createEl('details', { cls: 'tl-settings-legacy-import tl-settings-guide-card tl-settings-collapsible-card' });
        guideEl.open = false;

        const summaryEl = guideEl.createEl('summary', { cls: 'tl-settings-collapsible-summary' });
        const summaryCopyEl = summaryEl.createDiv('tl-settings-collapsible-summary-copy');
        summaryCopyEl.createDiv({ cls: 'tl-settings-card-kicker', text: t('settings.legacyImportKicker') });
        summaryCopyEl.createDiv({ cls: 'tl-settings-card-title', text: t('settings.legacyImportTitle') });
        this.legacyImportDescEl = summaryCopyEl.createDiv({ cls: 'tl-settings-card-desc' });
        summaryEl.createSpan({ cls: 'tl-settings-collapse-icon', text: '⌄' });

        const bodyEl = guideEl.createDiv('tl-settings-collapsible-body');
        const mainEl = bodyEl.createDiv('tl-settings-guide-main');
        const stepsEl = mainEl.createDiv('tl-settings-guide-steps');
        [
            t('settings.legacyImportStepReadonly'),
            t('settings.legacyImportStepNormalize'),
            t('settings.legacyImportStepSave'),
        ].forEach((step, index) => {
            const stepEl = stepsEl.createDiv('tl-settings-guide-step');
            stepEl.createSpan({ cls: 'tl-settings-guide-step-number', text: String(index + 1) });
            stepEl.createSpan({ text: step });
        });

        const actionEl = bodyEl.createDiv('tl-settings-card-actions');
        const openBtn = actionEl.createEl('button', {
            cls: 'mod-cta tl-settings-action-btn',
            attr: { type: 'button' },
        });
        this.legacyImportButtonEl = openBtn;
        this.refreshLegacyImportEntryState();

        openBtn.addEventListener('click', () => {
            void this.plugin.openFirstInsight();
        });
    }

    private refreshLegacyImportEntryState(): void {
        if (this.legacyImportDescEl) {
            this.legacyImportDescEl.textContent = this.plugin.settings.firstInsightCompleted
                ? t('settings.legacyImportCompletedDesc')
                : t('settings.legacyImportReadyDesc');
        }
        if (this.legacyImportButtonEl) {
            this.legacyImportButtonEl.textContent = this.plugin.settings.firstInsightCompleted
                ? t('settings.legacyImportCompletedBtn')
                : t('settings.legacyImportBtn');
        }
    }

    /**
     * Render the evening question editor — drag-and-drop, enable toggle, expand to edit.
     *
     * Layout per question:
     *   [drag handle (draggable)] [▶ triangle] [name span] [spacer] [enabled] [×]
     * Expanding the row inserts a `tl-q-detail` sibling block below, which
     * contains labeled inputs for the question name and content. Editing
     * happens in that panel — the name span in the row is static and only
     * mirrors the latest name for at-a-glance scanning.
     *
     * `draggable=true` lives on the handle, not the row, so that inputs
     * inside the row/detail panel don't sit inside a draggable parent
     * (which interferes with focus and text selection in Electron/Chromium).
     */
    private renderEveningQuestions(containerEl: HTMLElement): void {
        new Setting(containerEl).setName(t('settings.eveningQuestions')).setHeading();

        const questions = this.plugin.settings.eveningQuestions;
        const isPro = this.plugin.licenseManager.isPro();
        const isTrial = this.plugin.licenseManager.getAccessState() === 'trial';
        const enabledCount = questions.filter((q) => q.enabled !== false).length;

        const introEl = containerEl.createDiv(`tl-q-intro ${isPro ? 'is-pro' : 'is-free'}`);
        const introCopyEl = introEl.createDiv('tl-q-intro-copy');
        introCopyEl.createDiv({ cls: 'tl-settings-card-kicker', text: t('settings.reviewFlowKicker') });
        introCopyEl.createDiv({ cls: 'tl-settings-card-title', text: t('settings.reviewFlowTitle') });
        introCopyEl.createDiv({
            cls: 'tl-settings-card-desc',
            text: isPro
                ? t('settings.reviewProDesc', enabledCount)
                : t('settings.reviewFreeDesc', enabledCount),
        });
        introCopyEl.createDiv({
            cls: `tl-q-plan-status ${isPro ? 'is-pro' : 'is-free'}`,
            text: isPro
                ? t(isTrial ? 'settings.reviewTrialActiveBadge' : 'settings.reviewProActiveBadge')
                : t('settings.reviewFreeBadge'),
        });
        if (!isPro) {
            const upgradeBtn = introEl.createEl('button', {
                cls: 'mod-cta tl-settings-action-btn',
                text: this.plugin.licenseManager.getAccessState() === 'trial-expired'
                    ? t('trial.expiredAction')
                    : this.plugin.licenseManager.getAccessState() === 'license-inactive'
                        ? t('trial.licenseInactiveAction')
                        : t('trial.start'),
            });
            upgradeBtn.addEventListener('click', () => {
                new ProModal(
                    this.app,
                    t('settings.reviewFlowTitle'),
                    this.plugin.licenseManager,
                    () => this.display(),
                ).open();
            });
        }

        // Question list container for drag-and-drop
        const listEl = containerEl.createDiv('tl-q-list');

        let dragIdx: number | null = null;
        let enabledOrdinal = 0;
        const refreshQuestionLimitBadges = () => {
            let ordinal = 0;
            listEl.querySelectorAll<HTMLElement>('.tl-q-row').forEach((item) => {
                const idx = Number(item.dataset.index);
                const enabled = this.plugin.settings.eveningQuestions[idx]?.enabled !== false;
                item.classList.toggle('tl-q-disabled', !enabled);
                const over = !isPro && enabled && ++ordinal > 2;
                item.classList.toggle('tl-q-pro-over-limit', over);
                const badge = item.querySelector<HTMLElement>('.tl-q-limit-badge');
                if (over && !badge) {
                    const spacer = item.querySelector('.tl-q-spacer');
                    spacer?.before(item.createSpan({ cls: 'tl-q-limit-badge', text: t('settings.proRequiredBadge') }));
                }
                if (!over && badge) badge.remove();
            });
        };

        questions.forEach((question, index) => {
            const row = listEl.createDiv('tl-q-row');
            const isEnabled = question.enabled !== false;
            const freeOverLimit = !isPro && isEnabled && ++enabledOrdinal > 2;
            if (freeOverLimit) row.addClass('tl-q-pro-over-limit');
            row.dataset.index = String(index);
            if (question.enabled === false) row.addClass('tl-q-disabled');

            // --- Drag handle (the only draggable element in the row, so that
            // text inputs in the detail panel aren't inside a draggable parent
            // — Chromium/Electron interferes with focus and text selection
            // inside `draggable=true` elements). ---
            const handle = row.createSpan({ cls: 'tl-q-drag-handle', text: '⡇' });
            handle.setAttribute('title', t('settings.dragToReorder'));
            handle.setAttribute('draggable', 'true');

            // --- Expand triangle ---
            const triangle = row.createSpan({ cls: 'tl-q-triangle' });
            triangle.textContent = '▶';

            // --- Name (static label; editing happens in the detail panel) ---
            const nameEl = row.createSpan({ cls: 'tl-q-name', text: question.sectionName || t('settings.unnamed') });
            if (freeOverLimit) {
                row.createSpan({ cls: 'tl-q-limit-badge', text: t('settings.proRequiredBadge') });
            }

            // --- Spacer ---
            row.createSpan({ cls: 'tl-q-spacer' });

            // --- Enabled toggle ---
            const toggleWrap = row.createSpan({ cls: 'tl-q-toggle' });
            const toggleInput = toggleWrap.createEl('input', { cls: 'tl-q-toggle-input' });
            toggleInput.type = 'checkbox';
            toggleInput.checked = question.enabled !== false;
            toggleInput.setAttribute('title', t('settings.enableQuestion'));
            toggleInput.setAttribute('aria-label', t('settings.enableQuestion'));
            toggleInput.addEventListener('click', (e) => {
                e.stopPropagation();
            });
            toggleInput.addEventListener('change', () => {
                void (async () => {
                    this.plugin.settings.eveningQuestions[index].enabled = toggleInput.checked;
                    refreshQuestionLimitBadges();
                    if (!isPro && toggleInput.checked) {
                        const activeBeforeThis = this.plugin.settings.eveningQuestions
                            .slice(0, index + 1)
                            .filter((q) => q.enabled !== false).length;
                        if (activeBeforeThis > 2) {
                            new Notice(t('settings.reviewProRequiredNotice'), 6000);
                        }
                    }
                    await this.plugin.saveSettings();
                })();
            });

            // --- Delete button ---
            const deleteBtn = row.createSpan({ cls: 'tl-q-icon-btn tl-q-icon-delete' });
            deleteBtn.textContent = '✕';
            deleteBtn.setAttribute('title', t('settings.delete'));
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                void (async () => {
                    this.plugin.settings.eveningQuestions.splice(index, 1);
                    await this.plugin.saveSettings();
                    this.display();
                })();
            });

            // --- Expand/collapse: open or close the detail panel below ---
            const toggleExpand = () => {
                const existing = row.nextElementSibling;
                if (existing && existing.hasClass('tl-q-detail')) {
                    existing.remove();
                    triangle.textContent = '▶';
                    triangle.removeClass('tl-q-triangle-open');
                } else {
                    triangle.textContent = '▼';
                    triangle.addClass('tl-q-triangle-open');
                    this.renderQuestionDetail(row, question, index, nameEl);
                }
            };

            const toggleExpandFromControl = (e: Event) => {
                e.stopPropagation();
                toggleExpand();
            };

            triangle.addEventListener('click', toggleExpandFromControl);
            nameEl.addEventListener('click', toggleExpandFromControl);

            row.addEventListener('click', (e) => {
                const target = e.target instanceof Element
                    ? e.target
                    : e.target instanceof Node
                        ? e.target.parentElement
                        : null;
                if (target?.closest('.tl-q-drag-handle, .tl-q-toggle-input, .tl-q-icon-btn, button, input, textarea, select')) {
                    return;
                }
                toggleExpand();
            });

            // --- Drag events ---
            // dragstart fires on the handle (the only draggable child); the
            // row stays the drop target via dragover/drop below.
            handle.addEventListener('dragstart', (e) => {
                dragIdx = index;
                row.addClass('tl-q-dragging');
                e.dataTransfer?.setData('text/plain', String(index));
            });

            handle.addEventListener('dragend', () => {
                dragIdx = null;
                row.removeClass('tl-q-dragging');
                listEl.querySelectorAll('.tl-q-dragover').forEach(el => el.removeClass('tl-q-dragover'));
            });

            row.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (dragIdx !== null && dragIdx !== index) {
                    row.addClass('tl-q-dragover');
                }
            });

            row.addEventListener('dragleave', () => {
                row.removeClass('tl-q-dragover');
            });

            row.addEventListener('drop', (e) => {
                e.preventDefault();
                row.removeClass('tl-q-dragover');
                if (dragIdx === null || dragIdx === index) return;

                void (async () => {
                    const items = this.plugin.settings.eveningQuestions;
                    const [moved] = items.splice(dragIdx, 1);
                    items.splice(index, 0, moved);
                    await this.plugin.saveSettings();
                    this.display();
                })();
            });

            // --- Touch drag events (mobile) ---
            if (Platform.isMobile) {
                let touchStartY = 0;
                let touchDragging = false;
                let touchClone: HTMLElement | null = null;
                handle.addEventListener('touchstart', (e) => {
                    e.stopPropagation();
                    touchStartY = e.touches[0].clientY;
                    touchDragging = false;
                    dragIdx = index;
                }, { passive: true });
                handle.addEventListener('touchmove', (e) => {
                    const touch = e.touches[0];
                    if (!touchDragging && Math.abs(touch.clientY - touchStartY) > 8) {
                        touchDragging = true;
                        row.addClass('tl-q-dragging');
                        touchClone = row.cloneNode(true) as HTMLElement;
                        touchClone.addClass('tl-touch-drag-clone');
                        touchClone.setCssProps({ '--tl-drag-left': `${row.getBoundingClientRect().left}px`, '--tl-drag-width': `${row.getBoundingClientRect().width}px` });
                        activeDocument.body.appendChild(touchClone);
                    }
                    if (touchDragging) {
                        e.preventDefault();
                        if (touchClone) touchClone.setCssProps({ '--tl-drag-top': `${touch.clientY - 22}px` });
                        listEl.querySelectorAll('.tl-q-row').forEach(r => r.removeClass('tl-q-dragover'));
                        const target = activeDocument.elementFromPoint(touch.clientX, touch.clientY)?.closest('.tl-q-row') as HTMLElement | null;
                        if (target && target !== row && listEl.contains(target)) {
                            target.addClass('tl-q-dragover');
                        }
                    }
                }, { passive: false });
                handle.addEventListener('touchend', (e) => {
                    if (touchClone) { touchClone.remove(); touchClone = null; }
                    row.removeClass('tl-q-dragging');
                    listEl.querySelectorAll('.tl-q-row').forEach(r => r.removeClass('tl-q-dragover'));
                    if (!touchDragging) { dragIdx = null; return; }
                    touchDragging = false;
                    const touch = e.changedTouches[0];
                    const target = activeDocument.elementFromPoint(touch.clientX, touch.clientY)?.closest('.tl-q-row') as HTMLElement | null;
                    if (!target || target === row || !listEl.contains(target)) { dragIdx = null; return; }
                    const targetIdx = parseInt(target.dataset.index || '-1', 10);
                    if (dragIdx === null || dragIdx === targetIdx || targetIdx < 0) { dragIdx = null; return; }
                    void (async () => {
                        const items = this.plugin.settings.eveningQuestions;
                        const [moved] = items.splice(dragIdx, 1);
                        items.splice(targetIdx, 0, moved);
                        dragIdx = null;
                        await this.plugin.saveSettings();
                        this.display();
                    })();
                }, { passive: true });
            }
        });

        // --- Add question link ---
        const addLink = listEl.createSpan({ cls: 'tl-q-add-link', text: t('settings.addQuestion') });
        addLink.addEventListener('click', () => {
            const newQ: EveningQuestionConfig = {
                type: 'free_writing',
                sectionName: '',
                initialMessage: '',
                required: false,
                enabled: true,
            };
            this.plugin.settings.eveningQuestions.push(newQ);
            void this.plugin.saveSettings().then(() => this.display());
        });
    }

    /**
     * Detail panel inserted as a sibling below an expanded row. Contains a
     * labeled name input and a labeled content textarea. Edits are written
     * through to the settings array in place; the row's name span is
     * mirrored live so the static label stays in sync as the user types.
     */
    private renderQuestionDetail(
        afterEl: HTMLElement,
        question: EveningQuestionConfig,
        index: number,
        nameEl: HTMLElement,
    ): void {
        const detailEl = afterEl.ownerDocument.createElement('div');
        detailEl.classList.add('tl-q-detail');
        afterEl.after(detailEl);

        // --- Name input (labeled) ---
        const nameRow = detailEl.createDiv('tl-q-detail-row');
        nameRow.createDiv({ cls: 'tl-q-detail-label', text: t('settings.questionName') });
        const nameInput = nameRow.createEl('input', { cls: 'tl-q-detail-input' });
        nameInput.type = 'text';
        nameInput.value = question.sectionName;
        nameInput.placeholder = t('settings.sectionNamePlaceholder');
        nameInput.addEventListener('input', () => {
            this.plugin.settings.eveningQuestions[index].sectionName = nameInput.value;
            nameEl.setText(nameInput.value || t('settings.unnamed'));
            void this.plugin.saveSettings();
        });

        // --- Content textarea (labeled) ---
        const contentRow = detailEl.createDiv('tl-q-detail-row');
        contentRow.createDiv({ cls: 'tl-q-detail-label', text: t('settings.questionText') });
        const textareaEl = contentRow.createEl('textarea', { cls: 'tl-q-detail-textarea' });
        textareaEl.value = question.initialMessage;
        textareaEl.placeholder = t('settings.questionPlaceholder');
        textareaEl.rows = 3;
        textareaEl.addEventListener('input', () => {
            this.plugin.settings.eveningQuestions[index].initialMessage = textareaEl.value;
            void this.plugin.saveSettings();
        });
    }

    /**
     * Render Pro license section in settings
     */
    private renderProLicense(containerEl: HTMLElement): void {
        const accessState = this.plugin.licenseManager.getAccessState();
        const isPaid = accessState === 'paid';
        const isTrial = accessState === 'trial';
        const hasAccess = isPaid || isTrial;
        const purchaseUrl = this.plugin.licenseManager.getPurchaseUrl();
        const trialDays = this.plugin.licenseManager.getTrialDaysRemaining();
        const trialExpiry = this.plugin.licenseManager.getTrialExpiryDate() ?? '—';

        new Setting(containerEl).setName(t('settings.sectionPro')).setHeading();

        const proCardEl = containerEl.createDiv(`tl-settings-pro-card ${hasAccess ? 'is-pro' : 'is-free'}`);
        const headerEl = proCardEl.createDiv('tl-settings-pro-header');
        const copyEl = headerEl.createDiv('tl-settings-pro-copy');
        copyEl.createDiv({
            cls: 'tl-settings-card-kicker',
            text: isPaid
                ? 'TideLog Pro active'
                : isTrial
                    ? t('settings.trialKicker')
                    : 'TideLog Pro',
        });
        copyEl.createDiv({
            cls: 'tl-settings-card-title',
            text: isPaid
                ? t('settings.proActiveTitle')
                : isTrial
                    ? t('trial.activeTitle')
                    : accessState === 'license-inactive'
                        ? t('trial.licenseInactiveTitle')
                    : accessState === 'trial-expired'
                        ? t('trial.expiredTitle')
                        : t('settings.trialTitle'),
        });
        copyEl.createDiv({
            cls: 'tl-settings-card-desc',
            text: isPaid
                ? t('settings.proActiveDesc')
                : isTrial
                    ? t('settings.trialActiveDesc', String(trialDays), trialExpiry)
                    : accessState === 'license-inactive'
                        ? t('trial.licenseInactiveDesc')
                    : accessState === 'trial-expired'
                        ? t('settings.trialExpiredDesc', trialExpiry)
                        : t('settings.trialEligibleDesc'),
        });
        headerEl.createDiv({
            cls: `tl-settings-pro-status ${hasAccess ? 'is-pro' : 'is-free'}`,
            text: isPaid
                ? t('settings.proActive')
                : isTrial
                    ? t('settings.trialActiveBadge', String(trialDays))
                    : accessState === 'license-inactive'
                        ? t('trial.licenseInactiveBadge')
                    : accessState === 'trial-expired'
                        ? t('settings.trialExpiredBadge')
                        : t('settings.proFree'),
        });

        const proFeaturesEl = proCardEl.createDiv('tl-settings-pro-benefits');
        [
            t('settings.proFeatureReview'),
            t('settings.proFeatureInsight'),
            t('settings.proFeatureReports'),
        ].forEach((feature) => {
            proFeaturesEl.createSpan({ cls: 'tl-settings-pro-benefit', text: feature });
        });

        if (isPaid) {
            const activeEl = proCardEl.createDiv('tl-settings-pro-active-panel');
            const label = this.plugin.licenseManager.getLicenseLabel();
            const expiry = this.plugin.licenseManager.getExpiryDate();
            const expiryText = expiry ? ` · ${t('settings.proExpiry')}: ${expiry}` : '';
            activeEl.createDiv({ cls: 'tl-settings-pro-meta', text: `${label} ${t('settings.proActivated')}${expiryText}` });
            return;
        }

        if (accessState === 'free') {
            const trialPanelEl = proCardEl.createDiv('tl-settings-trial-panel');
            const trialBtn = trialPanelEl.createEl('button', {
                cls: 'mod-cta tl-settings-action-btn tl-settings-pro-primary-btn',
                text: t('settings.trialStart'),
            });
            trialBtn.addEventListener('click', () => {
                void (async () => {
                    trialBtn.disabled = true;
                    trialBtn.setText(t('trial.starting'));
                    const started = await this.plugin.licenseManager.startTrial();
                    if (started) {
                        new Notice(t('trial.startedNotice'));
                        this.display();
                    } else {
                        trialBtn.disabled = false;
                        trialBtn.setText(t('settings.trialStart'));
                        new Notice(t('trial.startFailed'));
                    }
                })();
            });
            trialPanelEl.createDiv({ cls: 'tl-settings-pro-purchase-note', text: t('trial.noCharge') });
        }

        const purchasePanelEl = proCardEl.createDiv('tl-settings-pro-purchase-panel');
        const purchaseBtn = purchasePanelEl.createEl('button', { cls: 'mod-cta tl-settings-action-btn tl-settings-pro-primary-btn', text: t('pro.purchase') });
        purchaseBtn.addEventListener('click', () => { window.open(purchaseUrl); });
        purchasePanelEl.createDiv({ cls: 'tl-settings-pro-purchase-note', text: t('settings.proPurchaseNote') });

        const licensePanelEl = proCardEl.createDiv('tl-settings-license-panel');
        licensePanelEl.createDiv({ cls: 'tl-settings-license-title', text: t('settings.haveLicense') });
        const licenseRowEl = licensePanelEl.createDiv('tl-settings-license-row');
        let keyValue = '';
        const inputEl = licenseRowEl.createEl('input', { cls: 'tl-setting-input-key' });
        inputEl.type = 'text';
        inputEl.placeholder = t('settings.licenseKeyPlaceholder');
        inputEl.addEventListener('input', () => { keyValue = inputEl.value; });
        const activateBtn = licenseRowEl.createEl('button', { cls: 'tl-settings-action-btn tl-settings-license-activate-btn', text: t('settings.activate') });
        activateBtn.addEventListener('click', () => {
            void (async () => {
                activateBtn.setText(t('settings.verifying'));
                activateBtn.setAttribute('disabled', 'true');
                const result = await this.plugin.licenseManager.activate(keyValue);
                if (result.success) {
                    new Notice(`🎉 ${result.message}`);
                    this.display();
                } else {
                    new Notice(`❌ ${result.message}`);
                    activateBtn.setText(t('settings.activate'));
                    activateBtn.removeAttribute('disabled');
                }
            })();
        });
        const helperEl = licensePanelEl.createDiv('tl-settings-license-helper');
        helperEl.createSpan({ text: t('settings.licenseHelpText') });
        const portalLink = helperEl.createEl('a', { text: t('settings.lookupLicenseInline'), href: 'https://tidelog-api.mydreamchronicle.com/portal' });
        portalLink.setAttr('target', '_blank');
    }

}
