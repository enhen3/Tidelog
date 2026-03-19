/**
 * OpenRouter Provider - Primary AI provider with unified API
 */

import { ChatMessage, StreamCallback } from '../types';
import { BaseAIProvider } from './base-provider';

export class OpenRouterProvider extends BaseAIProvider {
    name = 'OpenRouter';
    private baseUrl = 'https://openrouter.ai/api/v1';

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
                'HTTP-Referer': 'https://obsidian.md',
                'X-Title': 'TideLog',
            },
            body: JSON.stringify({
                model: this.model,
                messages: formattedMessages,
            }),
        });

        if (response.status >= 400) {
            throw new Error(`OpenRouter API error: ${response.status} - ${response.text}`);
        }

        const data = response.json as { choices?: Array<{ message?: { content?: string } }> };
        const fullContent = data.choices?.[0]?.message?.content || '';

        return this.simulateStream(fullContent, onChunk);
    }

    async testConnection(): Promise<boolean> {
        try {
            const response = await this.makeRequest(`${this.baseUrl}/models`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                },
            });
            return response.status >= 200 && response.status < 300;
        } catch {
            return false;
        }
    }
}
