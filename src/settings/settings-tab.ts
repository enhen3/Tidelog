/**
 * Settings Tab - Plugin configuration UI
 * Phase 5: Custom model names, custom provider, streamlined evening questions
 */

import {
    App,
    PluginSettingTab,
    Setting,
    Notice,
} from 'obsidian';

import TideLogPlugin from '../main';
import { AIProviderType, EveningQuestionConfig } from '../types';
import { t } from '../i18n';
import type { Language } from '../i18n';

export class TideLogSettingTab extends PluginSettingTab {
    plugin: TideLogPlugin;

    constructor(app: App, plugin: TideLogPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

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
            .setName(`${this.getProviderName(provider)} API Key`)
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
                .setTooltip('显示/隐藏 API Key')
                .onClick(() => {
                    if (apiKeyInput.type === 'password') {
                        apiKeyInput.type = 'text';
                        button.setIcon('eye');
                        button.setTooltip('隐藏 API Key');
                    } else {
                        apiKeyInput.type = 'password';
                        button.setIcon('eye-off');
                        button.setTooltip('显示 API Key');
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
            .setName('测试连接')
            .setDesc('验证 API Key 和模型配置是否正确')
            .addButton((button) =>
                button
                    .setButtonText('🔗 测试连接')
                    .setCta()
                    .onClick(() => {
                        void (async () => {
                            button.setButtonText('⏳ 测试中...');
                            button.setDisabled(true);

                            try {
                                const aiProvider = this.plugin.getAIProvider();
                                const success = await aiProvider.testConnection();

                                if (success) {
                                    new Notice('✅ 连接成功！API Key 有效');
                                    button.setButtonText('✅ 连接成功');
                                    setTimeout(() => {
                                        button.setButtonText('🔗 测试连接');
                                    }, 2000);
                                } else {
                                    new Notice('❌ 连接失败，请检查 API Key 是否正确');
                                    button.setButtonText('❌ 连接失败');
                                    setTimeout(() => {
                                        button.setButtonText('🔗 测试连接');
                                    }, 2000);
                                }
                            } catch (error) {
                                new Notice(`❌ 错误: ${error}`);
                                button.setButtonText('❌ 出错了');
                                setTimeout(() => {
                                    button.setButtonText('🔗 测试连接');
                                }, 2000);
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
            custom: '自定义',
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
            siliconflow: 'deepseek-ai/DeepSeek-V3',
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
                    'anthropic/claude-sonnet-4': 'Claude Sonnet 4 (推荐)',
                    'anthropic/claude-3.5-sonnet': 'Claude 3.5 Sonnet',
                    'anthropic/claude-3-haiku': 'Claude 3 Haiku (快速)',
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
                    'gemini-2.0-flash': 'Gemini 2.0 Flash (推荐)',
                    'gemini-2.0-flash-lite': 'Gemini 2.0 Flash Lite (快速)',
                    'gemini-1.5-pro-latest': 'Gemini 1.5 Pro',
                    'gemini-1.5-flash-latest': 'Gemini 1.5 Flash',
                };
            case 'openai':
                return {
                    'gpt-4o': 'GPT-4o (推荐)',
                    'gpt-4o-mini': 'GPT-4o Mini',
                    'gpt-4-turbo': 'GPT-4 Turbo',
                };
            case 'siliconflow':
                return {
                    'deepseek-ai/DeepSeek-V3': 'DeepSeek V3 (推荐)',
                    'Qwen/Qwen3-235B-A22B': 'Qwen3 235B (强大)',
                    'Qwen/Qwen3-30B-A3B': 'Qwen3 30B (快速)',
                    'deepseek-ai/DeepSeek-R1': 'DeepSeek R1 (推理)',
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
            handle.setAttribute('title', '\u62d6\u62fd\u8c03\u6574\u987a\u5e8f');

            // --- Expand triangle ---
            const triangle = row.createEl('span', { cls: 'tl-q-triangle' });
            triangle.textContent = '\u25b6';

            // --- Name (static text, replaced by input when expanded) ---
            const nameEl = row.createEl('span', { cls: 'tl-q-name', text: question.sectionName || '\u672a\u547d\u540d' });

            // --- Spacer ---
            row.createEl('span', { cls: 'tl-q-spacer' });

            // --- Delete button ---
            const deleteBtn = row.createEl('span', { cls: 'tl-q-icon-btn tl-q-icon-delete' });
            deleteBtn.textContent = '\u2715';
            deleteBtn.setAttribute('title', '\u5220\u9664');
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
                        newSpan.textContent = currentInput.value || '\u672a\u547d\u540d';
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
                        input.placeholder = '\u8f93\u5165\u7ae0\u8282\u540d\u2026';
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
                    const [moved] = items.splice(dragIdx, 1);
                    items.splice(index, 0, moved);
                    await this.plugin.saveSettings();
                    this.display();
                })();
            });
        });

        // --- Add question link ---
        const addLink = listEl.createEl('span', { cls: 'tl-q-add-link', text: '+ \u6dfb\u52a0' });
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
        textareaEl.placeholder = '\u8f93\u5165 AI \u5411\u7528\u6237\u63d0\u7684\u95ee\u9898\u2026';
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
            .setName('授权状态')
            .setDesc(isPro ? '✅ Pro 版已激活' : '🔒 当前为 Free 版');

        if (isPro) {
            statusSetting.addButton((button) =>
                button
                    .setButtonText('取消激活')
                    .setWarning()
                    .onClick(() => {
                        void (async () => {
                            const result = await this.plugin.licenseManager.deactivate();
                            new Notice(result.message);
                            this.display();
                        })();
                    })
            );
        } else {
            // Key input + activate
            const keySetting = new Setting(containerEl)
                .setName('兑换码')
                .setDesc('购买后在此输入兑换码激活 Pro 版');

            let keyValue = '';
            keySetting.addText((text) => {
                text.inputEl.addClass('tl-setting-input-key');
                text
                    .setPlaceholder('TL-XXXX-XXXX-XXXX')
                    .onChange((value) => { keyValue = value; });
            });

            keySetting.addButton((button) =>
                button
                    .setButtonText('激活')
                    .setCta()
                    .onClick(() => {
                        void (async () => {
                            button.setButtonText('⏳ 验证中...');
                            button.setDisabled(true);
                            const result = await this.plugin.licenseManager.activate(keyValue);
                            if (result.success) {
                                new Notice(`🎉 ${result.message}`);
                                this.display();
                            } else {
                                new Notice(`❌ ${result.message}`);
                                button.setButtonText('激活');
                                button.setDisabled(false);
                            }
                        })();
                    })
            );

            // Purchase links
            const urls = this.plugin.licenseManager.getPurchaseUrls();
            const purchaseSetting = new Setting(containerEl)
                .setName('购买 Pro 版')
                .setDesc('解锁完整晚间复盘、AI 洞察报告、仪表盘等全部功能');

            purchaseSetting.addButton((button) =>
                button
                    .setButtonText('🇨🇳 面包多（国内）')
                    .onClick(() => { window.open(urls.mianbaoduo); })
            );

            purchaseSetting.addButton((button) =>
                button
                    .setButtonText('🌍 Gumroad（国际）')
                    .onClick(() => { window.open(urls.gumroad); })
            );
        }
    }
}
