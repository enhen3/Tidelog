/**
 * AI Provider - Factory for AI providers
 */

import type TideLogPlugin from '../main';
import { AIProvider } from '../types';
import { TideLogProvider } from './tidelog-provider';

// Re-export BaseAIProvider for backward compatibility

/**
 * Create the TideLog managed AI provider.
 */
export function createAIProvider(plugin: TideLogPlugin): AIProvider {
    return new TideLogProvider(plugin);
}
