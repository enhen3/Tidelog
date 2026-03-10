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
import { DEFAULT_EVENING_QUESTIONS } from '../constants';

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
        // AI Provider Settings
        // =================================================================
        new Setting(containerEl).setName('AI provider').setHeading();

        // Active provider selection
        new Setting(containerEl)
            .setName('当前使用的 AI 服务')
            .setDesc('选择要使用的 AI 服务提供商')
            .addDropdown((dropdown) =>
                dropdown
                    .addOption('openrouter', 'OpenRouter (推荐)')
                    .addOption('anthropic', 'Anthropic Claude')
                    .addOption('gemini', 'Google Gemini')
                    .addOption('openai', 'OpenAI')
                    .addOption('custom', '自定义 (OpenAI 兼容)')
                    .setValue(this.plugin.settings.activeProvider)
                    .onChange(async (value) => {
                        this.plugin.settings.activeProvider = value as AIProviderType;
                        await this.plugin.saveSettings();
                        this.display(); // Refresh to show relevant settings
                    })
            );

        // Provider-specific settings
        this.renderProviderSettings(containerEl);

        // =================================================================
        // Folder Settings
        // =================================================================
        new Setting(containerEl).setName('Folders').setHeading();

        new Setting(containerEl)
            .setName('日记文件夹')
            .setDesc('存放每日日记的文件夹路径')
            .addText((text) =>
                text
                    .setPlaceholder('01-Daily')
                    .setValue(this.plugin.settings.dailyFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.dailyFolder = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('计划文件夹')
            .setDesc('存放周/月计划的文件夹路径')
            .addText((text) =>
                text
                    .setPlaceholder('02-Plan')
                    .setValue(this.plugin.settings.planFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.planFolder = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('档案文件夹')
            .setDesc('存放用户画像、原则等档案的文件夹路径')
            .addText((text) =>
                text
                    .setPlaceholder('03-Archive')
                    .setValue(this.plugin.settings.archiveFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.archiveFolder = value;
                        await this.plugin.saveSettings();
                    })
            );

        // =================================================================
        // Date Settings
        // =================================================================
        new Setting(containerEl).setName('Date boundary').setHeading();

        new Setting(containerEl)
            .setName('日期分界时间')
            .setDesc('凌晨几点前的日记归档为前一天（默认 6 点）')
            .addSlider((slider) =>
                slider
                    .setLimits(0, 12, 1)
                    .setValue(this.plugin.settings.dayBoundaryHour)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.dayBoundaryHour = value;
                        await this.plugin.saveSettings();
                    })
            );

        // =================================================================
        // SOP Settings
        // =================================================================
        new Setting(containerEl).setName('SOP workflow').setHeading();

        new Setting(containerEl)
            .setName('启用晨间复盘')
            .setDesc('开启晨间计划引导流程')
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableMorningSOP)
                    .onChange(async (value) => {
                        this.plugin.settings.enableMorningSOP = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('启用晚间复盘')
            .setDesc('开启晚间复盘引导流程')
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableEveningSOP)
                    .onChange(async (value) => {
                        this.plugin.settings.enableEveningSOP = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('包含选问问题')
            .setDesc('在晚间复盘中包含可选的深度问题')
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.includeOptionalQuestions)
                    .onChange(async (value) => {
                        this.plugin.settings.includeOptionalQuestions = value;
                        await this.plugin.saveSettings();
                    })
            );

        // =================================================================
        // Evening Question Editor (compact)
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
                .setDesc('OpenAI 兼容 API 的基础地址（如 DeepSeek / SiliconFlow / Groq / Ollama）');

            urlSetting.addText((text) => {
                text.inputEl.addClass('tl-setting-input-wide');
                text
                    .setPlaceholder('https://api.deepseek.com/v1')
                    .setValue(config.baseUrl || '')
                    .onChange(async (value) => {
                        this.plugin.settings.providers[provider].baseUrl = value;
                        await this.plugin.saveSettings();
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
                btn.addEventListener('click', async () => {
                    this.plugin.settings.providers[provider].baseUrl = url;
                    await this.plugin.saveSettings();
                    this.display();
                });
            }
        }

        // --- API Key with password toggle ---
        const apiKeySetting = new Setting(containerEl)
            .setName(`${this.getProviderName(provider)} API Key`)
            .setDesc('输入你的 API 密钥');

        let apiKeyInput: HTMLInputElement;
        apiKeySetting.addText((text) => {
            apiKeyInput = text.inputEl;
            apiKeyInput.type = 'password';
            apiKeyInput.addClass('tl-setting-input-key');
            text
                .setPlaceholder('输入 API Key...')
                .setValue(config.apiKey)
                .onChange(async (value) => {
                    this.plugin.settings.providers[provider].apiKey = value;
                    await this.plugin.saveSettings();
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
            .setName('模型')
            .setDesc(hasPresets ? '选择推荐模型或手动输入模型 ID' : '输入模型 ID');

        if (hasPresets) {
            modelSetting.addDropdown((dropdown) => {
                dropdown.addOption('', '— 手动输入 —');
                for (const [value, name] of Object.entries(models)) {
                    dropdown.addOption(value, name);
                }
                // If current model is in presets, select it; otherwise leave at manual
                dropdown.setValue(models[config.model] ? config.model : '');
                dropdown.onChange(async (value) => {
                    if (value) {
                        this.plugin.settings.providers[provider].model = value;
                        await this.plugin.saveSettings();
                        this.display();
                    }
                });
            });
        }

        modelSetting.addText((text) => {
            text.inputEl.addClass('tl-setting-input-model');
            text
                .setPlaceholder(this.getModelPlaceholder(provider))
                .setValue(config.model)
                .onChange(async (value) => {
                    this.plugin.settings.providers[provider].model = value;
                    await this.plugin.saveSettings();
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
                    .onClick(async () => {
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
            case 'custom':
                // No presets — user types the model ID
                return {};
            default:
                return {};
        }
    }

    /**
     * Render the evening question editor — compact collapsible rows
     */
    private renderEveningQuestions(containerEl: HTMLElement): void {
        new Setting(containerEl).setName('Evening review questions').setHeading();

        // Reset button
        new Setting(containerEl)
            .setName('恢复默认问题')
            .setDesc('将所有问题恢复为初始默认值')
            .addButton((button) =>
                button
                    .setButtonText('🔄 恢复默认')
                    .onClick(async () => {
                        this.plugin.settings.eveningQuestions = [...DEFAULT_EVENING_QUESTIONS];
                        await this.plugin.saveSettings();
                        new Notice('已恢复默认问题设置');
                        this.display();
                    })
            );

        // Compact question list
        const questions = this.plugin.settings.eveningQuestions;

        questions.forEach((question, index) => {
            // --- Collapsed row: [toggle] #N sectionName [badge] [expand] ---
            const badge = question.required ? '必问' : '选问';
            const badgeCls = question.required ? 'tl-badge-required' : 'tl-badge-optional';
            const label = `#${index + 1} ${question.sectionName}`;

            const rowSetting = new Setting(containerEl)
                .setName(label)
                .addExtraButton((btn) => {
                    btn.setIcon('chevron-down')
                        .setTooltip('展开编辑')
                        .onClick(() => {
                            // Toggle detail panel
                            const detailEl = rowSetting.settingEl.nextElementSibling;
                            if (detailEl && detailEl.hasClass('tl-q-detail')) {
                                detailEl.remove();
                                btn.setIcon('chevron-down');
                            } else {
                                this.renderQuestionDetail(rowSetting.settingEl, question, index);
                                btn.setIcon('chevron-up');
                            }
                        });
                })
                .addToggle((toggle) =>
                    toggle
                        .setValue(question.enabled)
                        .onChange(async (value) => {
                            this.plugin.settings.eveningQuestions[index].enabled = value;
                            await this.plugin.saveSettings();
                        })
                );

            // Add badge to the name element
            const nameEl = rowSetting.nameEl;
            nameEl.createSpan({
                text: ` ${badge}`,
                cls: `tl-badge ${badgeCls}`,
            });

            // Dim disabled items
            if (!question.enabled) {
                rowSetting.settingEl.addClass('tl-q-disabled');
            }
        });
    }

    /**
     * Render expanded detail panel for a question (inserted after the row)
     */
    private renderQuestionDetail(afterEl: HTMLElement, question: EveningQuestionConfig, index: number): void {
        const detailEl = document.createElement('div');
        detailEl.addClass('tl-q-detail');
        afterEl.after(detailEl);

        // Section name
        new Setting(detailEl)
            .setName('日记章节名')
            .addText((text) =>
                text
                    .setValue(question.sectionName)
                    .onChange(async (value) => {
                        this.plugin.settings.eveningQuestions[index].sectionName = value;
                        await this.plugin.saveSettings();
                    })
            );

        // Question text (textarea)
        const messageSetting = new Setting(detailEl)
            .setName('提问内容');

        const textareaEl = messageSetting.controlEl.createEl('textarea', {
            cls: 'tl-question-textarea',
        });
        textareaEl.value = question.initialMessage;
        textareaEl.rows = 3;
        textareaEl.addEventListener('change', async () => {
            this.plugin.settings.eveningQuestions[index].initialMessage = textareaEl.value;
            await this.plugin.saveSettings();
        });

        // Required toggle
        new Setting(detailEl)
            .setName('必问')
            .setDesc('必问题不可跳过')
            .addToggle((toggle) =>
                toggle
                    .setValue(question.required)
                    .onChange(async (value) => {
                        this.plugin.settings.eveningQuestions[index].required = value;
                        await this.plugin.saveSettings();
                        this.display();
                    })
            );
    }
}
