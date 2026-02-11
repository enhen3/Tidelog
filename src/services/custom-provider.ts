/**
 * Custom Provider - OpenAI-compatible API integration
 * Supports DeepSeek, SiliconFlow, Groq, Ollama, and any OpenAI-compatible endpoint
 */

import { ChatMessage, StreamCallback } from '../types';
import { BaseAIProvider } from './base-provider';

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

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: this.model,
                messages: formattedMessages,
                stream: true,
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`API error: ${response.status} - ${error}`);
        }

        return this.processStream(response, onChunk);
    }

    async testConnection(): Promise<boolean> {
        try {
            // Send a minimal request to verify API key + model
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
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
            return response.ok;
        } catch {
            return false;
        }
    }
}
