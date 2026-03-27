/**
 * License Manager - Online license verification via Cloudflare Worker API
 * v2: Annual/lifetime types + multi-device (3 per key) + offline grace period
 */

import { requestUrl } from 'obsidian';
import TideLogPlugin from '../main';

/** API base URL */
const API_BASE = 'https://tidelog-license-api.tidelog.workers.dev';

/** Offline grace period: 7 days in milliseconds */
const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

/** Purchase URLs — replace with real product links when ready */
const PURCHASE_URLS = {
    mianbaoduo: 'https://mbd.pub/o/tidelog',
    gumroad: 'https://tidelog.gumroad.com/l/pro',
};

export class LicenseManager {
    private plugin: TideLogPlugin;

    constructor(plugin: TideLogPlugin) {
        this.plugin = plugin;
    }

    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * Check whether the user has an active Pro license.
     * Considers: activation status, expiry, and offline grace period.
     */
    isPro(): boolean {
        const license = this.plugin.settings.proLicense;
        if (!license.activated) return false;

        // Check annual license expiry
        if (license.licenseType === 'annual' && license.expiresAt) {
            if (Date.now() > license.expiresAt) return false;
        }

        // Check offline grace period
        if (license.lastVerified) {
            const elapsed = Date.now() - license.lastVerified;
            if (elapsed > GRACE_PERIOD_MS) return false;
        }

        return true;
    }

    /**
     * Get the license type label
     */
    getLicenseLabel(): string {
        const license = this.plugin.settings.proLicense;
        if (!license.activated) return 'Free';
        return license.licenseType === 'annual' ? 'Pro 年费版' : 'Pro 终身版';
    }

    /**
     * Get expiry date string (for annual licenses)
     */
    getExpiryDate(): string | null {
        const license = this.plugin.settings.proLicense;
        if (license.licenseType !== 'annual' || !license.expiresAt) return null;
        return new Date(license.expiresAt).toLocaleDateString('zh-CN');
    }

    /**
     * Activate a license key online
     */
    async activate(key: string): Promise<{ success: boolean; message: string }> {
        const trimmed = key.trim().toUpperCase();
        if (!trimmed) return { success: false, message: '请输入激活码' };

        const deviceId = this.getOrCreateDeviceId();

        try {
            const response = await requestUrl({
                url: `${API_BASE}/license/activate`,
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: trimmed, deviceId }),
            });

            const data = response.json;

            if (data.success) {
                this.plugin.settings.proLicense = {
                    key: trimmed,
                    activated: true,
                    activatedAt: Date.now(),
                    deviceId,
                    lastVerified: Date.now(),
                    licenseType: data.licenseType || 'lifetime',
                    expiresAt: data.expiresAt ? data.expiresAt * 1000 : undefined, // API returns seconds
                };
                await this.plugin.saveSettings();
                return { success: true, message: data.message || '激活成功' };
            } else {
                return { success: false, message: data.error || '激活失败' };
            }
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            // ERR_CONNECTION_CLOSED / network errors are common in China due to workers.dev being blocked
            if (errMsg.includes('ERR_CONNECTION') || errMsg.includes('ECONNREFUSED') || errMsg.includes('ETIMEDOUT') || errMsg.includes('fetch')) {
                return {
                    success: false,
                    message: '网络连接失败，可能需要科学上网后重试。如仍无法激活，请联系开发者手动激活。',
                };
            }
            return { success: false, message: `网络错误：${errMsg}` };
        }
    }

    /**
     * Verify license on startup (background, non-blocking)
     */
    async verifyOnStartup(): Promise<void> {
        const license = this.plugin.settings.proLicense;
        if (!license.activated || !license.key || !license.deviceId) return;

        try {
            const response = await requestUrl({
                url: `${API_BASE}/license/verify`,
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    key: license.key,
                    deviceId: license.deviceId,
                }),
            });

            const data = response.json;

            if (data.success && data.valid) {
                this.plugin.settings.proLicense.lastVerified = Date.now();
                // Update license type and expiry from server
                if (data.licenseType) {
                    this.plugin.settings.proLicense.licenseType = data.licenseType;
                }
                if (data.expiresAt) {
                    this.plugin.settings.proLicense.expiresAt = data.expiresAt * 1000;
                }
                await this.plugin.saveSettings();
            } else if (data.success && !data.valid) {
                if (data.status === 'expired') {
                    // Annual expired — deactivate locally
                    this.plugin.settings.proLicense.activated = false;
                    await this.plugin.saveSettings();
                }
                console.warn('[TideLog] License verification failed:', data);
            }
        } catch {
            console.warn('[TideLog] License verification network error (grace period active)');
        }
    }

    /**
     * Deactivate the current license (unbind this device)
     */
    async deactivate(): Promise<{ success: boolean; message: string }> {
        const license = this.plugin.settings.proLicense;

        if (license.key && license.deviceId) {
            try {
                await requestUrl({
                    url: `${API_BASE}/license/deactivate`,
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        key: license.key,
                        deviceId: license.deviceId,
                    }),
                });
            } catch {
                console.warn('[TideLog] Deactivate network error — clearing locally');
            }
        }

        this.plugin.settings.proLicense = {
            key: '',
            activated: false,
        };
        await this.plugin.saveSettings();
        return { success: true, message: '已取消激活' };
    }

    /**
     * Get purchase URLs
     */
    getPurchaseUrls(): { mianbaoduo: string; gumroad: string } {
        return PURCHASE_URLS;
    }

    // =========================================================================
    // Device ID
    // =========================================================================

    private getOrCreateDeviceId(): string {
        const existing = this.plugin.settings.proLicense.deviceId;
        if (existing) return existing;

        const vaultName = this.plugin.app.vault.getName();
        const salt = this.randomHex(8);
        const raw = `${vaultName}-${salt}-${Date.now()}`;

        let hash = 0;
        for (let i = 0; i < raw.length; i++) {
            const char = raw.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }

        const deviceId = `dev-${Math.abs(hash).toString(36)}-${salt}`;
        this.plugin.settings.proLicense.deviceId = deviceId;
        void this.plugin.saveSettings();
        return deviceId;
    }

    private randomHex(length: number): string {
        const chars = '0123456789abcdef';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars[Math.floor(Math.random() * chars.length)];
        }
        return result;
    }
}
