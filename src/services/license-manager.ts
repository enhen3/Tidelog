/**
 * License Manager - Online license verification via Cloudflare Worker API
 * v2: Monthly/annual types + legacy lifetime support + multi-device (3 per key) + offline grace period
 */

import { requestUrl } from 'obsidian';
import type TideLogPlugin from '../main';

/** API base URL */
const API_BASE = 'https://tidelog-api.mydreamchronicle.com';

/** Offline grace period: 7 days in milliseconds */
const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Afdian does not expose a documented merchant checkout return URL. Its
 * `origin_path` login parameter is not reliable when an existing cookie signs
 * the buyer in automatically, so keep the canonical item URL as the source of
 * truth and let the UI provide an explicit one-click retry after login.
 */
const PURCHASE_URL = 'https://afdian.com/item/463307362c2f11f1b39d52540025c377';

/** Max retry attempts for API calls */
const MAX_RETRIES = 2;

/** 同一 Obsidian 安装下的所有 vault 共用身份，避免“新建 vault = 新试用”。 */
const DURABLE_DEVICE_STORAGE_KEY = 'tidelog-device-id:v1';

type TrialServerState = 'eligible' | 'active' | 'expired';

interface TrialServerSnapshot {
    state: TrialServerState;
    started_at: number | null;
    expires_at: number | null;
    newly_started?: boolean;
    success?: boolean;
    error?: string;
}

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
    private deviceIdSavePromise: Promise<void> | null = null;

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

        // Every non-lifetime license expires.
        if (license.licenseType !== 'lifetime') {
            if (!license.expiresAt || Date.now() > license.expiresAt) return false;
        }

        // A license without a successful server verification has no offline grace.
        if (!license.lastVerified) return false;
        const elapsed = Date.now() - license.lastVerified;
        if (elapsed > GRACE_PERIOD_MS) return false;

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

        try {
            const data = await this.requestTrialStart();
            await this.applyTrialServerSnapshot(data);
            return data.success === true && data.state === 'active';
        } catch (error) {
            console.warn('TideLog trial start request failed:', error);
            return false;
        }
    }

    /**
     * 启动时把服务端状态同步回本地缓存。
     *
     * 1.1.49 的试用只有本地时间；若服务端尚无记录，会把原窗口一次性迁入，
     * 保留原到期日，不额外赠送或重开 7 天。
     */
    async syncTrialState(): Promise<boolean> {
        try {
            const deviceId = await this.getPersistedDeviceId();
            const response = await requestUrl({
                url: `${API_BASE}/trial/status?${new URLSearchParams({ deviceId }).toString()}`,
                method: 'GET',
                throw: false,
            });
            if (response.status !== 200 || !this.isTrialServerSnapshot(response.json)) return false;

            if (response.json.state === 'eligible') {
                const { startedAt, expiresAt } = this.plugin.settings.trial;
                if (startedAt && expiresAt) {
                    const migrated = await this.requestTrialStart({ startedAt, expiresAt });
                    return this.applyTrialServerSnapshot(migrated);
                }
            }
            return this.applyTrialServerSnapshot(response.json);
        } catch (error) {
            // 同步失败不清空本地缓存；离线时仍按最后一次服务端时间自然到期。
            console.warn('TideLog trial status sync failed:', error);
            return false;
        }
    }

    /** Pro 弹窗可复用 quota 响应里的权威试用快照。 */
    async applyTrialServerSnapshot(value: unknown): Promise<boolean> {
        if (!this.isTrialServerSnapshot(value)) return false;
        if (value.state === 'eligible') return false;
        if (typeof value.started_at !== 'number' || typeof value.expires_at !== 'number') return false;

        const startedAt = value.started_at * 1000;
        const expiresAt = value.expires_at * 1000;
        if (!Number.isFinite(startedAt) || !Number.isFinite(expiresAt) || expiresAt <= startedAt) return false;

        const current = this.plugin.settings.trial;
        if (current.startedAt === startedAt && current.expiresAt === expiresAt) return false;
        this.plugin.settings.trial = { ...current, startedAt, expiresAt };
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

    private async requestTrialStart(
        legacy?: { startedAt: number; expiresAt: number },
    ): Promise<TrialServerSnapshot> {
        const body: Record<string, unknown> = { deviceId: await this.getPersistedDeviceId() };
        if (legacy) {
            body.legacyStartedAt = Math.floor(legacy.startedAt / 1000);
            body.legacyExpiresAt = Math.floor(legacy.expiresAt / 1000);
        }
        const data = await apiPost(`${API_BASE}/trial/start`, body);
        if (!this.isTrialServerSnapshot(data)) throw new Error('Invalid trial response');
        return data;
    }

    private isTrialServerSnapshot(value: unknown): value is TrialServerSnapshot {
        if (!value || typeof value !== 'object') return false;
        const candidate = value as Partial<TrialServerSnapshot>;
        if (candidate.state !== 'eligible' && candidate.state !== 'active' && candidate.state !== 'expired') {
            return false;
        }
        const nullableNumber = (item: unknown) => item === null || typeof item === 'number';
        return nullableNumber(candidate.started_at) && nullableNumber(candidate.expires_at);
    }

    /**
     * Get the license type label
     */
    getLicenseLabel(): string {
        const license = this.plugin.settings.proLicense;
        if (!license.activated) return 'Free';
        if (license.licenseType === 'monthly') return 'Pro 月度版';
        if (license.licenseType === 'annual') return 'Pro 年度版';
        return 'Pro 终身版';
    }

    /**
     * Get expiry date string (for every expiring license)
     */
    getExpiryDate(): string | null {
        const license = this.plugin.settings.proLicense;
        if (license.licenseType === 'lifetime' || !license.expiresAt) return null;
        return new Date(license.expiresAt).toLocaleDateString('zh-CN');
    }

    /**
     * Activate a license key online
     */
    async activate(key: string): Promise<{ success: boolean; message: string }> {
        const trimmed = key.trim().toUpperCase();
        if (!trimmed) return { success: false, message: '请输入激活码' };

        // 先等设备身份真正写入本地，再把它绑定到 License。否则 Obsidian 在
        // saveSettings 尚未完成时退出，会让下一次启动生成新设备并白占一个名额。
        const deviceId = await this.getPersistedDeviceId();

        try {
            const data = await apiPost(`${API_BASE}/license/activate`, { key: trimmed, deviceId });

            if (data.success) {
                this.plugin.settings.proLicense = {
                    key: trimmed,
                    activated: true,
                    activatedAt: Date.now(),
                    deviceId,
                    lastVerified: Date.now(),
                    licenseType: (data.licenseType as 'monthly' | 'annual' | 'lifetime') || 'lifetime',
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
                    this.plugin.settings.proLicense.licenseType = data.licenseType as 'monthly' | 'annual' | 'lifetime';
                }
                if (data.expiresAt) {
                    this.plugin.settings.proLicense.expiresAt = (data.expiresAt as number) * 1000;
                }
                await this.plugin.saveSettings();
            } else if (data.valid === false) {
                // 网络失败才享有离线宽限；服务端已经明确判定过期、吊销、解绑或无效时，
                // 继续保留本地 Pro 会把“宽限”变成绕过撤销的 7 天后门。
                this.plugin.settings.proLicense.activated = false;
                await this.plugin.saveSettings();
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
        const durable = this.readDurableDeviceId();
        const existing = this.plugin.settings.proLicense.deviceId?.trim();
        if (existing && this.isValidDeviceId(existing)) {
            // 升级用户可能在不同 vault 已经绑定了不同设备 ID。现有绑定优先，
            // 但只有首个打开的旧 vault 可以播种全局身份，之后不能相互覆盖。
            if (!durable) this.storeDurableDeviceId(existing);
            return existing;
        }

        if (durable) {
            this.plugin.settings.proLicense.deviceId = durable;
            this.queueDeviceIdSave();
            return durable;
        }

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
        this.storeDurableDeviceId(deviceId);
        this.queueDeviceIdSave();
        return deviceId;
    }

    private queueDeviceIdSave(): void {
        const save = this.plugin.saveSettings();
        this.deviceIdSavePromise = save;
        const clearPending = () => {
            if (this.deviceIdSavePromise === save) this.deviceIdSavePromise = null;
        };
        void save.then(clearPending, clearPending);
    }

    private async getPersistedDeviceId(): Promise<string> {
        const deviceId = this.getOrCreateDeviceId();
        if (this.deviceIdSavePromise) await this.deviceIdSavePromise;
        return deviceId;
    }

    private readDurableDeviceId(): string | null {
        try {
            const value = window.localStorage?.getItem(DURABLE_DEVICE_STORAGE_KEY)?.trim();
            return value && this.isValidDeviceId(value) ? value : null;
        } catch {
            return null;
        }
    }

    private storeDurableDeviceId(deviceId: string): void {
        try {
            window.localStorage?.setItem(DURABLE_DEVICE_STORAGE_KEY, deviceId);
        } catch {
            // localStorage 可能被系统策略禁用；data.json 仍是主存储。
        }
    }

    private isValidDeviceId(value: string): boolean {
        return /^dev-[a-z0-9]+-[a-f0-9]{8}$/.test(value) && value.length <= 128;
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
