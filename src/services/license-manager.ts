/**
 * License Manager - Online license verification via Cloudflare Worker API
 *
 * Features:
 *  - Online activation with device binding
 *  - Startup verification
 *  - Offline grace period (7 days)
 *  - Automatic device ID generation
 */

import { requestUrl } from 'obsidian';
import TideLogPlugin from '../main';

/** API base URL — replace with your deployed Worker URL */
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
     * Considers the offline grace period.
     */
    isPro(): boolean {
        const license = this.plugin.settings.proLicense;
        if (!license.activated) return false;

        // If lastVerified exists, check grace period
        if (license.lastVerified) {
            const elapsed = Date.now() - license.lastVerified;
            if (elapsed > GRACE_PERIOD_MS) {
                // Grace period expired — lock the user out
                return false;
            }
        }

        return true;
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
                };
                await this.plugin.saveSettings();
                return { success: true, message: data.message || '激活成功' };
            } else {
                return { success: false, message: data.error || '激活失败' };
            }
        } catch (err) {
            // Network error — allow offline activation as fallback
            // for first-time users who might not have connectivity
            return { success: false, message: `网络错误：${err instanceof Error ? err.message : '请检查网络连接'}` };
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
                // Update last verified timestamp
                this.plugin.settings.proLicense.lastVerified = Date.now();
                await this.plugin.saveSettings();
            } else if (data.success && !data.valid) {
                // License is no longer valid (revoked or device mismatch)
                // Don't immediately deactivate — let grace period handle it
                // But don't refresh the lastVerified either
                console.warn('[TideLog] License verification failed:', data);
            }
        } catch {
            // Network error — silently ignore, grace period will handle
            console.warn('[TideLog] License verification network error (grace period active)');
        }
    }

    /**
     * Deactivate the current license
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
                // If network fails, still deactivate locally
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

    /**
     * Get or create a persistent anonymous device ID.
     * Based on vault name + a random salt for anonymity.
     */
    private getOrCreateDeviceId(): string {
        const existing = this.plugin.settings.proLicense.deviceId;
        if (existing) return existing;

        // Generate a new device ID
        const vaultName = this.plugin.app.vault.getName();
        const salt = this.randomHex(8);
        const raw = `${vaultName}-${salt}-${Date.now()}`;

        // Simple hash
        let hash = 0;
        for (let i = 0; i < raw.length; i++) {
            const char = raw.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }

        const deviceId = `dev-${Math.abs(hash).toString(36)}-${salt}`;

        // Persist it
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
