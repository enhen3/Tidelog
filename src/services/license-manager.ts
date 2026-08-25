/**
 * License Manager - Online license verification via Cloudflare Worker API
 * v2: Annual/lifetime types + multi-device (3 per key) + offline grace period
 */

import { requestUrl } from 'obsidian';
import type TideLogPlugin from '../main';

/** API base URL */
const API_BASE = 'https://tidelog-api.mydreamchronicle.com';

/** Offline grace period: 7 days in milliseconds */
const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

/** One-time full-product trial: 7 days in milliseconds */
const TRIAL_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

/** Purchase URL */
const PURCHASE_URL = 'https://afdian.com/item/463307362c2f11f1b39d52540025c377';

/** Max retry attempts for API calls */
const MAX_RETRIES = 2;

/**
 * Robust HTTP POST with retry.
 * Obsidian's requestUrl can fail transiently when the user's network or proxy
 * changes, so short retries prevent a paid-license action from failing too
 * eagerly.
 */
async function apiPost(url: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const jsonBody = JSON.stringify(body);
    const headers = { 'Content-Type': 'application/json' };
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await requestUrl({
                url,
                method: 'POST',
                headers,
                body: jsonBody,
                throw: false,
            });

            const data = response.json as Record<string, unknown>;
            if (response.status >= 500 && attempt < MAX_RETRIES) {
                lastError = new Error(`License server returned ${response.status}`);
                await new Promise(r => window.setTimeout(r, 1000 * (attempt + 1)));
                continue;
            }

            return data;
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            // Wait before retry
            if (attempt < MAX_RETRIES) {
                await new Promise(r => window.setTimeout(r, 1000 * (attempt + 1)));
            }
        }
    }
    throw lastError || new Error('Request failed after retries');
}

export class LicenseManager {
    private plugin: TideLogPlugin;

    constructor(plugin: TideLogPlugin) {
        this.plugin = plugin;
    }

    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * Check whether the user has an active paid license.
     * Considers: activation status, expiry, and offline grace period.
     */
    hasPaidLicense(): boolean {
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
     * Check whether the one-time local trial is currently active.
     */
    isTrialActive(): boolean {
        const { startedAt, expiresAt } = this.plugin.settings.trial;
        return Boolean(startedAt && expiresAt && Date.now() < expiresAt);
    }

    /**
     * Compatibility access check used by existing Pro gates.
     * A paid license and an active trial both unlock the full product.
     */
    isPro(): boolean {
        return this.hasPaidLicense() || this.isTrialActive();
    }

    getAccessState(): 'free' | 'trial' | 'trial-expired' | 'license-inactive' | 'paid' {
        if (this.hasPaidLicense()) return 'paid';
        if (this.isTrialActive()) return 'trial';
        if (this.plugin.settings.trial.startedAt) return 'trial-expired';
        if (this.plugin.settings.proLicense.activatedAt) return 'license-inactive';
        return 'free';
    }

    isTrialEligible(): boolean {
        const license = this.plugin.settings.proLicense;
        return !this.plugin.settings.trial.startedAt
            && !license.activated
            && !license.activatedAt;
    }

    /**
     * 自 1.2 起 AI 由 TideLog 服务端统一提供，试用不再需要用户先配置 AI，
     * 故恒为 false。保留此方法以免调用方（pro-modal 等）编译失败。
     */
    needsAISetupForTrial(): boolean {
        return false;
    }

    async startTrial(): Promise<boolean> {
        if (!this.isTrialEligible()) return false;

        const now = Date.now();
        this.plugin.settings.trial = {
            ...this.plugin.settings.trial,
            startedAt: now,
            expiresAt: now + TRIAL_PERIOD_MS,
        };
        await this.plugin.saveSettings();
        return true;
    }

    async markTrialOfferShown(): Promise<void> {
        if (this.plugin.settings.trial.offerShownAt) return;
        this.plugin.settings.trial.offerShownAt = Date.now();
        await this.plugin.saveSettings();
    }

    getTrialDaysRemaining(): number {
        const expiresAt = this.plugin.settings.trial.expiresAt;
        if (!expiresAt) return 0;
        return Math.max(0, Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
    }

    getTrialExpiryDate(): string | null {
        const expiresAt = this.plugin.settings.trial.expiresAt;
        if (!expiresAt) return null;
        return new Date(expiresAt).toLocaleDateString(
            this.plugin.settings.language === 'en' ? 'en-US' : 'zh-CN',
        );
    }

    /**
     * Get the license type label
     */
    getLicenseLabel(): string {
        const license = this.plugin.settings.proLicense;
        if (!license.activated) return 'Free';
        return license.licenseType === 'annual' ? 'Pro 年度版' : 'Pro 终身版';
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
            const data = await apiPost(`${API_BASE}/license/activate`, { key: trimmed, deviceId });

            if (data.success) {
                this.plugin.settings.proLicense = {
                    key: trimmed,
                    activated: true,
                    activatedAt: Date.now(),
                    deviceId,
                    lastVerified: Date.now(),
                    licenseType: (data.licenseType as 'annual' | 'lifetime') || 'lifetime',
                    expiresAt: data.expiresAt ? (data.expiresAt as number) * 1000 : undefined,
                };
                await this.plugin.saveSettings();
                return { success: true, message: (data.message as string) || '激活成功' };
            } else {
                return { success: false, message: (data.error as string) || '激活失败' };
            }
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            return {
                success: false,
                message: `网络连接失败，请检查网络后重试。如仍无法激活，请将以下信息发送给开发者：\n激活码: ${this.maskKey(trimmed)}\n设备ID: ${deviceId}\n错误: ${errMsg}`,
            };
        }
    }

    /**
     * Verify license on startup (background, non-blocking)
     */
    async verifyOnStartup(): Promise<void> {
        const license = this.plugin.settings.proLicense;
        if (!license.activated || !license.key || !license.deviceId) return;

        try {
            const data = await apiPost(`${API_BASE}/license/verify`, {
                key: license.key,
                deviceId: license.deviceId,
            });

            if (data.success && data.valid) {
                this.plugin.settings.proLicense.lastVerified = Date.now();
                if (data.licenseType) {
                    this.plugin.settings.proLicense.licenseType = data.licenseType as 'annual' | 'lifetime';
                }
                if (data.expiresAt) {
                    this.plugin.settings.proLicense.expiresAt = (data.expiresAt as number) * 1000;
                }
                await this.plugin.saveSettings();
            } else if (data.success && !data.valid) {
                if (data.status === 'expired') {
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
                await apiPost(`${API_BASE}/license/deactivate`, {
                    key: license.key,
                    deviceId: license.deviceId,
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
    getPurchaseUrl(): string {
        return PURCHASE_URL;
    }

    // =========================================================================
    // Device ID
    // =========================================================================

    getOrCreateDeviceId(): string {
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
        const bytes = new Uint8Array(Math.ceil(length / 2));
        crypto.getRandomValues(bytes);
        return Array.from(bytes)
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join('')
            .slice(0, length);
    }

    private maskKey(key: string): string {
        if (key.length <= 10) return `${key.slice(0, 4)}...`;
        return `${key.slice(0, 6)}...${key.slice(-4)}`;
    }
}
