/**
 * Telemetry — anonymous, opt-out usage events.
 *
 * Privacy guarantees (documented to the user in settings):
 *   - We send: a random anonymous ID, event name, and a small JSON properties bag.
 *   - We never send: journal content, AI prompts/responses, API keys, vault name,
 *     IP address (Cloudflare worker doesn't store it), or anything identifying.
 *   - Disable: settings → Privacy → Anonymous usage data.
 *
 * Reliability:
 *   - All sends are fire-and-forget. Failures are swallowed silently.
 *   - We don't retry — telemetry is best-effort and must NEVER block UX.
 *   - We don't batch (keep the worker dead-simple). Volume is low enough.
 *   - We use Obsidian's requestUrl so the call works on mobile and through
 *     system proxies/VPNs without CORS hassles.
 */

import { requestUrl } from 'obsidian';
import TideLogPlugin from '../main';

const TELEMETRY_ENDPOINT = 'https://tidelog-api.mydreamchronicle.com/events';

export interface TelemetryProperties {
    [key: string]: string | number | boolean | undefined;
}

export class Telemetry {
    private plugin: TideLogPlugin;

    constructor(plugin: TideLogPlugin) {
        this.plugin = plugin;
    }

    /**
     * Send an event. Fire-and-forget — never throws, never blocks the caller.
     */
    track(event: string, properties: TelemetryProperties = {}): void {
        if (this.plugin.settings.telemetryEnabled === false) return;

        const anonId = this.getAnonymousId();
        const payload = {
            anonymousId: anonId,
            event,
            properties: {
                ...properties,
                pluginVersion: this.plugin.manifest.version,
                isPro: this.plugin.licenseManager.isPro(),
                language: this.plugin.settings.language,
            },
            timestamp: Date.now(),
        };

        // Detached promise — the caller does not await us.
        void requestUrl({
            url: TELEMETRY_ENDPOINT,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            throw: false,
        }).catch(() => { /* swallow — telemetry is best-effort */ });
    }

    /**
     * Generate or retrieve a stable anonymous ID.
     * The ID is salted random — NOT derived from vault name or anything
     * that could later identify the user.
     */
    private getAnonymousId(): string {
        const existing = this.plugin.settings.telemetryAnonymousId;
        if (existing) return existing;

        // 16 hex chars of randomness; not tied to any PII.
        const chars = '0123456789abcdef';
        let id = 'anon-';
        for (let i = 0; i < 16; i++) {
            id += chars[Math.floor(Math.random() * chars.length)];
        }
        this.plugin.settings.telemetryAnonymousId = id;
        void this.plugin.saveSettings();
        return id;
    }
}
