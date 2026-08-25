/**
 * TideLog managed AI provider.
 */

import { requestUrl } from 'obsidian';
import type TideLogPlugin from '../main';
import type { AIFeature, AIProvider, ChatMessage, StreamCallback } from '../types';
import { getLanguage, t } from '../i18n';
import {
    classifyHTTPError,
    classifyNetworkError,
    ErrorCode,
    TideLogError,
} from '../utils/error-formatter';

const API_BASE = 'https://tidelog-api.mydreamchronicle.com';

interface ProxyErrorBody {
    error?: string;
    used?: number;
    limit?: number;
    resets_at?: number;
}

function parseErrorBody(responseText: string): ProxyErrorBody {
    try {
        return JSON.parse(responseText) as ProxyErrorBody;
    } catch {
        return {};
    }
}

function formatResetTime(value: number | undefined): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    const milliseconds = value < 1_000_000_000_000 ? value * 1000 : value;
    return new Date(milliseconds).toLocaleString(getLanguage() === 'en' ? 'en-US' : 'zh-CN');
}

export function classifyTideLogProxyError(status: number, responseText: string): TideLogError {
    const body = parseErrorBody(responseText);

    if (status === 422 && body.error === 'content_blocked') {
        return new TideLogError(ErrorCode.CONTENT_BLOCKED, t('error.aiContentBlocked'));
    }
    if (status === 429 && body.error === 'quota_exceeded') {
        return new TideLogError(
            ErrorCode.QUOTA_EXCEEDED,
            t(
                'error.aiQuotaExceeded',
                body.used ?? '—',
                body.limit ?? '—',
                formatResetTime(body.resets_at),
            ),
        );
    }
    if (status === 403 && body.error === 'feature_not_available') {
        return new TideLogError(ErrorCode.FEATURE_UNAVAILABLE, t('error.aiFeatureUnavailable'));
    }
    if (status === 502 && body.error === 'provider_error') {
        return new TideLogError(ErrorCode.PROVIDER_ERROR, t('error.aiProviderError'));
    }

    return classifyHTTPError(status, responseText, 'TideLog AI');
}

export class TideLogProvider implements AIProvider {
    name = 'TideLog AI';
    private plugin: TideLogPlugin;

    constructor(plugin: TideLogPlugin) {
        this.plugin = plugin;
    }

    async sendMessage(
        messages: ChatMessage[],
        systemPrompt: string,
        onChunk: StreamCallback,
        feature: AIFeature = 'chat',
    ): Promise<string> {
        const requestBody = this.buildRequestBody(messages, systemPrompt, feature);
        const url = `${API_BASE}/ai/generate`;
        const headers = {
            Accept: 'text/event-stream',
            'Content-Type': 'application/json',
        };

        let response: Response | null;
        try {
            response = await window.fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(requestBody),
            }).catch(() => null);
        } catch {
            response = null;
        }

        if (response === null) {
            return this.requestBufferedStream(url, headers, requestBody, onChunk);
        }
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw classifyTideLogProxyError(response.status, text);
        }
        if (!response.body || typeof response.body.getReader !== 'function') {
            return this.requestBufferedStream(url, headers, requestBody, onChunk);
        }

        const streamed = await this.consumeStream(response.body, onChunk);
        return streamed ?? this.requestBufferedStream(url, headers, requestBody, onChunk);
    }

    async testConnection(): Promise<boolean> {
        const license = this.plugin.settings.proLicense;
        const params = new URLSearchParams({ deviceId: this.getDeviceId() });
        const licenseKey = license.key?.trim();
        if (licenseKey) params.set('licenseKey', licenseKey);

        try {
            const response = await requestUrl({
                url: `${API_BASE}/ai/quota?${params.toString()}`,
                method: 'GET',
                throw: false,
            });
            return response.status === 200;
        } catch {
            return false;
        }
    }

    private buildRequestBody(
        messages: ChatMessage[],
        systemPrompt: string,
        feature: AIFeature,
    ): Record<string, unknown> {
        const formattedMessages = [
            ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
            ...messages.map(({ role, content }) => ({ role, content })),
        ];
        const licenseKey = this.plugin.settings.proLicense.key?.trim();

        return {
            feature,
            messages: formattedMessages,
            deviceId: this.getDeviceId(),
            ...(licenseKey ? { licenseKey } : {}),
            stream: true,
        };
    }

    private getDeviceId(): string {
        const existing = this.plugin.settings.proLicense.deviceId?.trim();
        return existing || this.plugin.licenseManager.getOrCreateDeviceId();
    }

    private async requestBufferedStream(
        url: string,
        headers: Record<string, string>,
        requestBody: Record<string, unknown>,
        onChunk: StreamCallback,
    ): Promise<string> {
        try {
            const response = await requestUrl({
                url,
                method: 'POST',
                headers,
                body: JSON.stringify(requestBody),
                throw: false,
            });
            if (response.status >= 400) {
                throw classifyTideLogProxyError(response.status, response.text);
            }
            return this.consumeSSEText(response.text, onChunk);
        } catch (error) {
            if (error instanceof TideLogError) throw error;
            throw classifyNetworkError(error);
        }
    }

    private async consumeStream(
        body: ReadableStream<Uint8Array>,
        onChunk: StreamCallback,
    ): Promise<string | null> {
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let full = '';

        try {
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) full += this.consumeSSELine(line, onChunk);
            }
            buffer += decoder.decode();
            if (buffer.trim()) full += this.consumeSSELine(buffer, onChunk);
            return full.length > 0 ? full : null;
        } catch (error) {
            if (full.length === 0) return null;
            throw classifyNetworkError(error);
        }
    }

    private consumeSSEText(text: string, onChunk: StreamCallback): string {
        let full = '';
        for (const line of text.split('\n')) full += this.consumeSSELine(line, onChunk);
        return full;
    }

    private consumeSSELine(rawLine: string, onChunk: StreamCallback): string {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) return '';
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') return '';

        try {
            const json = JSON.parse(payload) as {
                choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
            };
            const chunk = json.choices?.[0]?.delta?.content
                ?? json.choices?.[0]?.message?.content
                ?? '';
            if (chunk) onChunk(chunk);
            return chunk;
        } catch {
            return '';
        }
    }
}
