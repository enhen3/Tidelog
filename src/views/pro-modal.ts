/**
 * Pro Modal - Current AI quota, trial, and subscription actions.
 */

import { App, Modal, Notice, requestUrl } from 'obsidian';
import type { LicenseManager } from '../services/license-manager';
import type { LicenseInfo } from '../types';
import { getLanguage, t } from '../i18n';
import { bindAfdianPurchaseFlow } from '../utils/purchase-flow';
import { renderProPurchaseGuidance } from './pro-purchase-guidance';

const API_BASE = 'https://tidelog-api.mydreamchronicle.com';
const DAY_MS = 24 * 60 * 60 * 1000;

interface QuotaFeature {
    used: number;
    limit: number | null;
    resets_at?: number | string | null;
}

interface QuotaResponse {
    identity: 'free' | 'trial' | 'pro';
    period: string;
    trial_state?: 'eligible' | 'active' | 'expired' | 'ineligible';
    trial_started_at?: number | null;
    trial_expires_at?: number | null;
    features: {
        daily_insight?: QuotaFeature;
        weekly?: QuotaFeature;
        monthly?: QuotaFeature;
        profile?: QuotaFeature;
        chat?: QuotaFeature;
    };
}

interface PluginSettingsAccess {
    plugin?: {
        settings?: {
            proLicense?: LicenseInfo;
        };
    };
}

export class ProModal extends Modal {
    private licenseManager: LicenseManager;
    private onTrialStarted?: () => void;
    private modalOpen = false;

    constructor(
        app: App,
        _featureName: string,
        licenseManager: LicenseManager,
        onTrialStarted?: () => void,
    ) {
        super(app);
        this.licenseManager = licenseManager;
        this.onTrialStarted = onTrialStarted;
    }

    onOpen(): void {
        this.modalOpen = true;
        this.renderContent();
    }

    private renderContent(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('tl-pro-modal');
        const accessState = this.licenseManager.getAccessState();
        const purchaseUrl = this.licenseManager.getPurchaseUrl();

        contentEl.createDiv({ cls: 'tl-pro-modal-icon', text: '✨' });
        contentEl.createEl('h2', {
            cls: 'tl-pro-modal-title',
            text: t(this.modalTitleKey(accessState)),
        });
        const subtitle = t(this.modalSubtitleKey(accessState));
        if (subtitle) {
            contentEl.createEl('p', {
                cls: 'tl-pro-modal-desc',
                text: subtitle,
            });
        }

        const quotaEl = contentEl.createDiv('tl-pro-quota-card');
        this.renderQuotaLoading(quotaEl, accessState);
        void this.loadQuota(quotaEl);

        this.renderExpiryReminder(contentEl, accessState, purchaseUrl);
        this.renderActions(contentEl, accessState, purchaseUrl);
        this.renderLicenseLinks(contentEl);
    }

    onClose(): void {
        this.modalOpen = false;
        this.contentEl.empty();
    }

    private async loadQuota(container: HTMLElement): Promise<void> {
        try {
            const license = this.getProLicense();
            const deviceId = license?.deviceId?.trim()
                || this.licenseManager.getOrCreateDeviceId();
            const params = new URLSearchParams({ deviceId });
            const licenseKey = license?.key?.trim();
            if (licenseKey) params.set('licenseKey', licenseKey);

            const response = await requestUrl({
                url: `${API_BASE}/ai/quota?${params.toString()}`,
                method: 'GET',
                throw: false,
            });
            if (response.status !== 200 || !this.isQuotaResponse(response.json)) {
                throw new Error(`Quota request returned ${response.status}`);
            }
            const beforeSync = this.licenseManager.getAccessState();
            if (response.json.trial_state && response.json.trial_state !== 'ineligible') {
                await this.licenseManager.applyTrialServerSnapshot({
                    state: response.json.trial_state,
                    started_at: response.json.trial_started_at ?? null,
                    expires_at: response.json.trial_expires_at ?? null,
                });
            }
            if (this.modalOpen && beforeSync !== this.licenseManager.getAccessState()) {
                // 本地缓存与服务端不一致时，整个弹窗都要重绘；只改配额卡会留下错误的试用按钮。
                this.renderContent();
                return;
            }
            if (this.modalOpen) this.renderQuota(container, response.json);
        } catch {
            if (!this.modalOpen) return;
            if (this.licenseManager.getAccessState() === 'free') {
                // 版本对比是固定权益，不应因实时配额接口暂时不可用而消失。
                this.renderFreeComparison(container);
                return;
            }
            this.renderQuotaError(container);
        }
    }

    private isQuotaResponse(value: unknown): value is QuotaResponse {
        if (!value || typeof value !== 'object') return false;
        const candidate = value as Partial<QuotaResponse>;
        return (candidate.identity === 'free'
            || candidate.identity === 'trial'
            || candidate.identity === 'pro')
            && typeof candidate.period === 'string'
            && Boolean(candidate.features && typeof candidate.features === 'object');
    }

    private renderQuotaLoading(
        container: HTMLElement,
        accessState: ReturnType<LicenseManager['getAccessState']>,
    ): void {
        if (accessState === 'free') {
            this.renderFreeComparison(container);
            container.setAttr('aria-busy', 'true');
            return;
        }
        container.empty();
        container.setAttr('aria-busy', 'true');
        container.createDiv({ cls: 'tl-pro-quota-loading-title', text: t('pro.quotaLoading') });
        for (let i = 0; i < 2; i++) {
            container.createDiv('tl-pro-quota-skeleton');
        }
    }

    private renderQuotaError(container: HTMLElement): void {
        container.empty();
        container.setAttr('aria-busy', 'false');
        container.createDiv({ cls: 'tl-pro-quota-error-title', text: t('pro.quotaUnavailable') });
        container.createDiv({ cls: 'tl-pro-quota-error-desc', text: t('pro.quotaUnavailableDesc') });
    }

    private renderQuota(container: HTMLElement, quota: QuotaResponse): void {
        container.empty();
        container.setAttr('aria-busy', 'false');

        if (quota.identity === 'free') {
            this.renderFreeComparison(container);
            return;
        }

        if (quota.identity === 'trial') {
            container.addClass('tl-pro-trial-status-card');
            const statusHeader = container.createDiv('tl-pro-trial-status-header');
            statusHeader.createDiv({ cls: 'tl-pro-trial-status-title', text: t('pro.trialStatusTitle') });
            statusHeader.createSpan({
                cls: 'tl-pro-trial-days',
                text: t('pro.quotaTrialDays', this.trialDaysRemaining(quota.trial_expires_at)),
            });
            container.createDiv({ cls: 'tl-pro-trial-features', text: t('pro.trialStatusFeatures') });
            return;
        }

        const header = container.createDiv('tl-pro-quota-header');
        header.createSpan({ cls: `tl-pro-tier-badge is-${quota.identity}`, text: this.tierLabel(quota.identity) });
        const rows = container.createDiv('tl-pro-quota-rows');
        this.addQuotaRow(rows, t('pro.quotaReports'), t('pro.quotaUnlocked'), true);
        const chat = quota.features.chat;
        this.addQuotaRow(
            rows,
            t('pro.quotaChat'),
            this.monthlyRemainingLabel(chat),
        );
    }

    private renderFreeComparison(container: HTMLElement): void {
        container.empty();
        container.addClass('tl-pro-comparison-card');
        container.setAttr('aria-busy', 'false');
        container.createDiv({ cls: 'tl-pro-comparison-title', text: t('pro.compareTitle') });

        const table = container.createEl('table', {
            cls: 'tl-pro-comparison-table',
            attr: { 'aria-label': t('pro.compareTitle') },
        });
        const header = table.createEl('thead').createEl('tr');
        header.createEl('th', { text: t('pro.compareFeature'), attr: { scope: 'col' } });
        header.createEl('th', { text: t('pro.compareFree'), attr: { scope: 'col' } });
        header.createEl('th', {
            cls: 'is-pro',
            text: t('pro.comparePro'),
            attr: { scope: 'col' },
        });

        const body = table.createEl('tbody');
        this.addComparisonRow(body, t('pro.comparePlan'), t('pro.compareBasic'), t('pro.compareComplete'));
        this.addComparisonRow(body, t('pro.compareFeedback'), t('pro.compareFeedbackFree'), t('pro.compareUnlimited'));
        this.addComparisonRow(body, t('pro.compareProfile'), t('pro.compareProfileFree'), t('pro.compareProfilePro'));
        this.addComparisonRow(body, t('pro.compareReports'), t('pro.compareUnavailable'), t('pro.compareAvailable'));
        this.addComparisonRow(body, t('pro.compareChat'), t('pro.compareUnavailable'), t('pro.compareAvailable'));
    }

    private addComparisonRow(container: HTMLElement, feature: string, free: string, pro: string): void {
        const row = container.createEl('tr');
        row.createEl('th', { text: feature, attr: { scope: 'row' } });
        row.createEl('td', { text: free });
        row.createEl('td', { cls: 'is-pro', text: pro });
    }

    private addQuotaRow(
        container: HTMLElement,
        label: string,
        value: string,
        emphasis = false,
    ): void {
        const row = container.createDiv({
            cls: `tl-pro-quota-row${emphasis ? ' is-emphasis' : ''}`,
        });
        row.createSpan({ cls: 'tl-pro-quota-label', text: label });
        row.createSpan({ cls: 'tl-pro-quota-value', text: value });
    }

    private renderExpiryReminder(
        contentEl: HTMLElement,
        accessState: ReturnType<LicenseManager['getAccessState']>,
        purchaseUrl: string,
    ): void {
        if (accessState !== 'paid') return;
        const expiresAt = this.getProLicense()?.expiresAt;
        if (!expiresAt) return;

        const daysRemaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / DAY_MS));
        if (daysRemaining > 14) return;

        const reminder = contentEl.createDiv('tl-pro-expiry-reminder');
        reminder.createDiv({
            cls: 'tl-pro-expiry-title',
            text: daysRemaining === 0
                ? t('pro.expiresToday')
                : t('pro.expiresSoon', daysRemaining),
        });
        reminder.createDiv({
            cls: 'tl-pro-expiry-date',
            text: t('pro.expiresOn', this.formatDate(expiresAt)),
        });
        const renewLink = reminder.createEl('a', {
            cls: 'tl-pro-expiry-renew',
            text: t('pro.renewNow'),
            href: purchaseUrl,
        });
        renewLink.setAttr('target', '_blank');
        bindAfdianPurchaseFlow(renewLink, purchaseUrl, () => {
            renewLink.setText(t('pro.purchaseRetryAction'));
        });
    }

    private renderActions(
        contentEl: HTMLElement,
        accessState: ReturnType<LicenseManager['getAccessState']>,
        purchaseUrl: string,
    ): void {
        const btnGroup = contentEl.createDiv('tl-pro-modal-buttons');
        if (accessState === 'free') {
            const startBtn = btnGroup.createEl('button', {
                cls: 'tl-pro-cta-btn tl-pro-cta-cn',
                attr: { type: 'button' },
            });
            this.renderTrialButtonContents(startBtn);
            startBtn.addEventListener('click', () => {
                void (async () => {
                    startBtn.disabled = true;
                    startBtn.setText(t('trial.starting'));
                    const started = await this.licenseManager.startTrial();
                    if (!started) {
                        if (this.licenseManager.getAccessState() !== 'free') {
                            this.renderContent();
                            new Notice(t('trial.startFailed'));
                            return;
                        }
                        startBtn.disabled = false;
                        this.renderTrialButtonContents(startBtn);
                        new Notice(t('trial.startFailed'));
                        return;
                    }
                    new Notice(t('trial.startedNotice'));
                    this.close();
                    this.onTrialStarted?.();
                })();
            });
            this.createPurchaseLink(btnGroup, purchaseUrl, t('trial.buyInstead'), false, t('pro.pricing'));
        } else if (accessState === 'trial') {
            const continueBtn = btnGroup.createEl('button', {
                cls: 'tl-pro-cta-btn tl-pro-cta-cn',
                text: t('trial.continue'),
                attr: { type: 'button' },
            });
            continueBtn.addEventListener('click', () => this.close());
            this.createPurchaseLink(btnGroup, purchaseUrl, t('trial.buyDuringTrial'), false, t('pro.pricing'));
        } else if (accessState === 'trial-expired' || accessState === 'license-inactive') {
            this.createPurchaseLink(btnGroup, purchaseUrl, t('pro.purchase'), true, t('pro.pricing'));
            renderProPurchaseGuidance(contentEl);
        } else {
            const closeBtn = btnGroup.createEl('button', {
                cls: 'tl-pro-cta-btn tl-pro-cta-cn',
                text: t('trial.continue'),
                attr: { type: 'button' },
            });
            closeBtn.addEventListener('click', () => this.close());
            this.createPurchaseLink(btnGroup, purchaseUrl, t('pro.renew'));
        }
    }

    private renderTrialButtonContents(button: HTMLButtonElement): void {
        button.empty();
        button.createSpan({ cls: 'tl-pro-cta-title', text: t('trial.start') });
        button.createSpan({ cls: 'tl-pro-cta-subtitle', text: t('trial.compactPromise') });
    }

    private createPurchaseLink(
        container: HTMLElement,
        purchaseUrl: string,
        text: string,
        primary = false,
        subtitle?: string,
    ): void {
        const link = container.createEl('a', {
            cls: `tl-pro-cta-btn tl-pro-cta-purchase${primary ? ' is-primary' : ''}`,
            href: purchaseUrl,
        });
        link.createSpan({ cls: 'tl-pro-cta-title', text });
        if (subtitle) {
            link.createSpan({ cls: 'tl-pro-cta-subtitle', text: subtitle });
        }
        link.setAttr('target', '_blank');
        bindAfdianPurchaseFlow(link, purchaseUrl, () => {
            link.querySelector<HTMLElement>('.tl-pro-cta-title')
                ?.setText(t('pro.purchaseRetryAction'));
        });
    }

    private renderLicenseLinks(contentEl: HTMLElement): void {
        const settingsLink = contentEl.createDiv('tl-pro-modal-settings-link');
        settingsLink.createSpan({ text: t('pro.hasCode') });
        const link = settingsLink.createEl('a', { text: t('pro.goToSettings') });
        link.addEventListener('click', (event) => {
            event.preventDefault();
            this.close();
            this.openSettings();
        });

        const portalLink = contentEl.createDiv('tl-pro-modal-settings-link');
        portalLink.createSpan({ text: t('pro.lostCode') });
        const portalAnchor = portalLink.createEl('a', {
            text: t('pro.lookupLicense'),
            href: 'https://tidelog-api.mydreamchronicle.com/portal',
        });
        portalAnchor.setAttr('target', '_blank');
    }

    private getProLicense(): LicenseInfo | undefined {
        return (this.licenseManager as unknown as PluginSettingsAccess).plugin
            ?.settings?.proLicense;
    }

    private tierLabel(identity: QuotaResponse['identity']): string {
        if (identity === 'trial') return t('pro.tierTrial');
        if (identity === 'pro') return t('pro.tierPro');
        return t('pro.tierFree');
    }

    private modalTitleKey(accessState: ReturnType<LicenseManager['getAccessState']>): string {
        if (accessState === 'trial') return 'pro.modalTitleTrial';
        if (accessState === 'paid') return 'pro.modalTitlePaid';
        if (accessState === 'trial-expired' || accessState === 'license-inactive') return 'pro.modalTitleExpired';
        return 'pro.modalTitleFree';
    }

    private modalSubtitleKey(accessState: ReturnType<LicenseManager['getAccessState']>): string {
        if (accessState === 'trial') return 'pro.modalSubtitleTrial';
        if (accessState === 'paid') return 'pro.modalSubtitlePaid';
        if (accessState === 'trial-expired' || accessState === 'license-inactive') return 'pro.modalSubtitleExpired';
        return 'pro.modalSubtitleFree';
    }

    private remaining(feature: QuotaFeature | undefined): number | string {
        if (!feature || typeof feature.used !== 'number' || typeof feature.limit !== 'number') {
            return '—';
        }
        return Math.max(0, feature.limit - feature.used);
    }

    private monthlyRemainingLabel(feature: QuotaFeature | undefined): string {
        const remaining = this.remaining(feature);
        return typeof remaining === 'number'
            ? t('pro.quotaMonthlyRemaining', remaining)
            : t('pro.quotaUnknown');
    }

    private trialDaysRemaining(expiresAt: number | null | undefined): number {
        if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) {
            return this.licenseManager.getTrialDaysRemaining();
        }
        const milliseconds = expiresAt < 1_000_000_000_000 ? expiresAt * 1000 : expiresAt;
        return Math.max(0, Math.ceil((milliseconds - Date.now()) / DAY_MS));
    }

    private formatDate(value: number): string {
        return new Date(value).toLocaleDateString(getLanguage() === 'en' ? 'en-US' : 'zh-CN');
    }

    private openSettings(): void {
        const setting = (this.app as unknown as {
            setting?: { open?: () => void; openTabById?: (id: string) => void };
        }).setting;
        setting?.open?.();
        setting?.openTabById?.('tidelog');
    }
}
