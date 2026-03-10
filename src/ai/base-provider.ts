/**
 * Base AI Provider - Abstract base class for all AI providers
 * Separated to avoid circular dependency with provider factory
 */

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
     * Parse SSE stream data
     */
    protected parseSSELine(line: string): string | null {
        if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
                return null;
            }
            try {
                const parsed = JSON.parse(data);
                return parsed.choices?.[0]?.delta?.content || null;
            } catch {
                return null;
            }
        }
        return null;
    }

    /**
     * Process a streaming response
     */
    protected async processStream(
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

            // Keep the last incomplete line in the buffer
            buffer = lines.pop() || '';

            for (const line of lines) {
                const content = this.parseSSELine(line.trim());
                if (content) {
                    fullContent += content;
                    onChunk(content);
                }
            }
        }

        // Process any remaining content in buffer
        if (buffer.trim()) {
            const content = this.parseSSELine(buffer.trim());
            if (content) {
                fullContent += content;
                onChunk(content);
            }
        }

        return fullContent;
    }

    /**
     * Format messages for API request
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
