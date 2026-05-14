/**
 * Onboarding Modal — first-run wizard.
 *
 * 4 steps:
 *   1. Welcome — what TideLog is, why bother
 *   2. Pick provider — recommend OpenRouter, allow other
 *   3. Paste API key + test connection
 *   4. Done — offer to start morning plan immediately
 *
 * Trigger: main.ts opens it when settings.hasCompletedOnboarding is false.
 * Skipping at any step closes the modal AND marks onboarding complete —
 * we don't nag the user across sessions. They can reopen via the settings
 * page if needed (future enhancement).
 */

import { App, Modal, Notice, Platform } from 'obsidian';
import TideLogPlugin from '../main';
import { AIProviderType } from '../types';
import { t } from '../i18n';
import { formatAPIError } from '../utils/error-formatter';

const TOTAL_STEPS = 4;

// Wrapped in a function so `t()` is called AFTER the user's chosen language
// has been applied in loadSettings. (Module-level evaluation would freeze it
// to the default language at first import.)
function providerLabels(): Record<AIProviderType, string> {
    return {
        openrouter: 'OpenRouter',
        anthropic: 'Anthropic Claude',
        gemini: 'Google Gemini',
        openai: 'OpenAI',
        siliconflow: 'SiliconFlow',
        custom: t('settings.customProvider'),
    };
}

const PROVIDER_SIGNUP_URLS: Partial<Record<AIProviderType, string>> = {
    openrouter: 'https://openrouter.ai/keys',
    anthropic: 'https://console.anthropic.com/settings/keys',
    gemini: 'https://aistudio.google.com/apikey',
    openai: 'https://platform.openai.com/api-keys',
    siliconflow: 'https://cloud.siliconflow.cn/account/ak',
};

export class OnboardingModal extends Modal {
    private plugin: TideLogPlugin;
    private step = 1;
    private selectedProvider: AIProviderType;
    private apiKey = '';

    constructor(app: App, plugin: TideLogPlugin) {
        super(app);
        this.plugin = plugin;
        this.selectedProvider = plugin.settings.activeProvider;
        this.apiKey = plugin.settings.providers[this.selectedProvider]?.apiKey || '';
    }

    onOpen(): void {
        this.modalEl.addClass('tl-onboarding-modal');
        this.plugin.telemetry?.track('onboarding_started');
        this.render();
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private render(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('tl-onboarding-content');
        if (Platform.isMobile) contentEl.addClass('is-mobile');

        // Top bar — progress + skip
        const topBar = contentEl.createDiv('tl-onboard-topbar');
        topBar.createDiv({ cls: 'tl-onboard-progress', text: t('onboard.progress', this.step, TOTAL_STEPS) });
        const skip = topBar.createEl('a', { cls: 'tl-onboard-skip', text: t('onboard.skip') });
        skip.addEventListener('click', (e) => {
            e.preventDefault();
            this.finish('skipped');
        });

        // Step body
        const body = contentEl.createDiv('tl-onboard-body');
        switch (this.step) {
            case 1: this.renderStep1(body); break;
            case 2: this.renderStep2(body); break;
            case 3: this.renderStep3(body); break;
            case 4: this.renderStep4(body); break;
        }
    }

    // ── Step 1: Welcome ─────────────────────────────────────
    private renderStep1(body: HTMLElement): void {
        body.createEl('h2', { cls: 'tl-onboard-title', text: t('onboard.step1Title') });

        const bodyText = body.createDiv('tl-onboard-text');
        // Preserve line breaks in body copy
        for (const line of t('onboard.step1Body').split('\n')) {
            if (line.trim() === '') {
                bodyText.createEl('br');
            } else {
                bodyText.createEl('p', { text: line });
            }
        }

        const footer = body.createDiv('tl-onboard-footer');
        const nextBtn = footer.createEl('button', { cls: 'tl-onboard-btn tl-onboard-btn-primary', text: t('onboard.next') });
        nextBtn.addEventListener('click', () => { this.goToStep(2); });
    }

    // ── Step 2: Pick provider ───────────────────────────────
    private renderStep2(body: HTMLElement): void {
        body.createEl('h2', { cls: 'tl-onboard-title', text: t('onboard.step2Title') });
        body.createEl('p', { cls: 'tl-onboard-text', text: t('onboard.step2Body') });

        // Recommended card — OpenRouter
        const recCard = body.createDiv('tl-onboard-rec-card');
        if (this.selectedProvider === 'openrouter') recCard.addClass('is-selected');
        const recHeader = recCard.createDiv('tl-onboard-rec-header');
        recHeader.createSpan({ cls: 'tl-onboard-rec-badge', text: t('onboard.step2RecommendBadge') });
        recHeader.createSpan({ cls: 'tl-onboard-rec-title', text: t('onboard.step2OpenRouterTitle') });
        recCard.createDiv({ cls: 'tl-onboard-rec-why', text: t('onboard.step2OpenRouterWhy') });
        const openRouterCta = recCard.createEl('a', {
            cls: 'tl-onboard-rec-cta',
            text: t('onboard.step2OpenRouterCta'),
            href: 'https://openrouter.ai/keys',
        });
        openRouterCta.setAttr('target', '_blank');
        recCard.addEventListener('click', () => {
            this.selectedProvider = 'openrouter';
            this.render();
        });

        // Other providers (dropdown)
        const otherWrap = body.createDiv('tl-onboard-other');
        otherWrap.createDiv({ cls: 'tl-onboard-other-title', text: t('onboard.step2OtherTitle') });
        otherWrap.createDiv({ cls: 'tl-onboard-other-desc', text: t('onboard.step2OtherDesc') });
        const select = otherWrap.createEl('select', { cls: 'tl-onboard-select' });
        const labels = providerLabels();
        (Object.keys(labels) as AIProviderType[]).forEach((p) => {
            const opt = select.createEl('option', { text: labels[p], value: p });
            if (p === this.selectedProvider) opt.selected = true;
        });
        select.addEventListener('change', () => {
            this.selectedProvider = select.value as AIProviderType;
            // Re-render so the OpenRouter card highlight updates
            this.render();
        });

        // Footer
        const footer = body.createDiv('tl-onboard-footer');
        const back = footer.createEl('button', { cls: 'tl-onboard-btn', text: t('onboard.back') });
        back.addEventListener('click', () => { this.goToStep(1); });
        const next = footer.createEl('button', { cls: 'tl-onboard-btn tl-onboard-btn-primary', text: t('onboard.next') });
        next.addEventListener('click', () => { this.goToStep(3); });
    }

    // ── Step 3: API key ─────────────────────────────────────
    private renderStep3(body: HTMLElement): void {
        body.createEl('h2', { cls: 'tl-onboard-title', text: t('onboard.step3Title') });
        body.createEl('p', {
            cls: 'tl-onboard-text',
            text: t('onboard.step3Body', providerLabels()[this.selectedProvider]),
        });

        // Signup link for this provider, if we know one
        const signup = PROVIDER_SIGNUP_URLS[this.selectedProvider];
        if (signup) {
            const link = body.createEl('a', {
                cls: 'tl-onboard-signup',
                text: t('onboard.step2OpenRouterCta').replace('openrouter.ai', new URL(signup).host),
                href: signup,
            });
            link.setAttr('target', '_blank');
        }

        // Input
        const inputWrap = body.createDiv('tl-onboard-input-wrap');
        const input = inputWrap.createEl('input', { cls: 'tl-onboard-input' });
        input.type = 'password';
        input.placeholder = t('onboard.step3Placeholder');
        input.value = this.apiKey;
        input.addEventListener('input', () => { this.apiKey = input.value; });

        // Test result line
        const result = body.createDiv('tl-onboard-result');

        // Footer
        const footer = body.createDiv('tl-onboard-footer');
        const back = footer.createEl('button', { cls: 'tl-onboard-btn', text: t('onboard.back') });
        back.addEventListener('click', () => { this.goToStep(2); });

        const skipLink = footer.createEl('a', {
            cls: 'tl-onboard-skip-link',
            text: t('onboard.step3SkipForNow'),
        });
        skipLink.addEventListener('click', (e) => {
            e.preventDefault();
            this.finish('configured_later');
        });

        const testBtn = footer.createEl('button', { cls: 'tl-onboard-btn tl-onboard-btn-primary', text: t('onboard.step3Test') });
        testBtn.addEventListener('click', () => {
            void this.testAndAdvance(testBtn, result);
        });
    }

    private async testAndAdvance(button: HTMLButtonElement, result: HTMLElement): Promise<void> {
        if (!this.apiKey.trim()) {
            new Notice(t('onboard.step3Fail', 'empty key'));
            return;
        }

        button.setText(t('onboard.step3Testing'));
        button.disabled = true;
        result.empty();

        // Persist key + active provider so testConnection() picks it up
        const settings = this.plugin.settings;
        settings.activeProvider = this.selectedProvider;
        settings.providers[this.selectedProvider].apiKey = this.apiKey.trim();
        settings.providers[this.selectedProvider].enabled = true;
        await this.plugin.saveSettings();

        try {
            const ok = await this.plugin.getAIProvider().testConnection();
            if (ok) {
                this.plugin.telemetry?.track('onboarding_key_test_success', { provider: this.selectedProvider });
                result.addClass('is-success');
                result.setText(t('onboard.step3Success'));
                button.setText(t('onboard.next'));
                button.disabled = false;
                button.onclick = () => { this.goToStep(4); };
            } else {
                this.plugin.telemetry?.track('onboarding_key_test_fail', { provider: this.selectedProvider });
                result.addClass('is-error');
                result.setText(t('onboard.step3Fail', 'invalid key or model'));
                button.setText(t('onboard.step3Test'));
                button.disabled = false;
            }
        } catch (err) {
            this.plugin.telemetry?.track('onboarding_key_test_fail', { provider: this.selectedProvider });
            const msg = formatAPIError(err, this.selectedProvider);
            const code = msg.match(/\*\*(TL-\d+)\*\*/)?.[1] ?? '';
            result.addClass('is-error');
            result.setText(t('onboard.step3Fail', code || 'see settings'));
            button.setText(t('onboard.step3Test'));
            button.disabled = false;
        }
    }

    // ── Step 4: Done ────────────────────────────────────────
    private renderStep4(body: HTMLElement): void {
        body.createEl('h2', { cls: 'tl-onboard-title', text: t('onboard.step4Title') });
        body.createEl('p', { cls: 'tl-onboard-text', text: t('onboard.step4Body') });

        const footer = body.createDiv('tl-onboard-footer');
        const later = footer.createEl('button', { cls: 'tl-onboard-btn', text: t('onboard.step4CloseLater') });
        later.addEventListener('click', () => { this.finish('completed'); });

        const startBtn = footer.createEl('button', {
            cls: 'tl-onboard-btn tl-onboard-btn-primary',
            text: t('onboard.step4StartMorning'),
        });
        startBtn.addEventListener('click', () => {
            this.finish('completed_with_morning');
            void this.plugin.activateChatView('morning');
        });
    }

    // ── Helpers ─────────────────────────────────────────────
    private goToStep(step: number): void {
        this.step = step;
        this.plugin.telemetry?.track('onboarding_step', { step });
        this.render();
    }

    private finish(outcome: 'completed' | 'completed_with_morning' | 'skipped' | 'configured_later'): void {
        this.plugin.settings.hasCompletedOnboarding = true;
        void this.plugin.saveSettings();
        this.plugin.telemetry?.track('onboarding_finished', { outcome });
        this.close();
    }
}
