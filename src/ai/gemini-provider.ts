/**
 * Gemini Provider - Google Gemini API integration
 */

import { ChatMessage, StreamCallback } from '../types';
import { BaseAIProvider } from './base-provider';
import { classifyHTTPError, classifyNetworkError, TideLogError } from '../utils/error-formatter';

export class GeminiProvider extends BaseAIProvider {
    name = 'Google Gemini';
    private baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

    async sendMessage(
        messages: ChatMessage[],
        systemPrompt: string,
        onChunk: StreamCallback
    ): Promise<string> {
        // Gemini uses a different format
        const contents = this.formatGeminiMessages(messages, systemPrompt);

        // Use non-streaming endpoint
        const response = await this.makeRequest(
            `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents,
                    generationConfig: {
                        maxOutputTokens: 4096,
                    },
                }),
            }
        );

        if (response.status >= 400) {
            throw classifyHTTPError(response.status, response.text, this.name, this.model);
        }

        const data = response.json as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const fullContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        return this.simulateStream(fullContent, onChunk);
    }

    /**
     * Format messages for Gemini API
     */
    private formatGeminiMessages(
        messages: ChatMessage[],
        systemPrompt: string
    ): Array<{ role: string; parts: Array<{ text: string }> }> {
        const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

        // Gemini handles system prompt as first user message
        if (systemPrompt) {
            contents.push({
                role: 'user',
                parts: [{ text: `System instruction: ${systemPrompt}` }],
            });
            contents.push({
                role: 'model',
                parts: [{ text: '我明白了，我会按照这些指示进行对话。' }],
            });
        }

        for (const message of messages) {
            contents.push({
                role: message.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: message.content }],
            });
        }

        return contents;
    }

    async testConnection(): Promise<boolean> {
        try {
            const response = await this.makeRequest(
                `${this.baseUrl}/models?key=${this.apiKey}`,
                {}
            );

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
