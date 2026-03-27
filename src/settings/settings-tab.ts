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
} from 'obsidian';

import TideLogPlugin from '../main';
import { AIProviderType, EveningQuestionConfig } from '../types';
import { t } from '../i18n';
import type { Language } from '../i18n';
import { formatAPIError } from '../utils/error-formatter';

export class TideLogSettingTab extends PluginSettingTab {
    plugin: TideLogPlugin;

    constructor(app: App, plugin: TideLogPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        if (Platform.isMobile) containerEl.addClass('is-mobile');

        // =================================================================
        // Language Setting
        // =================================================================
        new Setting(containerEl).setName(t('settings.language')).setHeading();

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
                        void this.plugin.saveSettings().then(() => this.display());
                    })
            );

        // =================================================================
        // Pro License
        // =================================================================
        this.renderProLicense(containerEl);

        // =================================================================
        // AI Provider Settings
        // =================================================================
        new Setting(containerEl).setName(t('settings.sectionAI')).setHeading();

        // Active provider selection
        new Setting(containerEl)
            .setName(t('settings.aiProvider'))
            .setDesc(t('settings.aiProviderDesc'))
            .addDropdown((dropdown) =>
                dropdown
                    .addOption('openrouter', 'OpenRouter')
                    .addOption('anthropic', 'Anthropic Claude')
                    .addOption('gemini', 'Google Gemini')
                    .addOption('openai', 'OpenAI')
                    .addOption('siliconflow', 'SiliconFlow')
                    .addOption('custom', 'Custom (OpenAI compatible)')
                    .setValue(this.plugin.settings.activeProvider)
                    .onChange((value) => {
                        this.plugin.settings.activeProvider = value as AIProviderType;
                        void this.plugin.saveSettings().then(() => this.display());
                    })
            );

        // Provider-specific settings
        this.renderProviderSettings(containerEl);

        // =================================================================
        // Folder Settings
        // =================================================================
        new Setting(containerEl).setName(t('settings.sectionFolders')).setHeading();

        new Setting(containerEl)
            .setName(t('settings.dailyFolder'))
            .setDesc(t('settings.dailyFolderDesc'))
            .addText((text) =>
                text
                    .setPlaceholder('01-Daily')
                    .setValue(this.plugin.settings.dailyFolder)
                    .onChange((value) => {
                        this.plugin.settings.dailyFolder = value;
                        void this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName(t('settings.planFolder'))
            .setDesc(t('settings.planFolderDesc'))
            .addText((text) =>
                text
                    .setPlaceholder('02-Plan')
                    .setValue(this.plugin.settings.planFolder)
                    .onChange((value) => {
                        this.plugin.settings.planFolder = value;
                        void this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName(t('settings.archiveFolder'))
            .setDesc(t('settings.archiveFolderDesc'))
            .addText((text) =>
                text
                    .setPlaceholder('03-Archive')
                    .setValue(this.plugin.settings.archiveFolder)
                    .onChange((value) => {
                        this.plugin.settings.archiveFolder = value;
                        void this.plugin.saveSettings();
                    })
            );

        // =================================================================
        // Date Settings
        // =================================================================
        new Setting(containerEl).setName(t('settings.dayBoundaryHour')).setHeading();

        new Setting(containerEl)
            .setName(t('settings.dayBoundaryHour'))
            .setDesc(t('settings.dayBoundaryHourDesc'))
            .addSlider((slider) =>
                slider
                    .setLimits(0, 12, 1)
                    .setValue(this.plugin.settings.dayBoundaryHour)
                    .setDynamicTooltip()
                    .onChange((value) => {
                        this.plugin.settings.dayBoundaryHour = value;
                        void this.plugin.saveSettings();
                    })
            );

        // =================================================================
        // Evening Question Editor
        // =================================================================
        this.renderEveningQuestions(containerEl);
    }

    /**
     * Render settings for the currently selected AI provider
     */
    private renderProviderSettings(containerEl: HTMLElement): void {
        const provider = this.plugin.settings.activeProvider;
        const config = this.plugin.settings.providers[provider];

        // --- Custom provider: Base URL ---
        if (provider === 'custom') {
            const urlSetting = new Setting(containerEl)
                .setName('API base URL')
                .setDesc(t('settings.baseUrlDesc'));

            urlSetting.addText((text) => {
                text.inputEl.addClass('tl-setting-input-wide');
                text
                    .setPlaceholder('https://api.deepseek.com/v1')
                    .setValue(config.baseUrl || '')
                    .onChange((value) => {
                        this.plugin.settings.providers[provider].baseUrl = value;
                        void this.plugin.saveSettings();
                    });
            });

            // Preset URL buttons
            const presetDesc = urlSetting.descEl;
            const presetContainer = presetDesc.createDiv('tl-preset-urls');
            const presets: [string, string][] = [
                ['DeepSeek', 'https://api.deepseek.com/v1'],
                ['SiliconFlow', 'https://api.siliconflow.cn/v1'],
                ['Groq', 'https://api.groq.com/openai/v1'],
                ['Ollama', 'http://localhost:11434/v1'],
            ];
            for (const [label, url] of presets) {
                const btn = presetContainer.createEl('button', {
                    cls: 'tl-preset-btn',
                    text: label,
                });
                btn.addEventListener('click', () => {
                    void (async () => {
                        this.plugin.settings.providers[provider].baseUrl = url;
                        await this.plugin.saveSettings();
                        this.display();
                    })();
                });
            }
        }

        // --- API Key with password toggle ---
        const apiKeySetting = new Setting(containerEl)
            .setName(`${this.getProviderName(provider)} API key`)
            .setDesc(t('settings.apiKeyDesc', this.getProviderName(provider)));

        let apiKeyInput: HTMLInputElement;
        apiKeySetting.addText((text) => {
            apiKeyInput = text.inputEl;
            apiKeyInput.type = 'password';
            apiKeyInput.addClass('tl-setting-input-key');
            text
                .setPlaceholder(t('settings.apiKeyPlaceholder'))
                .setValue(config.apiKey)
                .onChange((value) => {
                    this.plugin.settings.providers[provider].apiKey = value;
                    void this.plugin.saveSettings();
                });
        });

        apiKeySetting.addExtraButton((button) => {
            button
                .setIcon('eye-off')
                .setTooltip(t('settings.toggleApiKey'))
                .onClick(() => {
                    if (apiKeyInput.type === 'password') {
                        apiKeyInput.type = 'text';
                        button.setIcon('eye');
                        button.setTooltip(t('settings.hideApiKey'));
                    } else {
                        apiKeyInput.type = 'password';
                        button.setIcon('eye-off');
                        button.setTooltip(t('settings.showApiKey'));
                    }
                });
        });

        // --- Model selection: dropdown + free text input ---
        const models = this.getModelsForProvider(provider);
        const hasPresets = Object.keys(models).length > 0;

        const modelSetting = new Setting(containerEl)
            .setName(t('settings.model'))
            .setDesc(t('settings.modelDesc'));

        if (hasPresets) {
            modelSetting.addDropdown((dropdown) => {
                dropdown.addOption('', '— Manual —');
                for (const [value, name] of Object.entries(models)) {
                    dropdown.addOption(value, name);
                }
                // If current model is in presets, select it; otherwise leave at manual
                dropdown.setValue(models[config.model] ? config.model : '');
                dropdown.onChange((value) => {
                    if (value) {
                        this.plugin.settings.providers[provider].model = value;
                        void this.plugin.saveSettings().then(() => this.display());
                    }
                });
            });
        }

        modelSetting.addText((text) => {
            text.inputEl.addClass('tl-setting-input-model');
            text
                .setPlaceholder(this.getModelPlaceholder(provider))
                .setValue(config.model)
                .onChange((value) => {
                    this.plugin.settings.providers[provider].model = value;
                    void this.plugin.saveSettings();
                });
        });

        // --- Test connection button ---
        new Setting(containerEl)
            .setName(t('settings.testConnection'))
            .setDesc(t('settings.testConnectionDesc'))
            .addButton((button) =>
                button
                    .setButtonText(t('settings.testBtn'))
                    .setCta()
                    .onClick(() => {
                        void (async () => {
                            button.setButtonText(t('settings.testing'));
                            button.setDisabled(true);

                            try {
                                const aiProvider = this.plugin.getAIProvider();
                                const success = await aiProvider.testConnection();

                                if (success) {
                                    new Notice(t('settings.testSuccess'));
                                    button.setButtonText(t('settings.testSuccessBtn'));
                                    setTimeout(() => {
                                        button.setButtonText(t('settings.testBtn'));
                                    }, 2000);
                                } else {
                                    new Notice(t('settings.testFail'));
                                    button.setButtonText(t('settings.testFailBtn'));
                                    setTimeout(() => {
                                        button.setButtonText(t('settings.testBtn'));
                                    }, 2000);
                                }
                            } catch (error) {
                                const activeProvider = this.plugin.settings.activeProvider;
                                const errMsg = formatAPIError(error, activeProvider);
                                // Extract error code for Notice (strip markdown)
                                const codeMatch = errMsg.match(/\*\*(TL-\d+)\*\*/);
                                const code = codeMatch ? codeMatch[1] : '';
                                new Notice(`❌ ${t('settings.testError')} ${code}`, 8000);
                                button.setButtonText(code ? `❌ ${code}` : t('settings.testErrorBtn'));
                                setTimeout(() => {
                                    button.setButtonText(t('settings.testBtn'));
                                }, 4000);
                            }

                            button.setDisabled(false);
                        })();
                    })
            );
    }

    /**
     * Get display name for provider
     */
    private getProviderName(provider: AIProviderType): string {
        const names: Record<AIProviderType, string> = {
            openrouter: 'OpenRouter',
            anthropic: 'Anthropic Claude',
            gemini: 'Google Gemini',
            openai: 'OpenAI',
            siliconflow: 'SiliconFlow',
            custom: t('settings.customProvider'),
        };
        return names[provider];
    }

    /**
     * Get placeholder for model text input
     */
    private getModelPlaceholder(provider: AIProviderType): string {
        const placeholders: Record<AIProviderType, string> = {
            openrouter: 'anthropic/claude-sonnet-4',
            anthropic: 'claude-sonnet-4-20250514',
            gemini: 'gemini-2.0-flash',
            openai: 'gpt-4o',
            siliconflow: 'deepseek-ai/DeepSeek-V3.2',
            custom: 'deepseek-chat',
        };
        return placeholders[provider];
    }

    /**
     * Get recommended models for provider (empty for custom)
     */
    private getModelsForProvider(provider: AIProviderType): Record<string, string> {
        switch (provider) {
            case 'openrouter':
                return {
                    'anthropic/claude-sonnet-4': t('settings.recommended', 'Claude Sonnet 4'),
                    'anthropic/claude-3.5-sonnet': 'Claude 3.5 Sonnet',
                    'anthropic/claude-3-haiku': t('settings.fast', 'Claude 3 Haiku'),
                    'openai/gpt-4o': 'GPT-4o',
                    'openai/gpt-4o-mini': 'GPT-4o Mini',
                    'google/gemini-2.0-flash': 'Gemini 2.0 Flash',
                    'meta-llama/llama-3.3-70b': 'Llama 3.3 70B',
                };
            case 'anthropic':
                return {
                    'claude-sonnet-4-20250514': 'Claude Sonnet 4',
                    'claude-3-5-sonnet-20241022': 'Claude 3.5 Sonnet',
                    'claude-3-haiku-20240307': 'Claude 3 Haiku',
                };
            case 'gemini':
                return {
                    'gemini-2.0-flash': t('settings.recommended', 'Gemini 2.0 Flash'),
                    'gemini-2.0-flash-lite': t('settings.fast', 'Gemini 2.0 Flash Lite'),
                    'gemini-1.5-pro-latest': 'Gemini 1.5 Pro',
                    'gemini-1.5-flash-latest': 'Gemini 1.5 Flash',
                };
            case 'openai':
                return {
                    'gpt-4o': t('settings.recommended', 'GPT-4o'),
                    'gpt-4o-mini': 'GPT-4o Mini',
                    'gpt-4-turbo': 'GPT-4 Turbo',
                };
            case 'siliconflow':
                return {
                    'deepseek-ai/DeepSeek-V3.2': t('settings.recommended', 'DeepSeek V3.2'),
                    'deepseek-ai/DeepSeek-V3.1-Terminus': 'DeepSeek V3.1 Terminus',
                    'Qwen/Qwen3.5-397B-A17B': t('settings.powerful', 'Qwen3.5 397B'),
                    'Qwen/Qwen3-30B-A3B': t('settings.fast', 'Qwen3 30B'),
                    'deepseek-ai/DeepSeek-R1': t('settings.reasoning', 'DeepSeek R1'),
                    'Pro/zai-org/GLM-4.7': 'GLM-4.7',
                };
            case 'custom':
                // No presets — user types the model ID
                return {};
            default:
                return {};
        }
    }
    /**
     * Render the evening question editor — drag-and-drop, toggle, expand
     */
    private renderEveningQuestions(containerEl: HTMLElement): void {
        new Setting(containerEl).setName(t('settings.eveningQuestions')).setHeading();

        const questions = this.plugin.settings.eveningQuestions;

        // Question list container for drag-and-drop
        const listEl = containerEl.createDiv('tl-q-list');

        let dragIdx: number | null = null;

        questions.forEach((question, index) => {
            const row = listEl.createDiv('tl-q-row');
            row.setAttribute('draggable', 'true');
            row.dataset.index = String(index);

            // --- Drag handle ---
            const handle = row.createEl('span', { cls: 'tl-q-drag-handle', text: '\u2847' });
            handle.setAttribute('title', t('settings.dragToReorder'));

            // --- Expand triangle ---
            const triangle = row.createEl('span', { cls: 'tl-q-triangle' });
            triangle.textContent = '\u25b6';

            // --- Name (static text, replaced by input when expanded) ---
            const nameEl = row.createEl('span', { cls: 'tl-q-name', text: question.sectionName || t('settings.unnamed') });

            // --- Spacer ---
            row.createEl('span', { cls: 'tl-q-spacer' });

            // --- Delete button ---
            const deleteBtn = row.createEl('span', { cls: 'tl-q-icon-btn tl-q-icon-delete' });
            deleteBtn.textContent = '\u2715';
            deleteBtn.setAttribute('title', t('settings.delete'));
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                void (async () => {
                    this.plugin.settings.eveningQuestions.splice(index, 1);
                    await this.plugin.saveSettings();
                    this.display();
                })();
            });

            // --- Expand/collapse ---
            const toggleExpand = (e: Event) => {
                e.stopPropagation();
                const existing = row.nextElementSibling;
                if (existing && existing.hasClass('tl-q-detail')) {
                    // Collapse: sync name back and restore static text
                    existing.remove();
                    triangle.textContent = '\u25b6';
                    triangle.removeClass('tl-q-triangle-open');
                    // Replace input with span
                    const currentInput = row.querySelector('.tl-q-name-input') as HTMLInputElement;
                    if (currentInput) {
                        const newSpan = document.createElement('span');
                        newSpan.className = 'tl-q-name';
                        newSpan.textContent = currentInput.value || t('settings.unnamed');
                        currentInput.replaceWith(newSpan);
                    }
                } else {
                    // Expand: replace name span with editable input
                    triangle.textContent = '\u25bc';
                    triangle.addClass('tl-q-triangle-open');
                    const nameSpan = row.querySelector('.tl-q-name');
                    if (nameSpan) {
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.className = 'tl-q-name-input';
                        input.value = question.sectionName;
                        input.placeholder = t('settings.sectionNamePlaceholder');
                        input.addEventListener('input', () => {
                            this.plugin.settings.eveningQuestions[index].sectionName = input.value;
                            void this.plugin.saveSettings();
                        });
                        // Prevent drag when clicking input
                        input.addEventListener('mousedown', (ev) => ev.stopPropagation());
                        nameSpan.replaceWith(input);
                    }
                    this.renderQuestionDetail(row, question, index);
                }
            };

            triangle.addEventListener('click', toggleExpand);
            nameEl.addEventListener('click', toggleExpand);

            // --- Drag events ---
            row.addEventListener('dragstart', (e) => {
                dragIdx = index;
                row.addClass('tl-q-dragging');
                e.dataTransfer?.setData('text/plain', String(index));
            });

            row.addEventListener('dragend', () => {
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
                    const [moved] = items.splice(dragIdx!, 1);
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
                        touchClone.style.position = 'fixed';
                        touchClone.style.left = `${row.getBoundingClientRect().left}px`;
                        touchClone.style.width = `${row.getBoundingClientRect().width}px`;
                        touchClone.style.zIndex = '1000';
                        touchClone.style.opacity = '0.8';
                        touchClone.style.pointerEvents = 'none';
                        touchClone.style.boxShadow = '0 4px 16px rgba(0,0,0,0.2)';
                        document.body.appendChild(touchClone);
                    }
                    if (touchDragging) {
                        e.preventDefault();
                        if (touchClone) touchClone.style.top = `${touch.clientY - 22}px`;
                        listEl.querySelectorAll('.tl-q-row').forEach(r => r.removeClass('tl-q-dragover'));
                        const target = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.tl-q-row') as HTMLElement | null;
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
                    const target = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.tl-q-row') as HTMLElement | null;
                    if (!target || target === row || !listEl.contains(target)) { dragIdx = null; return; }
                    const targetIdx = parseInt(target.dataset.index || '-1', 10);
                    if (dragIdx === null || dragIdx === targetIdx || targetIdx < 0) { dragIdx = null; return; }
                    void (async () => {
                        const items = this.plugin.settings.eveningQuestions;
                        const [moved] = items.splice(dragIdx!, 1);
                        items.splice(targetIdx, 0, moved);
                        dragIdx = null;
                        await this.plugin.saveSettings();
                        this.display();
                    })();
                }, { passive: true });
            }
        });

        // --- Add question link ---
        const addLink = listEl.createEl('span', { cls: 'tl-q-add-link', text: t('settings.addQuestion') });
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
     * Render detail panel — only the textarea for question content
     */
    private renderQuestionDetail(afterEl: HTMLElement, question: EveningQuestionConfig, index: number): void {
        const detailEl = document.createElement('div');
        detailEl.addClass('tl-q-detail');
        afterEl.after(detailEl);

        // Only the question textarea
        const textareaEl = detailEl.createEl('textarea', { cls: 'tl-q-detail-textarea' });
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
        const isPro = this.plugin.licenseManager.isPro();

        new Setting(containerEl).setName('Pro').setHeading();

        // Status
        const statusSetting = new Setting(containerEl)
            .setName(t('settings.proStatus'))
            .setDesc(isPro ? t('settings.proActive') : t('settings.proFree'));

        if (isPro) {
            const label = this.plugin.licenseManager.getLicenseLabel();
            const expiry = this.plugin.licenseManager.getExpiryDate();
            const expiryText = expiry ? ` · ${t('settings.proExpiry')}: ${expiry}` : '';
            statusSetting.setDesc(`✅ ${label} ${t('settings.proActivated')}${expiryText}`);
        } else {
            // Key input + activate
            const keySetting = new Setting(containerEl)
                .setName(t('settings.redeemCode'))
                .setDesc(t('settings.redeemDesc'));

            let keyValue = '';
            keySetting.addText((text) => {
                text.inputEl.addClass('tl-setting-input-key');
                text
                    .setPlaceholder('TL-XXXX-XXXX-XXXX')
                    .onChange((value) => { keyValue = value; });
            });

            keySetting.addButton((button) =>
                button
                    .setButtonText(t('settings.activate'))
                    .setCta()
                    .onClick(() => {
                        void (async () => {
                            button.setButtonText(t('settings.verifying'));
                            button.setDisabled(true);
                            const result = await this.plugin.licenseManager.activate(keyValue);
                            if (result.success) {
                                new Notice(`🎉 ${result.message}`);
                                this.display();
                            } else {
                                new Notice(`❌ ${result.message}`);
                                button.setButtonText(t('settings.activate'));
                                button.setDisabled(false);
                            }
                        })();
                    })
            );

            // Purchase links
            const urls = this.plugin.licenseManager.getPurchaseUrls();
            const purchaseSetting = new Setting(containerEl)
                .setName(t('settings.purchasePro'))
                .setDesc(t('settings.purchaseDesc'));

            purchaseSetting.addButton((button) =>
                button
                    .setButtonText(t('settings.purchaseDomestic'))
                    .onClick(() => { window.open(urls.mianbaoduo); })
            );

            purchaseSetting.addButton((button) =>
                button
                    .setButtonText(t('settings.purchaseIntl'))
                    .onClick(() => { window.open(urls.gumroad); })
            );
        }
    }
}
