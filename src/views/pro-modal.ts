/**
 * Pro Modal - Upgrade prompt shown when Free users access Pro features
 */

import { App, Modal, setIcon } from 'obsidian';
import { LicenseManager } from '../services/license-manager';

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
            text: `${this.featureName} 是 Pro 功能`,
        });

        // Description
        contentEl.createEl('p', {
            cls: 'tl-pro-modal-desc',
            text: '升级到 TideLog Pro，解锁全部深度洞察功能：',
        });

        // Feature list
        const features = contentEl.createEl('ul', { cls: 'tl-pro-modal-features' });
        const proFeatures = [
            '🌙 完整晚间复盘（全部问题维度）',
            '📊 AI 周报 / 月报洞察',
            '👤 AI 用户画像分析',
            '📅 日历热力图',
            '🏠 数据仪表盘',
            '🔄 模式 / 原则自动提炼',
        ];
        for (const f of proFeatures) {
            features.createEl('li', { text: f });
        }

        // Purchase buttons
        const urls = this.licenseManager.getPurchaseUrls();

        const btnGroup = contentEl.createDiv('tl-pro-modal-buttons');

        const cnBtn = btnGroup.createEl('a', {
            cls: 'tl-pro-cta-btn tl-pro-cta-cn',
            text: '🇨🇳 面包多购买（国内）',
            href: urls.mianbaoduo,
        });
        cnBtn.setAttr('target', '_blank');

        const intlBtn = btnGroup.createEl('a', {
            cls: 'tl-pro-cta-btn tl-pro-cta-intl',
            text: '🌍 Gumroad（国际）',
            href: urls.gumroad,
        });
        intlBtn.setAttr('target', '_blank');

        // Settings link
        const settingsLink = contentEl.createDiv('tl-pro-modal-settings-link');
        settingsLink.createEl('span', { text: '已有兑换码？' });
        const link = settingsLink.createEl('a', { text: '前往设置页输入 →' });
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
