/**
 * Pro Modal - Upgrade prompt shown when Free users access Pro features
 */

import { App, Modal, Notice } from 'obsidian';
import type { LicenseManager } from '../services/license-manager';
import { t } from '../i18n';
import { renderProPurchaseGuidance } from './pro-purchase-guidance';

export class ProModal extends Modal {
    private featureName: string;
    private licenseManager: LicenseManager;
    private onTrialStarted?: () => void;

    constructor(
        app: App,
        featureName: string,
        licenseManager: LicenseManager,
        onTrialStarted?: () => void,
    ) {
        super(app);
        this.featureName = featureName;
        this.licenseManager = licenseManager;
        this.onTrialStarted = onTrialStarted;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass('tl-pro-modal');
        const accessState = this.licenseManager.getAccessState();

        // Icon
        const iconWrap = contentEl.createDiv('tl-pro-modal-icon');
        iconWrap.setText(
            accessState === 'trial-expired' || accessState === 'license-inactive'
                ? '🌱'
                : '✨',
        );

        // Title
        contentEl.createEl('h2', {
            cls: 'tl-pro-modal-title',
            text: accessState === 'trial-expired'
                ? t('trial.expiredTitle')
                : accessState === 'license-inactive'
                    ? t('trial.licenseInactiveTitle')
                : accessState === 'trial'
                    ? t('trial.activeTitle')
                    : accessState === 'paid'
                        ? t('trial.paidTitle')
                        : t('trial.offerTitle', this.featureName),
        });

        // Description
        contentEl.createEl('p', {
            cls: 'tl-pro-modal-desc',
            text: accessState === 'trial-expired'
                ? t('trial.expiredDesc')
                : accessState === 'license-inactive'
                    ? t('trial.licenseInactiveDesc')
                : accessState === 'trial'
                    ? t('trial.activeDesc', String(this.licenseManager.getTrialDaysRemaining()))
                    : accessState === 'paid'
                        ? t('trial.paidDesc')
                        : this.licenseManager.needsAISetupForTrial()
                            ? t('trial.needsAiDesc')
                            : t('trial.offerDesc'),
        });

        // Feature list
        const features = contentEl.createEl('ul', { cls: 'tl-pro-modal-features' });
        const proFeatures = [
            t('pro.feature1'),
            t('pro.feature2'),
            t('pro.feature3'),
            t('pro.feature4'),
            t('pro.feature5'),
            t('pro.feature6'),
        ];
        for (const f of proFeatures) {
            features.createEl('li', { text: f });
        }

        const purchaseUrl = this.licenseManager.getPurchaseUrl();
        const btnGroup = contentEl.createDiv('tl-pro-modal-buttons');

        if (accessState === 'free') {
            const startBtn = btnGroup.createEl('button', {
                cls: 'tl-pro-cta-btn tl-pro-cta-cn',
                text: this.licenseManager.needsAISetupForTrial()
                    ? t('trial.configureAi')
                    : t('trial.start'),
                attr: { type: 'button' },
            });
            startBtn.addEventListener('click', () => {
                if (this.licenseManager.needsAISetupForTrial()) {
                    this.close();
                    this.openSettings();
                    return;
                }
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
            const buyBtn = btnGroup.createEl('a', {
                cls: 'tl-pro-cta-btn tl-pro-cta-intl',
                text: t('trial.buyInstead'),
                href: purchaseUrl,
            });
            buyBtn.setAttr('target', '_blank');
        } else if (accessState === 'trial') {
            const continueBtn = btnGroup.createEl('button', {
                cls: 'tl-pro-cta-btn tl-pro-cta-cn',
                text: t('trial.continue'),
                attr: { type: 'button' },
            });
            continueBtn.addEventListener('click', () => this.close());
            const buyBtn = btnGroup.createEl('a', {
                cls: 'tl-pro-cta-btn tl-pro-cta-intl',
                text: t('pro.purchase'),
                href: purchaseUrl,
            });
            buyBtn.setAttr('target', '_blank');
        } else if (accessState === 'trial-expired' || accessState === 'license-inactive') {
            const buyBtn = btnGroup.createEl('a', {
                cls: 'tl-pro-cta-btn tl-pro-cta-cn',
                text: t('pro.purchase'),
                href: purchaseUrl,
            });
            buyBtn.setAttr('target', '_blank');
            renderProPurchaseGuidance(contentEl);
        } else {
            const closeBtn = btnGroup.createEl('button', {
                cls: 'tl-pro-cta-btn tl-pro-cta-cn',
                text: t('trial.continue'),
                attr: { type: 'button' },
            });
            closeBtn.addEventListener('click', () => this.close());
        }

        // Settings link
        const settingsLink = contentEl.createDiv('tl-pro-modal-settings-link');
        settingsLink.createSpan({ text: t('pro.hasCode') });
        const link = settingsLink.createEl('a', { text: t('pro.goToSettings') });
        link.addEventListener('click', (e) => {
            e.preventDefault();
            this.close();
            this.openSettings();
        });

        // Portal link — self-serve license lookup
        const portalLink = contentEl.createDiv('tl-pro-modal-settings-link');
        portalLink.createSpan({ text: t('pro.lostCode') });
        const portalAnchor = portalLink.createEl('a', {
            text: t('pro.lookupLicense'),
            href: 'https://tidelog-api.mydreamchronicle.com/portal',
        });
        portalAnchor.setAttr('target', '_blank');
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private openSettings(): void {
        const setting = (this.app as unknown as {
            setting?: { open?: () => void; openTabById?: (id: string) => void };
        }).setting;
        setting?.open?.();
        setting?.openTabById?.('tidelog');
    }
}
