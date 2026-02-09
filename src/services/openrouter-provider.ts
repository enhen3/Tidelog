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

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://obsidian.md',
                'X-Title': 'Dailot',
            },
            body: JSON.stringify({
                model: this.model,
                messages: formattedMessages,
                stream: true,
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
        }

        return this.processStream(response, onChunk);
    }

    async testConnection(): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseUrl}/models`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                },
            });
            return response.ok;
        } catch {
            return false;
        }
    }
}
