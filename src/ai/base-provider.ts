/**
 * Base AI Provider - Abstract base class for all AI providers
 * Separated to avoid circular dependency with provider factory
 */

import { requestUrl } from 'obsidian';
import { AIProvider, ChatMessage, StreamCallback } from '../types';

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
                    setTimeout(deliver, 10);
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
