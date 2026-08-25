/**
 * Pro Modal - Current AI quota, trial, and subscription actions.
 */

import { App, Modal, Notice, requestUrl } from 'obsidian';
import type { LicenseManager } from '../services/license-manager';
import type { LicenseInfo } from '../types';
import { getLanguage, t } from '../i18n';
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
        const { contentEl } = this;
        contentEl.addClass('tl-pro-modal');
        const accessState = this.licenseManager.getAccessState();
        const purchaseUrl = this.licenseManager.getPurchaseUrl();

        contentEl.createDiv({ cls: 'tl-pro-modal-icon', text: '✨' });
        contentEl.createEl('h2', {
            cls: 'tl-pro-modal-title',
            text: t('pro.quotaTitle'),
        });
        contentEl.createEl('p', {
            cls: 'tl-pro-modal-desc',
            text: t('pro.quotaSubtitle'),
        });

        const quotaEl = contentEl.createDiv('tl-pro-quota-card');
        this.renderQuotaLoading(quotaEl);
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
            if (this.modalOpen) this.renderQuota(container, response.json);
        } catch {
            if (this.modalOpen) this.renderQuotaError(container);
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

    private renderQuotaLoading(container: HTMLElement): void {
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

        const header = container.createDiv('tl-pro-quota-header');
        header.createSpan({ cls: `tl-pro-tier-badge is-${quota.identity}`, text: this.tierLabel(quota.identity) });
        header.createSpan({ cls: 'tl-pro-quota-period', text: t('pro.quotaPeriod', quota.period) });

        const rows = container.createDiv('tl-pro-quota-rows');
        if (quota.identity === 'free') {
            const insight = quota.features.daily_insight;
            this.addQuotaRow(
                rows,
                t('pro.quotaDailyInsight'),
                t('pro.quotaRemainingOf', this.remaining(insight), insight?.limit ?? 3),
                true,
            );
            this.addQuotaRow(rows, t('pro.quotaOtherFeatures'), t('pro.quotaNotIncluded'));
            rows.createDiv({ cls: 'tl-pro-quota-upgrade-highlight', text: t('pro.quotaFreeUpgrade') });
            return;
        }

        if (quota.identity === 'trial') {
            this.addQuotaRow(
                rows,
                t('pro.quotaTrial'),
                t('pro.quotaTrialDays', this.licenseManager.getTrialDaysRemaining()),
                true,
            );
            this.addQuotaRow(rows, t('pro.quotaReports'), t('pro.quotaUnlimited'));
            const chat = quota.features.chat;
            this.addQuotaRow(
                rows,
                t('pro.quotaChat'),
                t('pro.quotaRemainingOf', this.remaining(chat), chat?.limit ?? 20),
            );
            return;
        }

        this.addQuotaRow(rows, t('pro.quotaReports'), t('pro.quotaUnlimited'));
        const chat = quota.features.chat;
        this.addQuotaRow(
            rows,
            t('pro.quotaChat'),
            t('pro.quotaRemainingOf', this.remaining(chat), chat?.limit ?? 200),
            true,
        );
        this.addQuotaRow(
            rows,
            t('pro.quotaReset'),
            this.formatResetTime(chat?.resets_at),
        );
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
    }

    private renderActions(
        contentEl: HTMLElement,
        accessState: ReturnType<LicenseManager['getAccessState']>,
        purchaseUrl: string,
    ): void {
        if (accessState !== 'paid') {
            contentEl.createDiv({ cls: 'tl-pro-pricing', text: t('pro.pricing') });
        }

        const btnGroup = contentEl.createDiv('tl-pro-modal-buttons');
        if (accessState === 'free') {
            const startBtn = btnGroup.createEl('button', {
                cls: 'tl-pro-cta-btn tl-pro-cta-cn',
                text: t('trial.start'),
                attr: { type: 'button' },
            });
            startBtn.addEventListener('click', () => {
                void (async () => {
                    startBtn.disabled = true;
                    startBtn.setText(t('trial.starting'));
                    const started = await this.licenseManager.startTrial();
                    if (!started) {
                        startBtn.disabled = false;
                        startBtn.setText(t('trial.start'));
                        new Notice(t('trial.startFailed'));
                        return;
                    }
                    new Notice(t('trial.startedNotice'));
                    this.close();
                    this.onTrialStarted?.();
                })();
            });
            contentEl.createDiv({ cls: 'tl-pro-trial-note', text: t('trial.noCharge') });
            this.createPurchaseLink(btnGroup, purchaseUrl, t('trial.buyInstead'));
        } else if (accessState === 'trial') {
            const continueBtn = btnGroup.createEl('button', {
                cls: 'tl-pro-cta-btn tl-pro-cta-cn',
                text: t('trial.continue'),
                attr: { type: 'button' },
            });
            continueBtn.addEventListener('click', () => this.close());
            this.createPurchaseLink(btnGroup, purchaseUrl, t('pro.purchase'));
        } else if (accessState === 'trial-expired' || accessState === 'license-inactive') {
            this.createPurchaseLink(btnGroup, purchaseUrl, t('pro.purchase'), true);
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

    private createPurchaseLink(
        container: HTMLElement,
        purchaseUrl: string,
        text: string,
        primary = false,
    ): void {
        const link = container.createEl('a', {
            cls: `tl-pro-cta-btn ${primary ? 'tl-pro-cta-cn' : 'tl-pro-cta-intl'}`,
            text,
            href: purchaseUrl,
        });
        link.setAttr('target', '_blank');
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

    private remaining(feature: QuotaFeature | undefined): number | string {
        if (!feature || typeof feature.used !== 'number' || typeof feature.limit !== 'number') {
            return '—';
        }
        return Math.max(0, feature.limit - feature.used);
    }

    private formatResetTime(value: number | string | null | undefined): string {
        if (value === null || value === undefined) return t('pro.quotaResetUnknown');
        const parsed = typeof value === 'number'
            ? (value < 1_000_000_000_000 ? value * 1000 : value)
            : Date.parse(value);
        if (!Number.isFinite(parsed)) return t('pro.quotaResetUnknown');
        return new Date(parsed).toLocaleString(getLanguage() === 'en' ? 'en-US' : 'zh-CN');
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
