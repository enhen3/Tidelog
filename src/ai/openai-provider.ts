/**
 * OpenAI Provider - Direct OpenAI API integration
 */

import { ChatMessage, StreamCallback } from '../types';
import { BaseAIProvider } from './base-provider';
import { classifyHTTPError, classifyNetworkError, TideLogError } from '../utils/error-formatter';

export class OpenAIProvider extends BaseAIProvider {
    name = 'OpenAI';
    private baseUrl = 'https://api.openai.com/v1';

    async sendMessage(
        messages: ChatMessage[],
        systemPrompt: string,
        onChunk: StreamCallback
    ): Promise<string> {
        return this.sendOpenAICompatible(
            `${this.baseUrl}/chat/completions`,
            { 'Authorization': `Bearer ${this.apiKey}` },
            messages,
            systemPrompt,
            onChunk,
        );
    }

    async testConnection(): Promise<boolean> {
        try {
            const response = await this.makeRequest(`${this.baseUrl}/models`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                },
            });

            if (response.status >= 200 && response.status < 300) {
                return true;
            }

            throw classifyHTTPError(response.status, response.text, this.name);
        } catch (e) {
            if (e instanceof TideLogError) throw e;
            throw classifyNetworkError(e);
        }
    }
}
