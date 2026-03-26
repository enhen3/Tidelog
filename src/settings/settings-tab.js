/**
 * Settings Tab - Plugin configuration UI
 * Phase 5: Custom model names, custom provider, streamlined evening questions
 */
import { PluginSettingTab, Setting, Notice, } from 'obsidian';
import { t } from '../i18n';
export class TideLogSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        // =================================================================
        // Language Setting
        // =================================================================
        new Setting(containerEl).setName(t('settings.language')).setHeading();
        new Setting(containerEl)
            .setName(t('settings.language'))
            .setDesc(t('settings.languageDesc'))
            .addDropdown((dropdown) => dropdown
            .addOption('zh', '简体中文')
            .addOption('en', 'English')
            .setValue(this.plugin.settings.language)
            .onChange((value) => {
            this.plugin.settings.language = value;
            void this.plugin.saveSettings().then(() => this.display());
        }));
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
            .addDropdown((dropdown) => dropdown
            .addOption('openrouter', 'OpenRouter')
            .addOption('anthropic', 'Anthropic Claude')
            .addOption('gemini', 'Google Gemini')
            .addOption('openai', 'OpenAI')
            .addOption('siliconflow', 'SiliconFlow')
            .addOption('custom', 'Custom (OpenAI compatible)')
            .setValue(this.plugin.settings.activeProvider)
            .onChange((value) => {
            this.plugin.settings.activeProvider = value;
            void this.plugin.saveSettings().then(() => this.display());
        }));
        // Provider-specific settings
        this.renderProviderSettings(containerEl);
        // =================================================================
        // Folder Settings
        // =================================================================
        new Setting(containerEl).setName(t('settings.sectionFolders')).setHeading();
        new Setting(containerEl)
            .setName(t('settings.dailyFolder'))
            .setDesc(t('settings.dailyFolderDesc'))
            .addText((text) => text
            .setPlaceholder('01-Daily')
            .setValue(this.plugin.settings.dailyFolder)
            .onChange((value) => {
            this.plugin.settings.dailyFolder = value;
            void this.plugin.saveSettings();
        }));
        new Setting(containerEl)
            .setName(t('settings.planFolder'))
            .setDesc(t('settings.planFolderDesc'))
            .addText((text) => text
            .setPlaceholder('02-Plan')
            .setValue(this.plugin.settings.planFolder)
            .onChange((value) => {
            this.plugin.settings.planFolder = value;
            void this.plugin.saveSettings();
        }));
        new Setting(containerEl)
            .setName(t('settings.archiveFolder'))
            .setDesc(t('settings.archiveFolderDesc'))
            .addText((text) => text
            .setPlaceholder('03-Archive')
            .setValue(this.plugin.settings.archiveFolder)
            .onChange((value) => {
            this.plugin.settings.archiveFolder = value;
            void this.plugin.saveSettings();
        }));
        // =================================================================
        // Date Settings
        // =================================================================
        new Setting(containerEl).setName(t('settings.dayBoundaryHour')).setHeading();
        new Setting(containerEl)
            .setName(t('settings.dayBoundaryHour'))
            .setDesc(t('settings.dayBoundaryHourDesc'))
            .addSlider((slider) => slider
            .setLimits(0, 12, 1)
            .setValue(this.plugin.settings.dayBoundaryHour)
            .setDynamicTooltip()
            .onChange((value) => {
            this.plugin.settings.dayBoundaryHour = value;
            void this.plugin.saveSettings();
        }));
        // =================================================================
        // Evening Question Editor
        // =================================================================
        this.renderEveningQuestions(containerEl);
    }
    /**
     * Render settings for the currently selected AI provider
     */
    renderProviderSettings(containerEl) {
        const provider = this.plugin.settings.activeProvider;
        const config = this.plugin.settings.providers[provider];
        // --- Custom provider: Base URL ---
        if (provider === 'custom') {
            const urlSetting = new Setting(containerEl)
                .setName('API Base URL')
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
            const presets = [
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
            .setName(`${this.getProviderName(provider)} API Key`)
            .setDesc(t('settings.apiKeyDesc', this.getProviderName(provider)));
        let apiKeyInput;
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
                }
                else {
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
            .addButton((button) => button
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
                    }
                    else {
                        new Notice(t('settings.testFail'));
                        button.setButtonText(t('settings.testFailBtn'));
                        setTimeout(() => {
                            button.setButtonText(t('settings.testBtn'));
                        }, 2000);
                    }
                }
                catch (error) {
                    new Notice(`❌ ${t('settings.testError')}: ${error}`);
                    button.setButtonText(t('settings.testErrorBtn'));
                    setTimeout(() => {
                        button.setButtonText(t('settings.testBtn'));
                    }, 2000);
                }
                button.setDisabled(false);
            })();
        }));
    }
    /**
     * Get display name for provider
     */
    getProviderName(provider) {
        const names = {
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
    getModelPlaceholder(provider) {
        const placeholders = {
            openrouter: 'anthropic/claude-sonnet-4',
            anthropic: 'claude-sonnet-4-20250514',
            gemini: 'gemini-2.0-flash',
            openai: 'gpt-4o',
            siliconflow: 'deepseek-ai/DeepSeek-V3',
            custom: 'deepseek-chat',
        };
        return placeholders[provider];
    }
    /**
     * Get recommended models for provider (empty for custom)
     */
    getModelsForProvider(provider) {
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
                    'deepseek-ai/DeepSeek-V3': t('settings.recommended', 'DeepSeek V3'),
                    'Qwen/Qwen3-235B-A22B': t('settings.powerful', 'Qwen3 235B'),
                    'Qwen/Qwen3-30B-A3B': t('settings.fast', 'Qwen3 30B'),
                    'deepseek-ai/DeepSeek-R1': t('settings.reasoning', 'DeepSeek R1'),
                    'THUDM/GLM-4-9B-Chat': 'GLM-4 9B Chat',
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
    renderEveningQuestions(containerEl) {
        new Setting(containerEl).setName(t('settings.eveningQuestions')).setHeading();
        const questions = this.plugin.settings.eveningQuestions;
        // Question list container for drag-and-drop
        const listEl = containerEl.createDiv('tl-q-list');
        let dragIdx = null;
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
            const toggleExpand = (e) => {
                e.stopPropagation();
                const existing = row.nextElementSibling;
                if (existing && existing.hasClass('tl-q-detail')) {
                    // Collapse: sync name back and restore static text
                    existing.remove();
                    triangle.textContent = '\u25b6';
                    triangle.removeClass('tl-q-triangle-open');
                    // Replace input with span
                    const currentInput = row.querySelector('.tl-q-name-input');
                    if (currentInput) {
                        const newSpan = document.createElement('span');
                        newSpan.className = 'tl-q-name';
                        newSpan.textContent = currentInput.value || t('settings.unnamed');
                        currentInput.replaceWith(newSpan);
                    }
                }
                else {
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
                if (dragIdx === null || dragIdx === index)
                    return;
                void (async () => {
                    const items = this.plugin.settings.eveningQuestions;
                    const [moved] = items.splice(dragIdx, 1);
                    items.splice(index, 0, moved);
                    await this.plugin.saveSettings();
                    this.display();
                })();
            });
        });
        // --- Add question link ---
        const addLink = listEl.createEl('span', { cls: 'tl-q-add-link', text: t('settings.addQuestion') });
        addLink.addEventListener('click', () => {
            const newQ = {
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
    renderQuestionDetail(afterEl, question, index) {
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
    renderProLicense(containerEl) {
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
        }
        else {
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
            keySetting.addButton((button) => button
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
                    }
                    else {
                        new Notice(`❌ ${result.message}`);
                        button.setButtonText(t('settings.activate'));
                        button.setDisabled(false);
                    }
                })();
            }));
            // Purchase links
            const urls = this.plugin.licenseManager.getPurchaseUrls();
            const purchaseSetting = new Setting(containerEl)
                .setName(t('settings.purchasePro'))
                .setDesc(t('settings.purchaseDesc'));
            purchaseSetting.addButton((button) => button
                .setButtonText(t('settings.purchaseDomestic'))
                .onClick(() => { window.open(urls.mianbaoduo); }));
            purchaseSetting.addButton((button) => button
                .setButtonText(t('settings.purchaseIntl'))
                .onClick(() => { window.open(urls.gumroad); }));
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dGluZ3MtdGFiLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic2V0dGluZ3MtdGFiLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7R0FHRztBQUVILE9BQU8sRUFFSCxnQkFBZ0IsRUFDaEIsT0FBTyxFQUNQLE1BQU0sR0FDVCxNQUFNLFVBQVUsQ0FBQztBQUlsQixPQUFPLEVBQUUsQ0FBQyxFQUFFLE1BQU0sU0FBUyxDQUFDO0FBRzVCLE1BQU0sT0FBTyxpQkFBa0IsU0FBUSxnQkFBZ0I7SUFHbkQsWUFBWSxHQUFRLEVBQUUsTUFBcUI7UUFDdkMsS0FBSyxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUNuQixJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztJQUN6QixDQUFDO0lBRUQsT0FBTztRQUNILE1BQU0sRUFBRSxXQUFXLEVBQUUsR0FBRyxJQUFJLENBQUM7UUFDN0IsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBRXBCLG9FQUFvRTtRQUNwRSxtQkFBbUI7UUFDbkIsb0VBQW9FO1FBQ3BFLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBRXRFLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQzthQUNuQixPQUFPLENBQUMsQ0FBQyxDQUFDLG1CQUFtQixDQUFDLENBQUM7YUFDL0IsT0FBTyxDQUFDLENBQUMsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO2FBQ25DLFdBQVcsQ0FBQyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQ3RCLFFBQVE7YUFDSCxTQUFTLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQzthQUN2QixTQUFTLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQzthQUMxQixRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDO2FBQ3ZDLFFBQVEsQ0FBQyxDQUFDLEtB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S0FBSyxDQUFDLENBQUM7b0JBQzlCLENBQUM7Z0JBQ0wsQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUNULENBQUMsQ0FBQyxDQUNULENBQUM7WUFFRixpQkFBaUI7WUFDakIsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDMUQsTUFBTSxlQUFlLEdBQUcsSUFBSSxPQUFPLENBQUMsV0FBVyxDQUFDO2lCQUMzQyxPQUFPLENBQUMsQ0FBQyxDQUFDLHNCQUFzQixDQUFDLENBQUM7aUJBQ2xDLE9BQU8sQ0FBQyxDQUFDLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDO1lBRXpDLGVBQWUsQ0FBQyxTQUFTLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUNqQyxNQUFNO2lCQUNELGFBQWEsQ0FBQyxDQUFDLENBQUMsMkJBQTJCLENBQUMsQ0FBQztpQkFDN0MsT0FBTyxDQUFDLEdBQUcsRUFBRSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQ3hELENBQUM7WUFFRixlQUFlLENBQUMsU0FBUyxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FDakMsTUFBTTtpQkFDRCxhQUFhLENBQUMsQ0FBQyxDQUFDLHVCQUF1QixDQUFDLENBQUM7aUJBQ3pDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUNyRCxDQUFDO1FBQ04sQ0FBQztJQUNMLENBQUM7Q0FDSiIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogU2V0dGluZ3MgVGFiIC0gUGx1Z2luIGNvbmZpZ3VyYXRpb24gVUlcbiAqIFBoYXNlIDU6IEN1c3RvbSBtb2RlbCBuYW1lcywgY3VzdG9tIHByb3ZpZGVyLCBzdHJlYW1saW5lZCBldmVuaW5nIHF1ZXN0aW9uc1xuICovXG5cbmltcG9ydCB7XG4gICAgQXBwLFxuICAgIFBsdWdpblNldHRpbmdUYWIsXG4gICAgU2V0dGluZyxcbiAgICBOb3RpY2UsXG59IGZyb20gJ29ic2lkaWFuJztcblxuaW1wb3J0IFRpZGVMb2dQbHVnaW4gZnJvbSAnLi4vbWFpbic7XG5pbXBvcnQgeyBBSVByb3ZpZGVyVHlwZSwgRXZlbmluZ1F1ZXN0aW9uQ29uZmlnIH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgdCB9IGZyb20gJy4uL2kxOG4nO1xuaW1wb3J0IHR5cGUgeyBMYW5ndWFnZSB9IGZyb20gJy4uL2kxOG4nO1xuXG5leHBvcnQgY2xhc3MgVGlkZUxvZ1NldHRpbmdUYWIgZXh0ZW5kcyBQbHVnaW5TZXR0aW5nVGFiIHtcbiAgICBwbHVnaW46IFRpZGVMb2dQbHVnaW47XG5cbiAgICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBUaWRlTG9nUGx1Z2luKSB7XG4gICAgICAgIHN1cGVyKGFwcCwgcGx1Z2luKTtcbiAgICAgICAgdGhpcy5wbHVnaW4gPSBwbHVnaW47XG4gICAgfVxuXG4gICAgZGlzcGxheSgpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgeyBjb250YWluZXJFbCB9ID0gdGhpcztcbiAgICAgICAgY29udGFpbmVyRWwuZW1wdHkoKTtcblxuICAgICAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgICAgICAvLyBMYW5ndWFnZSBTZXR0aW5nXG4gICAgICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKS5zZXROYW1lKHQoJ3NldHRpbmdzLmxhbmd1YWdlJykpLnNldEhlYWRpbmcoKTtcblxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgICAgICAgIC5zZXROYW1lKHQoJ3NldHRpbmdzLmxhbmd1YWdlJykpXG4gICAgICAgICAgICAuc2V0RGVzYyh0KCdzZXR0aW5ncy5sYW5ndWFnZURlc2MnKSlcbiAgICAgICAgICAgIC5hZGREcm9wZG93bigoZHJvcGRvd24pID0+XG4gICAgICAgICAgICAgICAgZHJvcGRvd25cbiAgICAgICAgICAgICAgICAgICAgLmFkZE9wdGlvbignemgnLCAn566A5L2T5Lit5paHJylcbiAgICAgICAgICAgICAgICAgICAgLmFkZE9wdGlvbignZW4nLCAnRW5nbGlzaCcpXG4gICAgICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5sYW5ndWFnZSlcbiAgICAgICAgICAgICAgICAgICAgLm9uQ2hhbmdlKCh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MubGFuZ3VhZ2UgPSB2YWx1ZSBhcyBMYW5ndWFnZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZvaWQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCkudGhlbigoKSA9PiB0aGlzLmRpc3BsYXkoKSk7XG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICApO1xuXG4gICAgICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgICAgIC8vIFBybyBMaWNlbnNlXG4gICAgICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgICAgIHRoaXMucmVuZGVyUHJvTGljZW5zZShjb250YWluZXJFbCk7XG5cbiAgICAgICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAgICAgLy8gQUkgUHJvdmlkZXIgU2V0dGluZ3NcbiAgICAgICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpLnNldE5hbWUodCgnc2V0dGluZ3Muc2VjdGlvbkFJJykpLnNldEhlYWRpbmcoKTtcblxuICAgICAgICAvLyBBY3RpdmUgcHJvdmlkZXIgc2VsZWN0aW9uXG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAgICAgLnNldE5hbWUodCgnc2V0dGluZ3MuYWlQcm92aWRlcicpKVxuICAgICAgICAgICAgLnNldERlc2ModCgnc2V0dGluZ3MuYWlQcm92aWRlckRlc2MnKSlcbiAgICAgICAgICAgIC5hZGREcm9wZG93bigoZHJvcGRvd24pID0+XG4gICAgICAgICAgICAgICAgZHJvcGRvd25cbiAgICAgICAgICAgICAgICAgICAgLmFkZE9wdGlvbignb3BlbnJvdXRlcicsICdPcGVuUm91dGVyJylcbiAgICAgICAgICAgICAgICAgICAgLmFkZE9wdGlvbignYW50aHJvcGljJywgJ0FudGhyb3BpYyBDbGF1ZGUnKVxuICAgICAgICAgICAgICAgICAgICAuYWRkT3B0aW9uKCdnZW1pbmknLCAnR29vZ2xlIEdlbWluaScpXG4gICAgICAgICAgICAgICAgICAgIC5hZGRPcHRpb24oJ29wZW5haScsICdPcGVuQUknKVxuICAgICAgICAgICAgICAgICAgICAuYWRkT3B0aW9uKCdzaWxpY29uZmxvdycsICdTaWxpY29uRmxvdycpXG4gICAgICAgICAgICAgICAgICAgIC5hZGRPcHRpb24oJ2N1c3RvbScsICdDdXN0b20gKE9wZW5BSSBjb21wYXRpYmxlKScpXG4gICAgICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5hY3RpdmVQcm92aWRlcilcbiAgICAgICAgICAgICAgICAgICAgLm9uQ2hhbmdlKCh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuYWN0aXZlUHJvdmlkZXIgPSB2YWx1ZSBhcyBBSVByb3ZpZGVyVHlwZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZvaWQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCkudGhlbigoKSA9PiB0aGlzLmRpc3BsYXkoKSk7XG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICApO1xuXG4gICAgICAgIC8vIFByb3ZpZGVyLXNwZWNpZmljIHNldHRpbmdzXG4gICAgICAgIHRoaXMucmVuZGVyUHJvdmlkZXJTZXR0aW5ncyhjb250YWluZXJFbCk7XG5cbiAgICAgICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAgICAgLy8gRm9sZGVyIFNldHRpbmdzXG4gICAgICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKS5zZXROYW1lKHQoJ3NldHRpbmdzLnNlY3Rpb25Gb2xkZXJzJykpLnNldEhlYWRpbmcoKTtcblxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgICAgICAgIC5zZXROYW1lKHQoJ3NldHRpbmdzLmRhaWx5Rm9sZGVyJykpXG4gICAgICAgICAgICAuc2V0RGVzYyh0KCdzZXR0aW5ncy5kYWlseUZvbGRlckRlc2MnKSlcbiAgICAgICAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICAgICAgICAgIHRleHRcbiAgICAgICAgICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKCcwMS1EYWlseScpXG4gICAgICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5kYWlseUZvbGRlcilcbiAgICAgICAgICAgICAgICAgICAgLm9uQ2hhbmdlKCh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZGFpbHlGb2xkZXIgPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZvaWQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICApO1xuXG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAgICAgLnNldE5hbWUodCgnc2V0dGluZ3MucGxhbkZvbGRlcicpKVxuICAgICAgICAgICAgLnNldERlc2ModCgnc2V0dGluZ3MucGxhbkZvbGRlckRlc2MnKSlcbiAgICAgICAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICAgICAgICAgIHRleHRcbiAgICAgICAgICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKCcwMi1QbGFuJylcbiAgICAgICAgICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnBsYW5Gb2xkZXIpXG4gICAgICAgICAgICAgICAgICAgIC5vbkNoYW5nZSgodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnBsYW5Gb2xkZXIgPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZvaWQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICApO1xuXG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAgICAgLnNldE5hbWUodCgnc2V0dGluZ3MuYXJjaGl2ZUZvbGRlcicpKVxuICAgICAgICAgICAgLnNldERlc2ModCgnc2V0dGluZ3MuYXJjaGl2ZUZvbGRlckRlc2MnKSlcbiAgICAgICAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICAgICAgICAgIHRleHRcbiAgICAgICAgICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKCcwMy1BcmNoaXZlJylcbiAgICAgICAgICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmFyY2hpdmVGb2xkZXIpXG4gICAgICAgICAgICAgICAgICAgIC5vbkNoYW5nZSgodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmFyY2hpdmVGb2xkZXIgPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZvaWQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICApO1xuXG4gICAgICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgICAgIC8vIERhdGUgU2V0dGluZ3NcbiAgICAgICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpLnNldE5hbWUodCgnc2V0dGluZ3MuZGF5Qm91bmRhcnlIb3VyJykpLnNldEhlYWRpbmcoKTtcblxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgICAgICAgIC5zZXROYW1lKHQoJ3NldHRpbmdzLmRheUJvdW5kYXJ5SG91cicpKVxuICAgICAgICAgICAgLnNldERlc2ModCgnc2V0dGluZ3MuZGF5Qm91bmRhcnlIb3VyRGVzYycpKVxuICAgICAgICAgICAgLmFkZFNsaWRlcigoc2xpZGVyKSA9PlxuICAgICAgICAgICAgICAgIHNsaWRlclxuICAgICAgICAgICAgICAgICAgICAuc2V0TGltaXRzKDAsIDEyLCAxKVxuICAgICAgICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuZGF5Qm91bmRhcnlIb3VyKVxuICAgICAgICAgICAgICAgICAgICAuc2V0RHluYW1pY1Rvb2x0aXAoKVxuICAgICAgICAgICAgICAgICAgICAub25DaGFuZ2UoKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5kYXlCb3VuZGFyeUhvdXIgPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZvaWQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICApO1xuXG4gICAgICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgICAgIC8vIEV2ZW5pbmcgUXVlc3Rpb24gRWRpdG9yXG4gICAgICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgICAgIHRoaXMucmVuZGVyRXZlbmluZ1F1ZXN0aW9ucyhjb250YWluZXJFbCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVuZGVyIHNldHRpbmdzIGZvciB0aGUgY3VycmVudGx5IHNlbGVjdGVkIEFJIHByb3ZpZGVyXG4gICAgICovXG4gICAgcHJpdmF0ZSByZW5kZXJQcm92aWRlclNldHRpbmdzKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuICAgICAgICBjb25zdCBwcm92aWRlciA9IHRoaXMucGx1Z2luLnNldHRpbmdzLmFjdGl2ZVByb3ZpZGVyO1xuICAgICAgICBjb25zdCBjb25maWcgPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5wcm92aWRlcnNbcHJvdmlkZXJdO1xuXG4gICAgICAgIC8vIC0tLSBDdXN0b20gcHJvdmlkZXI6IEJhc2UgVVJMIC0tLVxuICAgICAgICBpZiAocHJvdmlkZXIgPT09ICdjdXN0b20nKSB7XG4gICAgICAgICAgICBjb25zdCB1cmxTZXR0aW5nID0gbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgICAgICAgLnNldE5hbWUoJ0FQSSBCYXNlIFVSTCcpXG4gICAgICAgICAgICAgICAgLnNldERlc2ModCgnc2V0dGluZ3MuYmFzZVVybERlc2MnKSk7XG5cbiAgICAgICAgICAgIHVybFNldHRpbmcuYWRkVGV4dCgodGV4dCkgPT4ge1xuICAgICAgICAgICAgICAgIHRleHQuaW5wdXRFbC5hZGRDbGFzcygndGwtc2V0dGluZy1pbnB1dC13aWRlJyk7XG4gICAgICAgICAgICAgICAgdGV4dFxuICAgICAgICAgICAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoJ2h0dHBzOi8vYXBpLmRlZXBzZWVrLmNvbS92MScpXG4gICAgICAgICAgICAgICAgICAgIC5zZXRWYWx1ZShjb25maWcuYmFzZVVybCB8fCAnJylcbiAgICAgICAgICAgICAgICAgICAgLm9uQ2hhbmdlKCh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucHJvdmlkZXJzW3Byb3ZpZGVyXS5iYXNlVXJsID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB2b2lkIHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBQcmVzZXQgVVJMIGJ1dHRvbnNcbiAgICAgICAgICAgIGNvbnN0IHByZXNldERlc2MgPSB1cmxTZXR0aW5nLmRlc2NFbDtcbiAgICAgICAgICAgIGNvbnN0IHByZXNldENvbnRhaW5lciA9IHByZXNldERlc2MuY3JlYXRlRGl2KCd0bC1wcmVzZXQtdXJscycpO1xuICAgICAgICAgICAgY29uc3QgcHJlc2V0czogW3N0cmluZywgc3RyaW5nXVtdID0gW1xuICAgICAgICAgICAgICAgIFsnRGVlcFNlZWsnLCAnaHR0cHM6Ly9hcGkuZGVlcHNlZWsuY29tL3YxJ10sXG4gICAgICAgICAgICAgICAgWydTaWxpY29uRmxvdycsICdodHRwczovL2FwaS5zaWxpY29uZmxvdy5jbi92MSddLFxuICAgICAgICAgICAgICAgIFsnR3JvcScsICdodHRwczovL2FwaS5ncm9xLmNvbS9vcGVuYWkvdjEnXSxcbiAgICAgICAgICAgICAgICBbJ09sbGFtYScsICdodHRwOi8vbG9jYWxob3N0OjExNDM0L3YxJ10sXG4gICAgICAgICAgICBdO1xuICAgICAgICAgICAgZm9yIChjb25zdCBbbGFiZWwsIHVybF0gb2YgcHJlc2V0cykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGJ0biA9IHByZXNldENvbnRhaW5lci5jcmVhdGVFbCgnYnV0dG9uJywge1xuICAgICAgICAgICAgICAgICAgICBjbHM6ICd0bC1wcmVzZXQtYnRuJyxcbiAgICAgICAgICAgICAgICAgICAgdGV4dDogbGFiZWwsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2b2lkIChhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5wcm92aWRlcnNbcHJvdmlkZXJdLmJhc2VVcmwgPSB1cmw7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGlzcGxheSgpO1xuICAgICAgICAgICAgICAgICAgICB9KSgpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gLS0tIEFQSSBLZXkgd2l0aCBwYXNzd29yZCB0b2dnbGUgLS0tXG4gICAgICAgIGNvbnN0IGFwaUtleVNldHRpbmcgPSBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgICAgICAgIC5zZXROYW1lKGAke3RoaXMuZ2V0UHJvdmlkZXJOYW1lKHByb3ZpZGVyKX0gQVBJIEtleWApXG4gICAgICAgICAgICAuc2V0RGVzYyh0KCdzZXR0aW5ncy5hcGlLZXlEZXNjJywgdGhpcy5nZXRQcm92aWRlck5hbWUocHJvdmlkZXIpKSk7XG5cbiAgICAgICAgbGV0IGFwaUtleUlucHV0OiBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgICBhcGlLZXlTZXR0aW5nLmFkZFRleHQoKHRleHQpID0+IHtcbiAgICAgICAgICAgIGFwaUtleUlucHV0ID0gdGV4dC5pbnB1dEVsO1xuICAgICAgICAgICAgYXBpS2V5SW5wdXQudHlwZSA9ICdwYXNzd29yZCc7XG4gICAgICAgICAgICBhcGlLZXlJbnB1dC5hZGRDbGFzcygndGwtc2V0dGluZy1pbnB1dC1rZXknKTtcbiAgICAgICAgICAgIHRleHRcbiAgICAgICAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIodCgnc2V0dGluZ3MuYXBpS2V5UGxhY2Vob2xkZXInKSlcbiAgICAgICAgICAgICAgICAuc2V0VmFsdWUoY29uZmlnLmFwaUtleSlcbiAgICAgICAgICAgICAgICAub25DaGFuZ2UoKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnByb3ZpZGVyc1twcm92aWRlcl0uYXBpS2V5ID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIHZvaWQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGFwaUtleVNldHRpbmcuYWRkRXh0cmFCdXR0b24oKGJ1dHRvbikgPT4ge1xuICAgICAgICAgICAgYnV0dG9uXG4gICAgICAgICAgICAgICAgLnNldEljb24oJ2V5ZS1vZmYnKVxuICAgICAgICAgICAgICAgIC5zZXRUb29sdGlwKHQoJ3NldHRpbmdzLnRvZ2dsZUFwaUtleScpKVxuICAgICAgICAgICAgICAgIC5vbkNsaWNrKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGFwaUtleUlucHV0LnR5cGUgPT09ICdwYXNzd29yZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFwaUtleUlucHV0LnR5cGUgPSAndGV4dCc7XG4gICAgICAgICAgICAgICAgICAgICAgICBidXR0b24uc2V0SWNvbignZXllJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBidXR0b24uc2V0VG9vbHRpcCh0KCdzZXR0aW5ncy5oaWRlQXBpS2V5JykpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXBpS2V5SW5wdXQudHlwZSA9ICdwYXNzd29yZCc7XG4gICAgICAgICAgICAgICAgICAgICAgICBidXR0b24uc2V0SWNvbignZXllLW9mZicpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnV0dG9uLnNldFRvb2x0aXAodCgnc2V0dGluZ3Muc2hvd0FwaUtleScpKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyAtLS0gTW9kZWwgc2VsZWN0aW9uOiBkcm9wZG93biArIGZyZWUgdGV4dCBpbnB1dCAtLS1cbiAgICAgICAgY29uc3QgbW9kZWxzID0gdGhpcy5nZXRNb2RlbHNGb3JQcm92aWRlcihwcm92aWRlcik7XG4gICAgICAgIGNvbnN0IGhhc1ByZXNldHMgPSBPYmplY3Qua2V5cyhtb2RlbHMpLmxlbmd0aCA+IDA7XG5cbiAgICAgICAgY29uc3QgbW9kZWxTZXR0aW5nID0gbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgICAuc2V0TmFtZSh0KCdzZXR0aW5ncy5tb2RlbCcpKVxuICAgICAgICAgICAgLnNldERlc2ModCgnc2V0dGluZ3MubW9kZWxEZXNjJykpO1xuXG4gICAgICAgIGlmIChoYXNQcmVzZXRzKSB7XG4gICAgICAgICAgICBtb2RlbFNldHRpbmcuYWRkRHJvcGRvd24oKGRyb3Bkb3duKSA9PiB7XG4gICAgICAgICAgICAgICAgZHJvcGRvd24uYWRkT3B0aW9uKCcnLCAn4oCUIE1hbnVhbCDigJQnKTtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IFt2YWx1ZSwgbmFtZV0gb2YgT2JqZWN0LmVudHJpZXMobW9kZWxzKSkge1xuICAgICAgICAgICAgICAgICAgICBkcm9wZG93bi5hZGRPcHRpb24odmFsdWUsIG5hbWUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyBJZiBjdXJyZW50IG1vZGVsIGlzIGluIHByZXNldHMsIHNlbGVjdCBpdDsgb3RoZXJ3aXNlIGxlYXZlIGF0IG1hbnVhbFxuICAgICAgICAgICAgICAgIGRyb3Bkb3duLnNldFZhbHVlKG1vZGVsc1tjb25maWcubW9kZWxdID8gY29uZmlnLm1vZGVsIDogJycpO1xuICAgICAgICAgICAgICAgIGRyb3Bkb3duLm9uQ2hhbmdlKCh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnByb3ZpZGVyc1twcm92aWRlcl0ubW9kZWwgPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZvaWQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCkudGhlbigoKSA9PiB0aGlzLmRpc3BsYXkoKSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgbW9kZWxTZXR0aW5nLmFkZFRleHQoKHRleHQpID0+IHtcbiAgICAgICAgICAgIHRleHQuaW5wdXRFbC5hZGRDbGFzcygndGwtc2V0dGluZy1pbnB1dC1tb2RlbCcpO1xuICAgICAgICAgICAgdGV4dFxuICAgICAgICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcih0aGlzLmdldE1vZGVsUGxhY2Vob2xkZXIocHJvdmlkZXIpKVxuICAgICAgICAgICAgICAgIC5zZXRWYWx1ZShjb25maWcubW9kZWwpXG4gICAgICAgICAgICAgICAgLm9uQ2hhbmdlKCh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5wcm92aWRlcnNbcHJvdmlkZXJdLm1vZGVsID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIHZvaWQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIC0tLSBUZXN0IGNvbm5lY3Rpb24gYnV0dG9uIC0tLVxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgICAgICAgIC5zZXROYW1lKHQoJ3NldHRpbmdzLnRlc3RDb25uZWN0aW9uJykpXG4gICAgICAgICAgICAuc2V0RGVzYyh0KCdzZXR0aW5ncy50ZXN0Q29ubmVjdGlvbkRlc2MnKSlcbiAgICAgICAgICAgIC5hZGRCdXR0b24oKGJ1dHRvbikgPT5cbiAgICAgICAgICAgICAgICBidXR0b25cbiAgICAgICAgICAgICAgICAgICAgLnNldEJ1dHRvblRleHQodCgnc2V0dGluZ3MudGVzdEJ0bicpKVxuICAgICAgICAgICAgICAgICAgICAuc2V0Q3RhKClcbiAgICAgICAgICAgICAgICAgICAgLm9uQ2xpY2soKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdm9pZCAoYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJ1dHRvbi5zZXRCdXR0b25UZXh0KHQoJ3NldHRpbmdzLnRlc3RpbmcnKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnV0dG9uLnNldERpc2FibGVkKHRydWUpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYWlQcm92aWRlciA9IHRoaXMucGx1Z2luLmdldEFJUHJvdmlkZXIoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3VjY2VzcyA9IGF3YWl0IGFpUHJvdmlkZXIudGVzdENvbm5lY3Rpb24oKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV3IE5vdGljZSh0KCdzZXR0aW5ncy50ZXN0U3VjY2VzcycpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJ1dHRvbi5zZXRCdXR0b25UZXh0KHQoJ3NldHRpbmdzLnRlc3RTdWNjZXNzQnRuJykpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnV0dG9uLnNldEJ1dHRvblRleHQodCgnc2V0dGluZ3MudGVzdEJ0bicpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sIDIwMDApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV3IE5vdGljZSh0KCdzZXR0aW5ncy50ZXN0RmFpbCcpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJ1dHRvbi5zZXRCdXR0b25UZXh0KHQoJ3NldHRpbmdzLnRlc3RGYWlsQnRuJykpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnV0dG9uLnNldEJ1dHRvblRleHQodCgnc2V0dGluZ3MudGVzdEJ0bicpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sIDIwMDApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV3IE5vdGljZShg4p2MICR7dCgnc2V0dGluZ3MudGVzdEVycm9yJyl9OiAke2Vycm9yfWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBidXR0b24uc2V0QnV0dG9uVGV4dCh0KCdzZXR0aW5ncy50ZXN0RXJyb3JCdG4nKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnV0dG9uLnNldEJ1dHRvblRleHQodCgnc2V0dGluZ3MudGVzdEJ0bicpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSwgMjAwMCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnV0dG9uLnNldERpc2FibGVkKGZhbHNlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pKCk7XG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldCBkaXNwbGF5IG5hbWUgZm9yIHByb3ZpZGVyXG4gICAgICovXG4gICAgcHJpdmF0ZSBnZXRQcm92aWRlck5hbWUocHJvdmlkZXI6IEFJUHJvdmlkZXJUeXBlKTogc3RyaW5nIHtcbiAgICAgICAgY29uc3QgbmFtZXM6IFJlY29yZDxBSVByb3ZpZGVyVHlwZSwgc3RyaW5nPiA9IHtcbiAgICAgICAgICAgIG9wZW5yb3V0ZXI6ICdPcGVuUm91dGVyJyxcbiAgICAgICAgICAgIGFudGhyb3BpYzogJ0FudGhyb3BpYyBDbGF1ZGUnLFxuICAgICAgICAgICAgZ2VtaW5pOiAnR29vZ2xlIEdlbWluaScsXG4gICAgICAgICAgICBvcGVuYWk6ICdPcGVuQUknLFxuICAgICAgICAgICAgc2lsaWNvbmZsb3c6ICdTaWxpY29uRmxvdycsXG4gICAgICAgICAgICBjdXN0b206IHQoJ3NldHRpbmdzLmN1c3RvbVByb3ZpZGVyJyksXG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiBuYW1lc1twcm92aWRlcl07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2V0IHBsYWNlaG9sZGVyIGZvciBtb2RlbCB0ZXh0IGlucHV0XG4gICAgICovXG4gICAgcHJpdmF0ZSBnZXRNb2RlbFBsYWNlaG9sZGVyKHByb3ZpZGVyOiBBSVByb3ZpZGVyVHlwZSk6IHN0cmluZyB7XG4gICAgICAgIGNvbnN0IHBsYWNlaG9sZGVyczogUmVjb3JkPEFJUHJvdmlkZXJUeXBlLCBzdHJpbmc+ID0ge1xuICAgICAgICAgICAgb3BlbnJvdXRlcjogJ2FudGhyb3BpYy9jbGF1ZGUtc29ubmV0LTQnLFxuICAgICAgICAgICAgYW50aHJvcGljOiAnY2xhdWRlLXNvbm5ldC00LTIwMjUwNTE0JyxcbiAgICAgICAgICAgIGdlbWluaTogJ2dlbWluaS0yLjAtZmxhc2gnLFxuICAgICAgICAgICAgb3BlbmFpOiAnZ3B0LTRvJyxcbiAgICAgICAgICAgIHNpbGljb25mbG93OiAnZGVlcHNlZWstYWkvRGVlcFNlZWstVjMnLFxuICAgICAgICAgICAgY3VzdG9tOiAnZGVlcHNlZWstY2hhdCcsXG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiBwbGFjZWhvbGRlcnNbcHJvdmlkZXJdO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldCByZWNvbW1lbmRlZCBtb2RlbHMgZm9yIHByb3ZpZGVyIChlbXB0eSBmb3IgY3VzdG9tKVxuICAgICAqL1xuICAgIHByaXZhdGUgZ2V0TW9kZWxzRm9yUHJvdmlkZXIocHJvdmlkZXI6IEFJUHJvdmlkZXJUeXBlKTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiB7XG4gICAgICAgIHN3aXRjaCAocHJvdmlkZXIpIHtcbiAgICAgICAgICAgIGNhc2UgJ29wZW5yb3V0ZXInOlxuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICdhbnRocm9waWMvY2xhdWRlLXNvbm5ldC00JzogdCgnc2V0dGluZ3MucmVjb21tZW5kZWQnLCAnQ2xhdWRlIFNvbm5ldCA0JyksXG4gICAgICAgICAgICAgICAgICAgICdhbnRocm9waWMvY2xhdWRlLTMuNS1zb25uZXQnOiAnQ2xhdWRlIDMuNSBTb25uZXQnLFxuICAgICAgICAgICAgICAgICAgICAnYW50aHJvcGljL2NsYXVkZS0zLWhhaWt1JzogdCgnc2V0dGluZ3MuZmFzdCcsICdDbGF1ZGUgMyBIYWlrdScpLFxuICAgICAgICAgICAgICAgICAgICAnb3BlbmFpL2dwdC00byc6ICdHUFQtNG8nLFxuICAgICAgICAgICAgICAgICAgICAnb3BlbmFpL2dwdC00by1taW5pJzogJ0dQVC00byBNaW5pJyxcbiAgICAgICAgICAgICAgICAgICAgJ2dvb2dsZS9nZW1pbmktMi4wLWZsYXNoJzogJ0dlbWluaSAyLjAgRmxhc2gnLFxuICAgICAgICAgICAgICAgICAgICAnbWV0YS1sbGFtYS9sbGFtYS0zLjMtNzBiJzogJ0xsYW1hIDMuMyA3MEInLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjYXNlICdhbnRocm9waWMnOlxuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICdjbGF1ZGUtc29ubmV0LTQtMjAyNTA1MTQnOiAnQ2xhdWRlIFNvbm5ldCA0JyxcbiAgICAgICAgICAgICAgICAgICAgJ2NsYXVkZS0zLTUtc29ubmV0LTIwMjQxMDIyJzogJ0NsYXVkZSAzLjUgU29ubmV0JyxcbiAgICAgICAgICAgICAgICAgICAgJ2NsYXVkZS0zLWhhaWt1LTIwMjQwMzA3JzogJ0NsYXVkZSAzIEhhaWt1JyxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgY2FzZSAnZ2VtaW5pJzpcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAnZ2VtaW5pLTIuMC1mbGFzaCc6IHQoJ3NldHRpbmdzLnJlY29tbWVuZGVkJywgJ0dlbWluaSAyLjAgRmxhc2gnKSxcbiAgICAgICAgICAgICAgICAgICAgJ2dlbWluaS0yLjAtZmxhc2gtbGl0ZSc6IHQoJ3NldHRpbmdzLmZhc3QnLCAnR2VtaW5pIDIuMCBGbGFzaCBMaXRlJyksXG4gICAgICAgICAgICAgICAgICAgICdnZW1pbmktMS41LXByby1sYXRlc3QnOiAnR2VtaW5pIDEuNSBQcm8nLFxuICAgICAgICAgICAgICAgICAgICAnZ2VtaW5pLTEuNS1mbGFzaC1sYXRlc3QnOiAnR2VtaW5pIDEuNSBGbGFzaCcsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNhc2UgJ29wZW5haSc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgJ2dwdC00byc6IHQoJ3NldHRpbmdzLnJlY29tbWVuZGVkJywgJ0dQVC00bycpLFxuICAgICAgICAgICAgICAgICAgICAnZ3B0LTRvLW1pbmknOiAnR1BULTRvIE1pbmknLFxuICAgICAgICAgICAgICAgICAgICAnZ3B0LTQtdHVyYm8nOiAnR1BULTQgVHVyYm8nLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjYXNlICdzaWxpY29uZmxvdyc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgJ2RlZXBzZWVrLWFpL0RlZXBTZWVrLVYzJzogdCgnc2V0dGluZ3MucmVjb21tZW5kZWQnLCAnRGVlcFNlZWsgVjMnKSxcbiAgICAgICAgICAgICAgICAgICAgJ1F3ZW4vUXdlbjMtMjM1Qi1BMjJCJzogdCgnc2V0dGluZ3MucG93ZXJmdWwnLCAnUXdlbjMgMjM1QicpLFxuICAgICAgICAgICAgICAgICAgICAnUXdlbi9Rd2VuMy0zMEItQTNCJzogdCgnc2V0dGluZ3MuZmFzdCcsICdRd2VuMyAzMEInKSxcbiAgICAgICAgICAgICAgICAgICAgJ2RlZXBzZWVrLWFpL0RlZXBTZWVrLVIxJzogdCgnc2V0dGluZ3MucmVhc29uaW5nJywgJ0RlZXBTZWVrIFIxJyksXG4gICAgICAgICAgICAgICAgICAgICdUSFVETS9HTE0tNC05Qi1DaGF0JzogJ0dMTS00IDlCIENoYXQnLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjYXNlICdjdXN0b20nOlxuICAgICAgICAgICAgICAgIC8vIE5vIHByZXNldHMg4oCUIHVzZXIgdHlwZXMgdGhlIG1vZGVsIElEXG4gICAgICAgICAgICAgICAgcmV0dXJuIHt9O1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgIH1cbiAgICB9XG4gICAgLyoqXG4gICAgICogUmVuZGVyIHRoZSBldmVuaW5nIHF1ZXN0aW9uIGVkaXRvciDigJQgZHJhZy1hbmQtZHJvcCwgdG9nZ2xlLCBleHBhbmRcbiAgICAgKi9cbiAgICBwcml2YXRlIHJlbmRlckV2ZW5pbmdRdWVzdGlvbnMoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50KTogdm9pZCB7XG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKS5zZXROYW1lKHQoJ3NldHRpbmdzLmV2ZW5pbmdRdWVzdGlvbnMnKSkuc2V0SGVhZGluZygpO1xuXG4gICAgICAgIGNvbnN0IHF1ZXN0aW9ucyA9IHRoaXMucGx1Z2luLnNldHRpbmdzLmV2ZW5pbmdRdWVzdGlvbnM7XG5cbiAgICAgICAgLy8gUXVlc3Rpb24gbGlzdCBjb250YWluZXIgZm9yIGRyYWctYW5kLWRyb3BcbiAgICAgICAgY29uc3QgbGlzdEVsID0gY29udGFpbmVyRWwuY3JlYXRlRGl2KCd0bC1xLWxpc3QnKTtcblxuICAgICAgICBsZXQgZHJhZ0lkeDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5cbiAgICAgICAgcXVlc3Rpb25zLmZvckVhY2goKHF1ZXN0aW9uLCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgY29uc3Qgcm93ID0gbGlzdEVsLmNyZWF0ZURpdigndGwtcS1yb3cnKTtcbiAgICAgICAgICAgIHJvdy5zZXRBdHRyaWJ1dGUoJ2RyYWdnYWJsZScsICd0cnVlJyk7XG4gICAgICAgICAgICByb3cuZGF0YXNldC5pbmRleCA9IFN0cmluZyhpbmRleCk7XG5cbiAgICAgICAgICAgIC8vIC0tLSBEcmFnIGhhbmRsZSAtLS1cbiAgICAgICAgICAgIGNvbnN0IGhhbmRsZSA9IHJvdy5jcmVhdGVFbCgnc3BhbicsIHsgY2xzOiAndGwtcS1kcmFnLWhhbmRsZScsIHRleHQ6ICdcXHUyODQ3JyB9KTtcbiAgICAgICAgICAgIGhhbmRsZS5zZXRBdHRyaWJ1dGUoJ3RpdGxlJywgdCgnc2V0dGluZ3MuZHJhZ1RvUmVvcmRlcicpKTtcblxuICAgICAgICAgICAgLy8gLS0tIEV4cGFuZCB0cmlhbmdsZSAtLS1cbiAgICAgICAgICAgIGNvbnN0IHRyaWFuZ2xlID0gcm93LmNyZWF0ZUVsKCdzcGFuJywgeyBjbHM6ICd0bC1xLXRyaWFuZ2xlJyB9KTtcbiAgICAgICAgICAgIHRyaWFuZ2xlLnRleHRDb250ZW50ID0gJ1xcdTI1YjYnO1xuXG4gICAgICAgICAgICAvLyAtLS0gTmFtZSAoc3RhdGljIHRleHQsIHJlcGxhY2VkIGJ5IGlucHV0IHdoZW4gZXhwYW5kZWQpIC0tLVxuICAgICAgICAgICAgY29uc3QgbmFtZUVsID0gcm93LmNyZWF0ZUVsKCdzcGFuJywgeyBjbHM6ICd0bC1xLW5hbWUnLCB0ZXh0OiBxdWVzdGlvbi5zZWN0aW9uTmFtZSB8fCB0KCdzZXR0aW5ncy51bm5hbWVkJykgfSk7XG5cbiAgICAgICAgICAgIC8vIC0tLSBTcGFjZXIgLS0tXG4gICAgICAgICAgICByb3cuY3JlYXRlRWwoJ3NwYW4nLCB7IGNsczogJ3RsLXEtc3BhY2VyJyB9KTtcblxuICAgICAgICAgICAgLy8gLS0tIERlbGV0ZSBidXR0b24gLS0tXG4gICAgICAgICAgICBjb25zdCBkZWxldGVCdG4gPSByb3cuY3JlYXRlRWwoJ3NwYW4nLCB7IGNsczogJ3RsLXEtaWNvbi1idG4gdGwtcS1pY29uLWRlbGV0ZScgfSk7XG4gICAgICAgICAgICBkZWxldGVCdG4udGV4dENvbnRlbnQgPSAnXFx1MjcxNSc7XG4gICAgICAgICAgICBkZWxldGVCdG4uc2V0QXR0cmlidXRlKCd0aXRsZScsIHQoJ3NldHRpbmdzLmRlbGV0ZScpKTtcbiAgICAgICAgICAgIGRlbGV0ZUJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICB2b2lkIChhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmV2ZW5pbmdRdWVzdGlvbnMuc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZGlzcGxheSgpO1xuICAgICAgICAgICAgICAgIH0pKCk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gLS0tIEV4cGFuZC9jb2xsYXBzZSAtLS1cbiAgICAgICAgICAgIGNvbnN0IHRvZ2dsZUV4cGFuZCA9IChlOiBFdmVudCkgPT4ge1xuICAgICAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICAgICAgY29uc3QgZXhpc3RpbmcgPSByb3cubmV4dEVsZW1lbnRTaWJsaW5nO1xuICAgICAgICAgICAgICAgIGlmIChleGlzdGluZyAmJiBleGlzdGluZy5oYXNDbGFzcygndGwtcS1kZXRhaWwnKSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBDb2xsYXBzZTogc3luYyBuYW1lIGJhY2sgYW5kIHJlc3RvcmUgc3RhdGljIHRleHRcbiAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmcucmVtb3ZlKCk7XG4gICAgICAgICAgICAgICAgICAgIHRyaWFuZ2xlLnRleHRDb250ZW50ID0gJ1xcdTI1YjYnO1xuICAgICAgICAgICAgICAgICAgICB0cmlhbmdsZS5yZW1vdmVDbGFzcygndGwtcS10cmlhbmdsZS1vcGVuJyk7XG4gICAgICAgICAgICAgICAgICAgIC8vIFJlcGxhY2UgaW5wdXQgd2l0aCBzcGFuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRJbnB1dCA9IHJvdy5xdWVyeVNlbGVjdG9yKCcudGwtcS1uYW1lLWlucHV0JykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGN1cnJlbnRJbnB1dCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbmV3U3BhbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5ld1NwYW4uY2xhc3NOYW1lID0gJ3RsLXEtbmFtZSc7XG4gICAgICAgICAgICAgICAgICAgICAgICBuZXdTcGFuLnRleHRDb250ZW50ID0gY3VycmVudElucHV0LnZhbHVlIHx8IHQoJ3NldHRpbmdzLnVubmFtZWQnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGN1cnJlbnRJbnB1dC5yZXBsYWNlV2l0aChuZXdTcGFuKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIEV4cGFuZDogcmVwbGFjZSBuYW1lIHNwYW4gd2l0aCBlZGl0YWJsZSBpbnB1dFxuICAgICAgICAgICAgICAgICAgICB0cmlhbmdsZS50ZXh0Q29udGVudCA9ICdcXHUyNWJjJztcbiAgICAgICAgICAgICAgICAgICAgdHJpYW5nbGUuYWRkQ2xhc3MoJ3RsLXEtdHJpYW5nbGUtb3BlbicpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBuYW1lU3BhbiA9IHJvdy5xdWVyeVNlbGVjdG9yKCcudGwtcS1uYW1lJyk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChuYW1lU3Bhbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdpbnB1dCcpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaW5wdXQudHlwZSA9ICd0ZXh0JztcbiAgICAgICAgICAgICAgICAgICAgICAgIGlucHV0LmNsYXNzTmFtZSA9ICd0bC1xLW5hbWUtaW5wdXQnO1xuICAgICAgICAgICAgICAgICAgICAgICAgaW5wdXQudmFsdWUgPSBxdWVzdGlvbi5zZWN0aW9uTmFtZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlucHV0LnBsYWNlaG9sZGVyID0gdCgnc2V0dGluZ3Muc2VjdGlvbk5hbWVQbGFjZWhvbGRlcicpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZXZlbmluZ1F1ZXN0aW9uc1tpbmRleF0uc2VjdGlvbk5hbWUgPSBpbnB1dC52YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2b2lkIHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBQcmV2ZW50IGRyYWcgd2hlbiBjbGlja2luZyBpbnB1dFxuICAgICAgICAgICAgICAgICAgICAgICAgaW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgKGV2KSA9PiBldi5zdG9wUHJvcGFnYXRpb24oKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBuYW1lU3Bhbi5yZXBsYWNlV2l0aChpbnB1dCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJRdWVzdGlvbkRldGFpbChyb3csIHF1ZXN0aW9uLCBpbmRleCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgdHJpYW5nbGUuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0b2dnbGVFeHBhbmQpO1xuICAgICAgICAgICAgbmFtZUVsLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgdG9nZ2xlRXhwYW5kKTtcblxuICAgICAgICAgICAgLy8gLS0tIERyYWcgZXZlbnRzIC0tLVxuICAgICAgICAgICAgcm93LmFkZEV2ZW50TGlzdGVuZXIoJ2RyYWdzdGFydCcsIChlKSA9PiB7XG4gICAgICAgICAgICAgICAgZHJhZ0lkeCA9IGluZGV4O1xuICAgICAgICAgICAgICAgIHJvdy5hZGRDbGFzcygndGwtcS1kcmFnZ2luZycpO1xuICAgICAgICAgICAgICAgIGUuZGF0YVRyYW5zZmVyPy5zZXREYXRhKCd0ZXh0L3BsYWluJywgU3RyaW5nKGluZGV4KSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgcm93LmFkZEV2ZW50TGlzdGVuZXIoJ2RyYWdlbmQnLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgZHJhZ0lkeCA9IG51bGw7XG4gICAgICAgICAgICAgICAgcm93LnJlbW92ZUNsYXNzKCd0bC1xLWRyYWdnaW5nJyk7XG4gICAgICAgICAgICAgICAgbGlzdEVsLnF1ZXJ5U2VsZWN0b3JBbGwoJy50bC1xLWRyYWdvdmVyJykuZm9yRWFjaChlbCA9PiBlbC5yZW1vdmVDbGFzcygndGwtcS1kcmFnb3ZlcicpKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICByb3cuYWRkRXZlbnRMaXN0ZW5lcignZHJhZ292ZXInLCAoZSkgPT4ge1xuICAgICAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgICAgICBpZiAoZHJhZ0lkeCAhPT0gbnVsbCAmJiBkcmFnSWR4ICE9PSBpbmRleCkge1xuICAgICAgICAgICAgICAgICAgICByb3cuYWRkQ2xhc3MoJ3RsLXEtZHJhZ292ZXInKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgcm93LmFkZEV2ZW50TGlzdGVuZXIoJ2RyYWdsZWF2ZScsICgpID0+IHtcbiAgICAgICAgICAgICAgICByb3cucmVtb3ZlQ2xhc3MoJ3RsLXEtZHJhZ292ZXInKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICByb3cuYWRkRXZlbnRMaXN0ZW5lcignZHJvcCcsIChlKSA9PiB7XG4gICAgICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgICAgIHJvdy5yZW1vdmVDbGFzcygndGwtcS1kcmFnb3ZlcicpO1xuICAgICAgICAgICAgICAgIGlmIChkcmFnSWR4ID09PSBudWxsIHx8IGRyYWdJZHggPT09IGluZGV4KSByZXR1cm47XG5cbiAgICAgICAgICAgICAgICB2b2lkIChhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGl0ZW1zID0gdGhpcy5wbHVnaW4uc2V0dGluZ3MuZXZlbmluZ1F1ZXN0aW9ucztcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgW21vdmVkXSA9IGl0ZW1zLnNwbGljZShkcmFnSWR4LCAxKTtcbiAgICAgICAgICAgICAgICAgICAgaXRlbXMuc3BsaWNlKGluZGV4LCAwLCBtb3ZlZCk7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmRpc3BsYXkoKTtcbiAgICAgICAgICAgICAgICB9KSgpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIC0tLSBBZGQgcXVlc3Rpb24gbGluayAtLS1cbiAgICAgICAgY29uc3QgYWRkTGluayA9IGxpc3RFbC5jcmVhdGVFbCgnc3BhbicsIHsgY2xzOiAndGwtcS1hZGQtbGluaycsIHRleHQ6IHQoJ3NldHRpbmdzLmFkZFF1ZXN0aW9uJykgfSk7XG4gICAgICAgIGFkZExpbmsuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBuZXdROiBFdmVuaW5nUXVlc3Rpb25Db25maWcgPSB7XG4gICAgICAgICAgICAgICAgdHlwZTogJ2ZyZWVfd3JpdGluZycsXG4gICAgICAgICAgICAgICAgc2VjdGlvbk5hbWU6ICcnLFxuICAgICAgICAgICAgICAgIGluaXRpYWxNZXNzYWdlOiAnJyxcbiAgICAgICAgICAgICAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgICAgICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5ldmVuaW5nUXVlc3Rpb25zLnB1c2gobmV3USk7XG4gICAgICAgICAgICB2b2lkIHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpLnRoZW4oKCkgPT4gdGhpcy5kaXNwbGF5KCkpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW5kZXIgZGV0YWlsIHBhbmVsIOKAlCBvbmx5IHRoZSB0ZXh0YXJlYSBmb3IgcXVlc3Rpb24gY29udGVudFxuICAgICAqL1xuICAgIHByaXZhdGUgcmVuZGVyUXVlc3Rpb25EZXRhaWwoYWZ0ZXJFbDogSFRNTEVsZW1lbnQsIHF1ZXN0aW9uOiBFdmVuaW5nUXVlc3Rpb25Db25maWcsIGluZGV4OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgZGV0YWlsRWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgZGV0YWlsRWwuYWRkQ2xhc3MoJ3RsLXEtZGV0YWlsJyk7XG4gICAgICAgIGFmdGVyRWwuYWZ0ZXIoZGV0YWlsRWwpO1xuXG4gICAgICAgIC8vIE9ubHkgdGhlIHF1ZXN0aW9uIHRleHRhcmVhXG4gICAgICAgIGNvbnN0IHRleHRhcmVhRWwgPSBkZXRhaWxFbC5jcmVhdGVFbCgndGV4dGFyZWEnLCB7IGNsczogJ3RsLXEtZGV0YWlsLXRleHRhcmVhJyB9KTtcbiAgICAgICAgdGV4dGFyZWFFbC52YWx1ZSA9IHF1ZXN0aW9uLmluaXRpYWxNZXNzYWdlO1xuICAgICAgICB0ZXh0YXJlYUVsLnBsYWNlaG9sZGVyID0gdCgnc2V0dGluZ3MucXVlc3Rpb25QbGFjZWhvbGRlcicpO1xuICAgICAgICB0ZXh0YXJlYUVsLnJvd3MgPSAzO1xuICAgICAgICB0ZXh0YXJlYUVsLmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgKCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZXZlbmluZ1F1ZXN0aW9uc1tpbmRleF0uaW5pdGlhbE1lc3NhZ2UgPSB0ZXh0YXJlYUVsLnZhbHVlO1xuICAgICAgICAgICAgdm9pZCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVuZGVyIFBybyBsaWNlbnNlIHNlY3Rpb24gaW4gc2V0dGluZ3NcbiAgICAgKi9cbiAgICBwcml2YXRlIHJlbmRlclByb0xpY2Vuc2UoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50KTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGlzUHJvID0gdGhpcy5wbHVnaW4ubGljZW5zZU1hbmFnZXIuaXNQcm8oKTtcblxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbCkuc2V0TmFtZSgnUHJvJykuc2V0SGVhZGluZygpO1xuXG4gICAgICAgIC8vIFN0YXR1c1xuICAgICAgICBjb25zdCBzdGF0dXNTZXR0aW5nID0gbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgICAuc2V0TmFtZSh0KCdzZXR0aW5ncy5wcm9TdGF0dXMnKSlcbiAgICAgICAgICAgIC5zZXREZXNjKGlzUHJvID8gdCgnc2V0dGluZ3MucHJvQWN0aXZlJykgOiB0KCdzZXR0aW5ncy5wcm9GcmVlJykpO1xuXG4gICAgICAgIGlmIChpc1Bybykge1xuICAgICAgICAgICAgY29uc3QgbGFiZWwgPSB0aGlzLnBsdWdpbi5saWNlbnNlTWFuYWdlci5nZXRMaWNlbnNlTGFiZWwoKTtcbiAgICAgICAgICAgIGNvbnN0IGV4cGlyeSA9IHRoaXMucGx1Z2luLmxpY2Vuc2VNYW5hZ2VyLmdldEV4cGlyeURhdGUoKTtcbiAgICAgICAgICAgIGNvbnN0IGV4cGlyeVRleHQgPSBleHBpcnkgPyBgIMK3ICR7dCgnc2V0dGluZ3MucHJvRXhwaXJ5Jyl9OiAke2V4cGlyeX1gIDogJyc7XG4gICAgICAgICAgICBzdGF0dXNTZXR0aW5nLnNldERlc2MoYOKchSAke2xhYmVsfSAke3QoJ3NldHRpbmdzLnByb0FjdGl2YXRlZCcpfSR7ZXhwaXJ5VGV4dH1gKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIEtleSBpbnB1dCArIGFjdGl2YXRlXG4gICAgICAgICAgICBjb25zdCBrZXlTZXR0aW5nID0gbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgICAgICAgLnNldE5hbWUodCgnc2V0dGluZ3MucmVkZWVtQ29kZScpKVxuICAgICAgICAgICAgICAgIC5zZXREZXNjKHQoJ3NldHRpbmdzLnJlZGVlbURlc2MnKSk7XG5cbiAgICAgICAgICAgIGxldCBrZXlWYWx1ZSA9ICcnO1xuICAgICAgICAgICAga2V5U2V0dGluZy5hZGRUZXh0KCh0ZXh0KSA9PiB7XG4gICAgICAgICAgICAgICAgdGV4dC5pbnB1dEVsLmFkZENsYXNzKCd0bC1zZXR0aW5nLWlucHV0LWtleScpO1xuICAgICAgICAgICAgICAgIHRleHRcbiAgICAgICAgICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKCdUTC1YWFhYLVhYWFgtWFhYWCcpXG4gICAgICAgICAgICAgICAgICAgIC5vbkNoYW5nZSgodmFsdWUpID0+IHsga2V5VmFsdWUgPSB2YWx1ZTsgfSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAga2V5U2V0dGluZy5hZGRCdXR0b24oKGJ1dHRvbikgPT5cbiAgICAgICAgICAgICAgICBidXR0b25cbiAgICAgICAgICAgICAgICAgICAgLnNldEJ1dHRvblRleHQodCgnc2V0dGluZ3MuYWN0aXZhdGUnKSlcbiAgICAgICAgICAgICAgICAgICAgLnNldEN0YSgpXG4gICAgICAgICAgICAgICAgICAgIC5vbkNsaWNrKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZvaWQgKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBidXR0b24uc2V0QnV0dG9uVGV4dCh0KCdzZXR0aW5ncy52ZXJpZnlpbmcnKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnV0dG9uLnNldERpc2FibGVkKHRydWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucGx1Z2luLmxpY2Vuc2VNYW5hZ2VyLmFjdGl2YXRlKGtleVZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV3IE5vdGljZShg8J+OiSAke3Jlc3VsdC5tZXNzYWdlfWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRpc3BsYXkoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXcgTm90aWNlKGDinYwgJHtyZXN1bHQubWVzc2FnZX1gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnV0dG9uLnNldEJ1dHRvblRleHQodCgnc2V0dGluZ3MuYWN0aXZhdGUnKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJ1dHRvbi5zZXREaXNhYmxlZChmYWxzZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSkoKTtcbiAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgIC8vIFB1cmNoYXNlIGxpbmtzXG4gICAgICAgICAgICBjb25zdCB1cmxzID0gdGhpcy5wbHVnaW4ubGljZW5zZU1hbmFnZXIuZ2V0UHVyY2hhc2VVcmxzKCk7XG4gICAgICAgICAgICBjb25zdCBwdXJjaGFzZVNldHRpbmcgPSBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgICAgICAgICAgICAuc2V0TmFtZSh0KCdzZXR0aW5ncy5wdXJjaGFzZVBybycpKVxuICAgICAgICAgICAgICAgIC5zZXREZXNjKHQoJ3NldHRpbmdzLnB1cmNoYXNlRGVzYycpKTtcblxuICAgICAgICAgICAgcHVyY2hhc2VTZXR0aW5nLmFkZEJ1dHRvbigoYnV0dG9uKSA9PlxuICAgICAgICAgICAgICAgIGJ1dHRvblxuICAgICAgICAgICAgICAgICAgICAuc2V0QnV0dG9uVGV4dCh0KCdzZXR0aW5ncy5wdXJjaGFzZURvbWVzdGljJykpXG4gICAgICAgICAgICAgICAgICAgIC5vbkNsaWNrKCgpID0+IHsgd2luZG93Lm9wZW4odXJscy5taWFuYmFvZHVvKTsgfSlcbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgIHB1cmNoYXNlU2V0dGluZy5hZGRCdXR0b24oKGJ1dHRvbikgPT5cbiAgICAgICAgICAgICAgICBidXR0b25cbiAgICAgICAgICAgICAgICAgICAgLnNldEJ1dHRvblRleHQodCgnc2V0dGluZ3MucHVyY2hhc2VJbnRsJykpXG4gICAgICAgICAgICAgICAgICAgIC5vbkNsaWNrKCgpID0+IHsgd2luZG93Lm9wZW4odXJscy5ndW1yb2FkKTsgfSlcbiAgICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICB9XG59XG4iXX0=