/**
 * Gemini Provider - Google Gemini API integration
 */

import { ChatMessage, StreamCallback } from '../types';
import { BaseAIProvider } from './base-provider';

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

        const response = await fetch(
            `${this.baseUrl}/models/${this.model}:streamGenerateContent?key=${this.apiKey}&alt=sse`,
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

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Gemini API error: ${response.status} - ${error}`);
        }

        return this.processGeminiStream(response, onChunk);
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

    /**
     * Process Gemini's SSE stream format
     */
    private async processGeminiStream(
        response: Response,
        onChunk: StreamCallback
    ): Promise<string> {
        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let fullContent = '';
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    try {
                        const parsed = JSON.parse(data);
                        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
                        if (text) {
                            fullContent += text;
                            onChunk(text);
                        }
                    } catch {
                        // Ignore parse errors
                    }
                }
            }
        }

        return fullContent;
    }

    async testConnection(): Promise<boolean> {
        try {
            const response = await fetch(
                `${this.baseUrl}/models?key=${this.apiKey}`
            );
            return response.ok;
        } catch {
            return false;
        }
    }
}
