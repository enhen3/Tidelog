/**
 * AI Provider - Factory for AI providers
 */

import { TideLogSettings, AIProvider } from '../types';
import { OpenRouterProvider } from './openrouter-provider';
import { AnthropicProvider } from './anthropic-provider';
import { GeminiProvider } from './gemini-provider';
import { OpenAIProvider } from './openai-provider';
import { CustomProvider } from './custom-provider';

// Re-export BaseAIProvider for backward compatibility
export { BaseAIProvider } from './base-provider';

/**
 * Create an AI provider based on settings
 */
export function createAIProvider(settings: TideLogSettings): AIProvider {
    const provider = settings.activeProvider;
    const config = settings.providers[provider];

    switch (provider) {
        case 'openrouter':
            return new OpenRouterProvider(config.apiKey, config.model);
        case 'anthropic':
            return new AnthropicProvider(config.apiKey, config.model);
        case 'gemini':
            return new GeminiProvider(config.apiKey, config.model);
        case 'openai':
            return new OpenAIProvider(config.apiKey, config.model);
        case 'custom':
            return new CustomProvider(
                config.apiKey,
                config.model,
                config.baseUrl || 'https://api.deepseek.com/v1'
            );
        default:
            return new OpenRouterProvider(
                settings.providers.openrouter.apiKey,
                settings.providers.openrouter.model
            );
    }
}
