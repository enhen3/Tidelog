/**
 * Settings Tab - Plugin configuration UI
 * Phase 5: Custom model names, custom provider, streamlined evening questions
 */

import {
    App,
    Modal,
    PluginSettingTab,
    Setting,
    Notice,
    Platform,
    normalizePath,
    FuzzySuggestModal,
    TFolder,
} from 'obsidian';

import TideLogPlugin from '../main';
import { EveningQuestionConfig } from '../types';
import { t } from '../i18n';
import { bindAfdianPurchaseFlow } from '../utils/purchase-flow';
import type { Language } from '../i18n';
import { OnboardingModal } from '../views/onboarding-modal';

class VaultFolderSuggestModal extends FuzzySuggestModal<TFolder> {
    constructor(
        app: App,
        private readonly onChooseFolder: (path: string) => void,
    ) {
        super(app);
        this.setPlaceholder(t('settings.chooseFolderPlaceholder'));
    }

    getItems(): TFolder[] {
        return this.app.vault.getAllLoadedFiles()
            .filter((file): file is TFolder => file instanceof TFolder && file.path !== '/')
            .sort((a, b) => a.path.localeCompare(b.path));
    }

    getItemText(folder: TFolder): string {
        return folder.path;
    }

    onChooseItem(folder: TFolder): void {
        this.onChooseFolder(folder.path);
    }
}

export class LicenseActivationModal extends Modal {
    constructor(
        app: App,
        private readonly plugin: TideLogPlugin,
        private readonly onActivated: () => void,
    ) {
        super(app);
    }

    onOpen(): void {
        this.modalEl.addClass('tl-license-activation-shell');
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('tl-license-activation-modal');

        contentEl.createEl('h2', { text: t('settings.activationModalTitle') });
        contentEl.createEl('p', {
            cls: 'tl-license-activation-desc',
            text: t('settings.activationModalDesc'),
        });

        const formEl = contentEl.createDiv('tl-license-activation-form');
        const inputEl = formEl.createEl('input', { cls: 'tl-setting-input-key' });
        inputEl.type = 'text';
        inputEl.placeholder = t('settings.licenseKeyPlaceholder');
        inputEl.autocomplete = 'off';

        const activateBtn = formEl.createEl('button', {
            cls: 'mod-cta tl-settings-action-btn',
            text: t('settings.activate'),
        });
        activateBtn.disabled = true;

        const errorEl = contentEl.createDiv('tl-license-activation-error');
        errorEl.setAttr('role', 'alert');
        const submit = async () => {
            const keyValue = inputEl.value.trim();
            if (!keyValue || activateBtn.disabled) return;

            activateBtn.disabled = true;
            activateBtn.setText(t('settings.verifying'));
            errorEl.empty();
            const result = await this.plugin.licenseManager.activate(keyValue);
            if (result.success) {
                new Notice(`🎉 ${result.message}`);
                this.close();
                this.onActivated();
                return;
            }

            errorEl.setText(result.message);
            activateBtn.setText(t('settings.activate'));
            activateBtn.disabled = false;
        };

        inputEl.addEventListener('input', () => {
            activateBtn.disabled = inputEl.value.trim().length === 0;
            errorEl.empty();
        });
        inputEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                void submit();
            }
        });
        activateBtn.addEventListener('click', () => void submit());

        const portalLink = contentEl.createEl('a', {
            cls: 'tl-license-activation-lookup',
            text: t('settings.lookupLicenseInline'),
            href: 'https://tidelog-api.mydreamchronicle.com/portal',
        });
        portalLink.setAttr('target', '_blank');
        window.setTimeout(() => inputEl.focus(), 0);
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

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
        this.renderProLicense(containerEl);
        this.renderGettingStarted(containerEl);
        this.renderEveningQuestions(containerEl);
        this.renderFolderSettings(containerEl);
        this.renderDayBoundarySetting(containerEl);
        this.renderLegacyImportEntry(containerEl);
        this.renderLanguageSetting(containerEl);
    }

    private renderFolderSettings(containerEl: HTMLElement): void {
        new Setting(containerEl).setName(t('settings.sectionFolders')).setHeading();

        this.renderFolderPickerSetting(containerEl, 'dailyFolder', t('settings.dailyFolder'), t('settings.dailyFolderDesc'));
        this.renderFolderPickerSetting(containerEl, 'planFolder', t('settings.planFolder'), t('settings.planFolderDesc'));
        this.renderFolderPickerSetting(containerEl, 'archiveFolder', t('settings.archiveFolder'), t('settings.archiveFolderDesc'));
    }

    private renderFolderPickerSetting(
        containerEl: HTMLElement,
        key: 'dailyFolder' | 'planFolder' | 'archiveFolder',
        name: string,
        description: string,
    ): void {
        new Setting(containerEl)
            .setName(name)
            .setDesc(description)
            .addButton((button) => {
                const updateButton = () => {
                    button.setButtonText(this.plugin.settings[key] || t('settings.chooseFolder'));
                    button.buttonEl.setAttr('aria-label', `${name}: ${this.plugin.settings[key] || t('settings.chooseFolder')}`);
                };
                updateButton();
                button.buttonEl.addClass('tl-settings-folder-picker');
                button.onClick(() => {
                    new VaultFolderSuggestModal(this.app, (path) => {
                        this.plugin.settings[key] = normalizePath(path);
                        updateButton();
                        void this.plugin.saveSettings();
                    }).open();
                });
            });
    }

    private renderDayBoundarySetting(containerEl: HTMLElement): void {
        const getBoundaryExampleTime = (value: number) => {
            if (value <= 1) return '00:30';
            const exampleHour = Math.max(0, Math.min(7, value - 1));
            return `${String(exampleHour).padStart(2, '0')}:30`;
        };
        const formatBoundary = (value: number) => value === 0
            ? t('settings.dayBoundaryAtMidnight')
            : t('settings.dayBoundaryValue', `${String(value).padStart(2, '0')}:00`, getBoundaryExampleTime(value));

        const clampedBoundaryHour = Math.max(0, Math.min(8, Number(this.plugin.settings.dayBoundaryHour) || 0));
        if (clampedBoundaryHour !== this.plugin.settings.dayBoundaryHour) {
            this.plugin.settings.dayBoundaryHour = clampedBoundaryHour;
            void this.plugin.saveSettings();
        }

        const boundarySetting = new Setting(containerEl)
            .setName(t('settings.dayBoundaryHour'))
            .setDesc(formatBoundary(clampedBoundaryHour));

        boundarySetting.addDropdown((dropdown) => {
            for (let hour = 0; hour <= 8; hour += 1) {
                dropdown.addOption(String(hour), `${String(hour).padStart(2, '0')}:00`);
            }
            return dropdown
                .setValue(String(clampedBoundaryHour))
                .onChange((value) => {
                    const hour = Number(value);
                    this.plugin.settings.dayBoundaryHour = hour;
                    boundarySetting.setDesc(formatBoundary(hour));
                    void this.plugin.saveSettings();
                });
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

    private renderSettingsHero(containerEl: HTMLElement): void {
        const accessState = this.plugin.licenseManager.getAccessState();
        const trialDays = this.plugin.licenseManager.getTrialDaysRemaining();
        const heroEl = containerEl.createDiv('tl-settings-hero tl-settings-hero-compact');
        const logoEl = heroEl.createDiv('tl-settings-logo-mark');
        logoEl.createSpan('tl-settings-logo-line');
        logoEl.createSpan('tl-settings-logo-dot');
        const copyEl = heroEl.createDiv('tl-settings-hero-copy');
        copyEl.createDiv({
            cls: 'tl-settings-hero-title',
            text: t('settings.heroTitle'),
        });
        copyEl.createEl('p', {
            cls: 'tl-settings-hero-desc',
            text: t('settings.heroDesc'),
        });
        heroEl.createDiv({
            cls: `tl-settings-hero-status ${accessState === 'paid' || accessState === 'trial' ? 'is-pro' : 'is-free'}`,
            text: accessState === 'paid'
                ? t('settings.proActive')
                : accessState === 'trial'
                    ? t('settings.trialRemainingBadge', String(trialDays))
                    : accessState === 'trial-expired'
                        ? t('settings.trialExpiredBadge')
                        : accessState === 'license-inactive'
                            ? t('trial.licenseInactiveBadge')
                            : t('settings.proFree'),
        });
    }

    /**
     * Render onboarding entry point for users who want to revisit setup.
     */
    private renderGettingStarted(containerEl: HTMLElement): void {
        const shouldOpenByDefault = !this.plugin.settings.quickGuideSeen;
        const guideEl = containerEl.createEl('details', { cls: 'tl-settings-quick-guide' });
        guideEl.open = shouldOpenByDefault;

        const summaryEl = guideEl.createEl('summary', { cls: 'tl-settings-quick-guide-summary' });
        summaryEl.createSpan({ cls: 'tl-settings-quick-guide-heading', text: t('settings.sectionQuickGuide') });
        summaryEl.createSpan({ cls: 'tl-settings-quick-guide-flow', text: t('settings.quickGuideFlow') });

        const bodyEl = guideEl.createDiv('tl-settings-quick-guide-body');
        const stepsEl = bodyEl.createDiv('tl-settings-quick-guide-steps');
        [
            [
                'plan',
                t('settings.quickGuidePlanStage'),
                t('settings.quickGuidePlanTitle'),
                t('settings.quickGuidePlanUser'),
                t('settings.quickGuidePlanAI'),
            ],
            [
                'review',
                t('settings.quickGuideReviewStage'),
                t('settings.quickGuideReviewTitle'),
                t('settings.quickGuideReviewUser'),
                t('settings.quickGuideReviewAI'),
            ],
            [
                'insights',
                t('settings.quickGuideInsightsStage'),
                t('settings.quickGuideInsightsTitle'),
                t('settings.quickGuideInsightsUser'),
                t('settings.quickGuideInsightsAI'),
            ],
        ].forEach(([phase, stage, title, userAction, aiAction], index) => {
            const stepEl = stepsEl.createDiv('tl-settings-quick-guide-step');
            stepEl.addClass(`is-${phase}`);
            stepEl.createSpan({ cls: 'tl-settings-quick-guide-number', text: String(index + 1) });
            const copyEl = stepEl.createDiv('tl-settings-quick-guide-copy');
            copyEl.createDiv({ cls: 'tl-settings-quick-guide-stage', text: stage });
            copyEl.createDiv({ cls: 'tl-settings-quick-guide-title', text: title });
            const userRowEl = copyEl.createDiv('tl-settings-quick-guide-role-row');
            userRowEl.createSpan({ cls: 'tl-settings-quick-guide-role is-user', text: t('settings.quickGuideUserLabel') });
            userRowEl.createSpan({ text: userAction });
            const aiRowEl = copyEl.createDiv('tl-settings-quick-guide-role-row');
            aiRowEl.createSpan({ cls: 'tl-settings-quick-guide-role is-ai', text: t('settings.quickGuideAILabel') });
            aiRowEl.createSpan({ text: aiAction });
        });
        bodyEl.createDiv({ cls: 'tl-settings-quick-guide-loop', text: t('settings.quickGuideLoop') });
        const actionEl = bodyEl.createDiv('tl-settings-quick-guide-action');
        const openBtn = actionEl.createEl('button', {
            cls: 'tl-settings-action-btn',
            text: t('settings.openGettingStarted'),
        });
        openBtn.addEventListener('click', () => new OnboardingModal(this.app, this.plugin).open());

        if (shouldOpenByDefault) {
            this.plugin.settings.quickGuideSeen = true;
            void this.plugin.saveSettings();
        }
    }

    private renderLegacyImportEntry(containerEl: HTMLElement): void {
        new Setting(containerEl).setName(t('settings.sectionImportHelp')).setHeading();
        const importSetting = new Setting(containerEl)
            .setName(t('settings.legacyImportTitle'))
            .setDesc('');
        this.legacyImportDescEl = importSetting.descEl;
        importSetting.addButton((button) => {
            this.legacyImportButtonEl = button.buttonEl;
            button.onClick(() => void this.plugin.openFirstInsight());
        });
        this.refreshLegacyImportEntryState();
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
        const questions = this.plugin.settings.eveningQuestions;
        const isPro = this.plugin.licenseManager.isPro();
        const enabledCount = questions.filter((q) => q.enabled !== false).length;
        new Setting(containerEl)
            .setName(t('settings.eveningQuestions'))
            .setDesc(isPro
                ? t('settings.reviewEnabledSummary', enabledCount, questions.length)
                : t('settings.reviewFreeSummary', enabledCount, questions.length))
            .setHeading();

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
            toggleWrap.createSpan('tl-q-toggle-track');
            toggleWrap.addEventListener('click', (e) => {
                e.stopPropagation();
            });
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

            // Built-in questions are part of the review workflow contract. Only
            // questions explicitly created by the user can be deleted.
            if (question.custom === true) {
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
            }

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
                custom: true,
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
            cls: 'tl-settings-card-title',
            text: isPaid
                ? 'TideLog Pro'
                : isTrial
                    ? t('settings.trialCompactTitle')
                    : accessState === 'license-inactive'
                        ? t('trial.licenseInactiveTitle')
                    : accessState === 'trial-expired'
                        ? t('settings.trialExpiredTitle')
                        : t('settings.freePlanTitle'),
        });
        copyEl.createDiv({
            cls: 'tl-settings-card-desc',
            text: isPaid
                ? t('settings.proActiveCompactDesc')
                : isTrial
                    ? t('settings.trialActiveCompactDesc', trialExpiry)
                    : accessState === 'license-inactive'
                        ? t('trial.licenseInactiveDesc')
                    : accessState === 'trial-expired'
                        ? t('settings.trialExpiredCompactDesc')
                        : t('settings.freePlanDesc'),
        });
        const actionEl = headerEl.createDiv('tl-settings-pro-actions');
        actionEl.createDiv({
            cls: `tl-settings-pro-status ${hasAccess ? 'is-pro' : 'is-free'}`,
            text: isPaid
                ? t('settings.proActive')
                : isTrial
                    ? t('settings.trialRemainingBadge', String(trialDays))
                    : accessState === 'license-inactive'
                        ? t('trial.licenseInactiveBadge')
                    : accessState === 'trial-expired'
                        ? t('settings.trialExpiredBadge')
                        : t('settings.proFree'),
        });

        if (isPaid) {
            const label = this.plugin.licenseManager.getLicenseLabel();
            const expiry = this.plugin.licenseManager.getExpiryDate();
            const expiryText = expiry ? ` · ${t('settings.proExpiry')}: ${expiry}` : '';
            copyEl.createDiv({ cls: 'tl-settings-pro-meta', text: `${label} ${t('settings.proActivated')}${expiryText}` });
            return;
        }

        if (accessState === 'free') {
            const trialBtn = actionEl.createEl('button', {
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
                        if (this.plugin.licenseManager.getAccessState() !== 'free') {
                            this.display();
                            new Notice(t('trial.startFailed'));
                            return;
                        }
                        trialBtn.disabled = false;
                        trialBtn.setText(t('settings.trialStart'));
                        new Notice(t('trial.startFailed'));
                    }
                })();
            });
            actionEl.createSpan({ cls: 'tl-settings-pro-action-note', text: t('trial.compactPromise') });
        }

        const purchaseBtn = actionEl.createEl('button', { cls: 'tl-settings-action-btn tl-settings-pro-purchase-btn', text: t('settings.proPurchase') });
        bindAfdianPurchaseFlow(purchaseBtn, purchaseUrl, () => {
            purchaseBtn.setText(t('settings.proPurchaseRetry'));
        });
        const activateProBtn = actionEl.createEl('button', {
            cls: 'tl-settings-action-btn tl-settings-pro-activate-btn',
            text: t('settings.activatePro'),
        });
        activateProBtn.addEventListener('click', () => {
            new LicenseActivationModal(this.app, this.plugin, () => this.display()).open();
        });
    }

}
