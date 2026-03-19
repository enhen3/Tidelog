/**
 * OpenAI Provider - Direct OpenAI API integration
 */

import { ChatMessage, StreamCallback } from '../types';
import { BaseAIProvider } from './base-provider';

export class OpenAIProvider extends BaseAIProvider {
    name = 'OpenAI';
    private baseUrl = 'https://api.openai.com/v1';

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
            throw new Error(`OpenAI API error: ${response.status} - ${response.text}`);
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
