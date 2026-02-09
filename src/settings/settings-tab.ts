/**
 * Settings Tab - Plugin configuration UI
 */

import {
    App,
    PluginSettingTab,
    Setting,
    Notice,
} from 'obsidian';

import AIFlowManagerPlugin from '../main';
import { AIProviderType, DEFAULT_EVENING_QUESTIONS, EveningQuestionConfig } from '../types';

export class AIFlowSettingTab extends PluginSettingTab {
    plugin: AIFlowManagerPlugin;

    constructor(app: App, plugin: AIFlowManagerPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // Header
        containerEl.createEl('h1', { text: 'Dailot「小舵」设置' });

        // =================================================================
        // AI Provider Settings
        // =================================================================
        containerEl.createEl('h2', { text: 'AI 服务配置' });

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
        containerEl.createEl('h2', { text: '文件夹设置' });

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
        containerEl.createEl('h2', { text: '日期设置' });

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
        containerEl.createEl('h2', { text: 'SOP 流程设置' });

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

        // API Key with password toggle
        const apiKeySetting = new Setting(containerEl)
            .setName(`${this.getProviderName(provider)} API Key`)
            .setDesc('输入你的 API 密钥');

        // Use native input with password type
        let apiKeyInput: HTMLInputElement;
        apiKeySetting.addText((text) => {
            apiKeyInput = text.inputEl;
            apiKeyInput.type = 'password';
            apiKeyInput.style.width = '250px';
            text
                .setPlaceholder('输入 API Key...')
                .setValue(config.apiKey)
                .onChange(async (value) => {
                    this.plugin.settings.providers[provider].apiKey = value;
                    await this.plugin.saveSettings();
                });
        });

        // Toggle visibility button
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

        // Model selection
        new Setting(containerEl)
            .setName('模型')
            .setDesc('选择要使用的模型')
            .addDropdown((dropdown) => {
                const models = this.getModelsForProvider(provider);
                for (const [value, name] of Object.entries(models)) {
                    dropdown.addOption(value, name);
                }
                dropdown
                    .setValue(config.model)
                    .onChange(async (value) => {
                        this.plugin.settings.providers[provider].model = value;
                        await this.plugin.saveSettings();
                    });
            });

        // Test connection button
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
                                // Reset after 2 seconds
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
        };
        return names[provider];
    }

    /**
     * Get available models for provider
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
            default:
                return {};
        }
    }

    /**
     * Render the evening question editor
     */
    private renderEveningQuestions(containerEl: HTMLElement): void {
        containerEl.createEl('h2', { text: '晚间复盘问题配置' });

        // Description
        const descEl = containerEl.createEl('p', {
            cls: 'setting-item-description',
        });
        descEl.setText('自定义晚间复盘的问题内容。你可以修改问题文字、切换必问/选问、启用/禁用单个问题。');

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

        // Render each question
        const questions = this.plugin.settings.eveningQuestions;

        questions.forEach((question, index) => {
            // Question card container
            const cardEl = containerEl.createDiv('ai-flow-question-card');

            // Header with index and type badge
            const headerEl = cardEl.createDiv('ai-flow-question-header');
            const badge = question.required ? '必问' : '选问';
            const badgeCls = question.required ? 'ai-flow-badge-required' : 'ai-flow-badge-optional';
            headerEl.createSpan({
                text: `#${index + 1}`,
                cls: 'ai-flow-question-index',
            });
            headerEl.createSpan({
                text: badge,
                cls: `ai-flow-badge ${badgeCls}`,
            });
            if (!question.enabled) {
                headerEl.createSpan({
                    text: '(已禁用)',
                    cls: 'ai-flow-badge ai-flow-badge-disabled',
                });
            }

            // Section name
            new Setting(cardEl)
                .setName('日记章节名')
                .setDesc('对应日记中的 section 标题')
                .addText((text) =>
                    text
                        .setValue(question.sectionName)
                        .onChange(async (value) => {
                            this.plugin.settings.eveningQuestions[index].sectionName = value;
                            await this.plugin.saveSettings();
                        })
                );

            // Initial message (textarea)
            const messageSetting = new Setting(cardEl)
                .setName('提问内容')
                .setDesc('AI 向用户展示的问题文字（支持 \\n 换行）');

            const textareaEl = messageSetting.controlEl.createEl('textarea', {
                cls: 'ai-flow-question-textarea',
            });
            textareaEl.value = question.initialMessage;
            textareaEl.rows = 3;
            textareaEl.addEventListener('change', async () => {
                this.plugin.settings.eveningQuestions[index].initialMessage = textareaEl.value;
                await this.plugin.saveSettings();
            });

            // Toggles row
            new Setting(cardEl)
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

            new Setting(cardEl)
                .setName('启用')
                .setDesc('禁用后此问题不会出现在复盘流程中')
                .addToggle((toggle) =>
                    toggle
                        .setValue(question.enabled)
                        .onChange(async (value) => {
                            this.plugin.settings.eveningQuestions[index].enabled = value;
                            await this.plugin.saveSettings();
                            this.display();
                        })
                );
        });
    }
}
