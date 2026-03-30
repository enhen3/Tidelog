/**
 * Pro Modal - Upgrade prompt shown when Free users access Pro features
 */

import { App, Modal } from 'obsidian';
import { LicenseManager } from '../services/license-manager';
import { t } from '../i18n';

export class ProModal extends Modal {
    private featureName: string;
    private licenseManager: LicenseManager;

    constructor(app: App, featureName: string, licenseManager: LicenseManager) {
        super(app);
        this.featureName = featureName;
        this.licenseManager = licenseManager;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass('tl-pro-modal');

        // Icon
        const iconWrap = contentEl.createDiv('tl-pro-modal-icon');
        iconWrap.setText('✨');

        // Title
        contentEl.createEl('h2', {
            cls: 'tl-pro-modal-title',
            text: t('pro.featureTitle', this.featureName),
        });

        // Description
        contentEl.createEl('p', {
            cls: 'tl-pro-modal-desc',
            text: t('pro.upgradeDesc'),
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

        // Purchase button
        const purchaseUrl = this.licenseManager.getPurchaseUrl();

        const btnGroup = contentEl.createDiv('tl-pro-modal-buttons');

        const buyBtn = btnGroup.createEl('a', {
            cls: 'tl-pro-cta-btn tl-pro-cta-cn',
            text: t('pro.purchase'),
            href: purchaseUrl,
        });
        buyBtn.setAttr('target', '_blank');

        // Settings link
        const settingsLink = contentEl.createDiv('tl-pro-modal-settings-link');
        settingsLink.createEl('span', { text: t('pro.hasCode') });
        const link = settingsLink.createEl('a', { text: t('pro.goToSettings') });
        link.addEventListener('click', (e) => {
            e.preventDefault();
            this.close();
            // Open plugin settings
            // @ts-expect-error — Obsidian internal API
            this.app.setting?.open?.();
            // @ts-expect-error — Obsidian internal API
            this.app.setting?.openTabById?.('tidelog');
        });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
