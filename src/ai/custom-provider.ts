/**
 * Custom Provider - OpenAI-compatible API integration
 * Supports DeepSeek, SiliconFlow, Groq, Ollama, and any OpenAI-compatible endpoint
 */

import { ChatMessage, StreamCallback } from '../types';
import { BaseAIProvider } from './base-provider';
import { classifyHTTPError, classifyNetworkError, TideLogError } from '../utils/error-formatter';

export class CustomProvider extends BaseAIProvider {
    name = 'Custom';
    private baseUrl: string;

    constructor(apiKey: string, model: string, baseUrl: string) {
        super(apiKey, model);
        // Normalize: remove trailing slash
        this.baseUrl = baseUrl.replace(/\/+$/, '');
    }

    async sendMessage(
        messages: ChatMessage[],
        systemPrompt: string,
        onChunk: StreamCallback
    ): Promise<string> {
        const formattedMessages = this.formatMessages(messages, systemPrompt);

        const response = await this.makeRequest(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: this.model,
                messages: formattedMessages,
            }),
        });

        if (response.status >= 400) {
            throw classifyHTTPError(response.status, response.text, this.name, this.model);
        }

        const data = response.json as { choices?: Array<{ message?: { content?: string } }> };
        const fullContent = data.choices?.[0]?.message?.content || '';

        return this.simulateStream(fullContent, onChunk);
    }

    async testConnection(): Promise<boolean> {
        try {
            const response = await this.makeRequest(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this.model,
                    max_tokens: 1,
                    messages: [{ role: 'user', content: 'Hi' }],
                }),
            });

            if (response.status >= 200 && response.status < 300) {
                return true;
            }

            throw classifyHTTPError(response.status, response.text, this.name, this.model);
        } catch (e) {
            if (e instanceof TideLogError) throw e;
            throw classifyNetworkError(e);
        }
    }
}
