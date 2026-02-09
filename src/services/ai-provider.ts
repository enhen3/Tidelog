/**
 * AI Provider - Factory for AI providers
 */

import { AIFlowSettings, AIProvider } from '../types';
import { OpenRouterProvider } from './openrouter-provider';
import { AnthropicProvider } from './anthropic-provider';
import { GeminiProvider } from './gemini-provider';
import { OpenAIProvider } from './openai-provider';

// Re-export BaseAIProvider for backward compatibility
export { BaseAIProvider } from './base-provider';

/**
 * Create an AI provider based on settings
 */
export function createAIProvider(settings: AIFlowSettings): AIProvider {
    switch (settings.activeProvider) {
        case 'openrouter':
            return new OpenRouterProvider(
                settings.providers.openrouter.apiKey,
                settings.providers.openrouter.model
            );
        case 'anthropic':
            return new AnthropicProvider(
                settings.providers.anthropic.apiKey,
                settings.providers.anthropic.model
            );
        case 'gemini':
            return new GeminiProvider(
                settings.providers.gemini.apiKey,
                settings.providers.gemini.model
            );
        case 'openai':
            return new OpenAIProvider(
                settings.providers.openai.apiKey,
                settings.providers.openai.model
            );
        default:
            return new OpenRouterProvider(
                settings.providers.openrouter.apiKey,
                settings.providers.openrouter.model
            );
    }
}
