/**
 * Anthropic Provider - Direct Claude API integration
 */

import { ChatMessage, StreamCallback } from '../types';
import { BaseAIProvider } from './base-provider';
import { classifyHTTPError, classifyNetworkError, TideLogError } from '../utils/error-formatter';

export class AnthropicProvider extends BaseAIProvider {
    name = 'Anthropic Claude';
    private baseUrl = 'https://api.anthropic.com/v1';

    async sendMessage(
        messages: ChatMessage[],
        systemPrompt: string,
        onChunk: StreamCallback
    ): Promise<string> {
        // Anthropic uses a different format - system is separate
        const anthropicMessages = messages.map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
        }));

        const response = await this.makeRequest(`${this.baseUrl}/messages`, {
            method: 'POST',
            headers: {
                'x-api-key': this.apiKey,
                'Content-Type': 'application/json',
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: this.model,
                max_tokens: 4096,
                system: systemPrompt,
                messages: anthropicMessages,
            }),
        });

        if (response.status >= 400) {
            throw classifyHTTPError(response.status, response.text, this.name, this.model);
        }

        // Extract content from Anthropic response format
        const data = response.json as { content?: Array<{ type: string; text: string }> };
        const fullContent = data.content
            ?.filter((block: { type: string }) => block.type === 'text')
            .map((block: { text: string }) => block.text)
            .join('') || '';

        return this.simulateStream(fullContent, onChunk);
    }

    async testConnection(): Promise<boolean> {
        try {
            const response = await this.makeRequest(`${this.baseUrl}/messages`, {
                method: 'POST',
                headers: {
                    'x-api-key': this.apiKey,
                    'Content-Type': 'application/json',
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                    model: this.model,
                    max_tokens: 10,
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
