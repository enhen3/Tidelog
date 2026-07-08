/**
 * Base AI Provider - Abstract base class for all AI providers
 * Separated to avoid circular dependency with provider factory
 */

import { requestUrl } from 'obsidian';
import { AIProvider, ChatMessage, StreamCallback } from '../types';
import { classifyHTTPError, classifyNetworkError, TideLogError } from '../utils/error-formatter';

/**
 * Base class for AI providers with common functionality
 */
export abstract class BaseAIProvider implements AIProvider {
    abstract name: string;
    protected apiKey: string;
    protected model: string;

    constructor(apiKey: string, model: string) {
        this.apiKey = apiKey;
        this.model = model;
    }

    abstract sendMessage(
        messages: ChatMessage[],
        systemPrompt: string,
        onChunk: StreamCallback
    ): Promise<string>;

    abstract testConnection(): Promise<boolean>;

    /**
     * Make an HTTP request using Obsidian's requestUrl (CORS-free, mobile-compatible)
     */
    protected async makeRequest(url: string, options: {
        method?: string;
        headers?: Record<string, string>;
        body?: string;
    }): Promise<{ status: number; text: string; json: unknown }> {
        const response = await requestUrl({
            url,
            method: options.method || 'GET',
            headers: options.headers,
            body: options.body,
            throw: false,
        });
        return {
            status: response.status,
            text: response.text,
            json: response.json,
        };
    }

    /**
     * Send a chat completion to an OpenAI-compatible endpoint.
     *
     * Prefers real SSE streaming: a long generation (e.g. the first-insight
     * report) can run for many minutes, and a single non-streaming request is
     * often dropped by the server/proxy as an idle connection
     * (net::ERR_CONNECTION_CLOSED). Streaming keeps bytes flowing so the
     * connection stays alive — and gives live progress in the UI.
     *
     * If streaming is unavailable (e.g. fetch blocked by CORS on some
     * providers/platforms), it transparently falls back to a single
     * non-streaming request via Obsidian's CORS-free requestUrl.
     */
    protected async sendOpenAICompatible(
        url: string,
        authHeaders: Record<string, string>,
        messages: ChatMessage[],
        systemPrompt: string,
        onChunk: StreamCallback,
    ): Promise<string> {
        const formattedMessages = this.formatMessages(messages, systemPrompt);
        const headers = { ...authHeaders, 'Content-Type': 'application/json' };

        // 1) Try real streaming.
        try {
            const streamed = await this.streamChatCompletion(url, headers, formattedMessages, onChunk);
            if (streamed !== null) return streamed;
        } catch (e) {
            if (e instanceof TideLogError) throw e;
            throw classifyNetworkError(e);
        }

        // 2) Fallback: non-streaming request + simulated typewriter.
        try {
            const response = await this.makeRequest(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({ model: this.model, messages: formattedMessages }),
            });
            if (response.status >= 400) {
                throw classifyHTTPError(response.status, response.text, this.name, this.model);
            }
            const data = response.json as { choices?: Array<{ message?: { content?: string } }> };
            const fullContent = data.choices?.[0]?.message?.content || '';
            return this.simulateStream(fullContent, onChunk);
        } catch (e) {
            if (e instanceof TideLogError) throw e;
            throw classifyNetworkError(e);
        }
    }

    /**
     * Stream an OpenAI-compatible chat completion via fetch (SSE).
     * Returns the full text, or `null` to signal the caller should fall back
     * to a non-streaming request (e.g. when fetch is blocked before any
     * response, or the body cannot be streamed).
     */
    private async streamChatCompletion(
        url: string,
        headers: Record<string, string>,
        formattedMessages: Array<{ role: string; content: string }>,
        onChunk: StreamCallback,
    ): Promise<string | null> {
        // Obsidian normally prefers requestUrl (CORS-free), but it cannot stream
        // a response body. Streaming is required so long generations keep the
        // connection alive; on any fetch failure we fall back to requestUrl.
        const response = await window.fetch(url, {
            method: 'POST',
            headers: { ...headers, Accept: 'text/event-stream' },
            body: JSON.stringify({ model: this.model, messages: formattedMessages, stream: true }),
        }).catch(() => null);

        // fetch rejected before a response (CORS / offline / not permitted).
        if (response === null) return null;

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw classifyHTTPError(response.status, text, this.name, this.model);
        }

        const body = response.body;
        if (!body || typeof body.getReader !== 'function') return null;

        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let full = '';
        const consumeSSELine = (rawLine: string) => {
            const line = rawLine.trim();
            if (!line.startsWith('data:')) return;
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') return;
            try {
                const json = JSON.parse(payload) as {
                    choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
                };
                const delta = json.choices?.[0]?.delta?.content
                    ?? json.choices?.[0]?.message?.content
                    ?? '';
                if (delta) {
                    full += delta;
                    onChunk(delta);
                }
            } catch {
                // keep-alive comment or partial JSON — ignore
            }
        };

        try {
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const rawLine of lines) {
                    consumeSSELine(rawLine);
                }
            }
            buffer += decoder.decode();
            if (buffer.trim()) {
                consumeSSELine(buffer);
            }
        } catch (e) {
            // Mid-stream drop: fall back only if nothing arrived yet; otherwise
            // surface it as a network error so the user can retry.
            if (full.length === 0) return null;
            throw classifyNetworkError(e);
        }

        // Some OpenAI-compatible proxies return HTTP 200 with a stream-shaped
        // body but no parseable chat deltas. Do not surface a blank report;
        // retry through the non-streaming requestUrl path instead.
        return full.length > 0 ? full : null;
    }

    /**
     * Simulate streaming by delivering the full response in small chunks.
     * This provides a typewriter effect in the UI while using non-streaming API calls.
     */
    protected simulateStream(fullContent: string, onChunk: StreamCallback): Promise<string> {
        return new Promise((resolve) => {
            if (!fullContent) {
                resolve('');
                return;
            }

            // Deliver in chunks of ~3-5 characters for a natural typing feel
            const chunkSize = 4;
            let index = 0;

            const deliver = () => {
                if (index < fullContent.length) {
                    const end = Math.min(index + chunkSize, fullContent.length);
                    const chunk = fullContent.substring(index, end);
                    onChunk(chunk);
                    index = end;
                    window.setTimeout(deliver, 10);
                } else {
                    resolve(fullContent);
                }
            };

            deliver();
        });
    }

    /**
     * Format messages for API request (OpenAI-compatible format)
     */
    protected formatMessages(messages: ChatMessage[], systemPrompt: string): Array<{
        role: string;
        content: string;
    }> {
        const formattedMessages: Array<{ role: string; content: string }> = [];

        // Add system prompt
        if (systemPrompt) {
            formattedMessages.push({
                role: 'system',
                content: systemPrompt,
            });
        }

        // Add conversation messages
        for (const message of messages) {
            formattedMessages.push({
                role: message.role,
                content: message.content,
            });
        }

        return formattedMessages;
    }
}
