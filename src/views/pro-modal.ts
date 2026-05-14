/**
 * Pro Modal - Upgrade prompt shown when Free users access Pro features
 *
 * Layout:
 *   ✨ icon
 *   Title — "<feature> 是 Pro 专属功能"
 *   Intro line — "解锁 TideLog Pro，获得完整的元认知教练体验"
 *   Feature list (7 items)
 *   Pricing comparison card (Annual | Lifetime, lifetime gets a "best value" badge)
 *   Settings link — "已购买？点击这里激活 →"
 */

import { App, Modal } from 'obsidian';
import { LicenseManager } from '../services/license-manager';
import { Telemetry } from '../services/telemetry';
import { PRICING } from '../constants';
import { t } from '../i18n';

export class ProModal extends Modal {
    private featureName: string;
    private licenseManager: LicenseManager;
    private telemetry: Telemetry | null;

    constructor(app: App, featureName: string, licenseManager: LicenseManager, telemetry?: Telemetry) {
        super(app);
        this.featureName = featureName;
        this.licenseManager = licenseManager;
        this.telemetry = telemetry ?? null;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass('tl-pro-modal');

        this.telemetry?.track('pro_modal_shown', { feature: this.featureName });

        // Icon
        const iconWrap = contentEl.createDiv('tl-pro-modal-icon');
        iconWrap.setText('✨');

        // Title
        contentEl.createEl('h2', {
            cls: 'tl-pro-modal-title',
            text: t('pro.featureTitle', this.featureName),
        });

        // Intro
        contentEl.createEl('p', {
            cls: 'tl-pro-modal-desc',
            text: t('pro.upgradeIntro'),
        });

        // Feature list
        const features = contentEl.createEl('ul', { cls: 'tl-pro-modal-features' });
        const proFeatures = [
            t('pro.feature1'),
            t('pro.feature2'),
            t('pro.feature3'),
            t('pro.feature7'),
            t('pro.feature4'),
            t('pro.feature5'),
            t('pro.feature6'),
        ];
        for (const f of proFeatures) {
            features.createEl('li', { text: f });
        }

        // Pricing comparison
        contentEl.createEl('h3', {
            cls: 'tl-pro-price-title',
            text: t('pro.compareTitle'),
        });

        const pricingGrid = contentEl.createDiv('tl-pro-price-grid');

        // Annual card
        const annualCard = pricingGrid.createDiv('tl-pro-price-card');
        annualCard.createDiv({ cls: 'tl-pro-price-label', text: t('pricing.annualLabel') });
        const annualPriceRow = annualCard.createDiv('tl-pro-price-row');
        annualPriceRow.createSpan({ cls: 'tl-pro-price-currency', text: PRICING.annual.currency });
        annualPriceRow.createSpan({ cls: 'tl-pro-price-amount', text: String(PRICING.annual.amount) });
        annualPriceRow.createSpan({ cls: 'tl-pro-price-unit', text: t('pricing.annualUnit') });
        annualCard.createDiv({ cls: 'tl-pro-price-desc', text: t('pricing.annualDesc') });

        // Lifetime card (highlighted, badge)
        const lifetimeCard = pricingGrid.createDiv('tl-pro-price-card tl-pro-price-card-highlight');
        lifetimeCard.createDiv({ cls: 'tl-pro-price-badge', text: t('pricing.lifetimeBadge') });
        lifetimeCard.createDiv({ cls: 'tl-pro-price-label', text: t('pricing.lifetimeLabel') });
        const lifetimePriceRow = lifetimeCard.createDiv('tl-pro-price-row');
        lifetimePriceRow.createSpan({ cls: 'tl-pro-price-currency', text: PRICING.lifetime.currency });
        lifetimePriceRow.createSpan({ cls: 'tl-pro-price-amount', text: String(PRICING.lifetime.amount) });
        lifetimePriceRow.createSpan({ cls: 'tl-pro-price-unit', text: t('pricing.lifetimeUnit') });
        lifetimeCard.createDiv({ cls: 'tl-pro-price-desc', text: t('pricing.lifetimeDesc') });

        // Trust line
        const trust = contentEl.createDiv('tl-pro-price-trust');
        trust.createSpan({ text: t('pricing.devices') });
        trust.createSpan({ cls: 'tl-pro-trust-sep', text: ' · ' });
        trust.createSpan({ text: t('pricing.refund') });

        // Purchase button (single CTA — Afdian lists both SKUs)
        const purchaseUrl = this.licenseManager.getPurchaseUrl();
        const btnGroup = contentEl.createDiv('tl-pro-modal-buttons');

        const buyBtn = btnGroup.createEl('a', {
            cls: 'tl-pro-cta-btn tl-pro-cta-cn',
            text: t('pro.purchase'),
            href: purchaseUrl,
        });
        buyBtn.setAttr('target', '_blank');
        buyBtn.addEventListener('click', () => {
            this.telemetry?.track('pro_modal_purchase_clicked', { feature: this.featureName });
        });

        // Settings link
        const settingsLink = contentEl.createDiv('tl-pro-modal-settings-link');
        settingsLink.createSpan({ text: t('pro.alreadyHave') });
        const link = settingsLink.createEl('a', { text: t('pro.activateHere') });
        link.addEventListener('click', (e) => {
            e.preventDefault();
            this.close();
            const setting = (this.app as unknown as {
                setting?: { open?: () => void; openTabById?: (id: string) => void };
            }).setting;
            setting?.open?.();
            setting?.openTabById?.('tidelog');
        });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
