/**
 * License Manager - Handles Pro license activation and status
 */

import TideLogPlugin from '../main';

/** Purchase URLs — replace with real product links when ready */
const PURCHASE_URLS = {
    mianbaoduo: 'https://mbd.pub/o/tidelog',   // 面包多 (国内)
    gumroad: 'https://tidelog.gumroad.com/l/pro', // Gumroad (国际)
};

export class LicenseManager {
    private plugin: TideLogPlugin;

    constructor(plugin: TideLogPlugin) {
        this.plugin = plugin;
    }

    /**
     * Check whether the user has an active Pro license
     */
    isPro(): boolean {
        return this.plugin.settings.proLicense.activated === true;
    }

    /**
     * Activate a license key (local-only for now)
     * Future: verify against Gumroad / 面包多 API
     */
    async activate(key: string): Promise<boolean> {
        const trimmed = key.trim();
        if (!trimmed) return false;

        // For now: any non-empty key is accepted.
        // TODO: call Gumroad/面包多 verify API when products are set up.
        this.plugin.settings.proLicense = {
            key: trimmed,
            activated: true,
            activatedAt: Date.now(),
        };
        await this.plugin.saveSettings();
        return true;
    }

    /**
     * Deactivate the current license
     */
    async deactivate(): Promise<void> {
        this.plugin.settings.proLicense = {
            key: '',
            activated: false,
        };
        await this.plugin.saveSettings();
    }

    /**
     * Get purchase URLs
     */
    getPurchaseUrls(): { mianbaoduo: string; gumroad: string } {
        return PURCHASE_URLS;
    }
}
