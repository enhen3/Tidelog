/**
 * Settings Migration — Versioned migration system for TideLog settings
 *
 * When models are deprecated or settings schema changes, add a new entry
 * to the MIGRATIONS array. Each migration runs exactly once per user.
 */

import { TideLogSettings } from './types';

interface Migration {
    version: number;
    migrate: (settings: TideLogSettings) => void;
}

/**
 * Add new migrations at the end of this array with an incrementing version.
 * Each migrate() function mutates the settings object in place.
 */
const MIGRATIONS: Migration[] = [
    {
        version: 1,
        migrate(settings) {
            const sf = settings.providers.siliconflow;
            if (sf && sf.model === 'deepseek-ai/DeepSeek-V3') {
                sf.model = 'deepseek-ai/DeepSeek-V3.2';
            }
        },
    },
    {
        version: 2,
        migrate(settings) {
            const sf = settings.providers.siliconflow;
            if (sf && sf.model === 'deepseek-ai/DeepSeek-V3.2-Exp') {
                sf.model = 'deepseek-ai/DeepSeek-V3.2';
            }

            const updateInactiveProviderDefault = (
                provider: keyof TideLogSettings['providers'],
                from: string,
                to: string,
            ) => {
                const config = settings.providers[provider];
                if (settings.activeProvider !== provider && config?.model === from) {
                    config.model = to;
                }
            };

            updateInactiveProviderDefault('openrouter', 'anthropic/claude-sonnet-4', 'anthropic/claude-sonnet-4.6');
            updateInactiveProviderDefault('anthropic', 'claude-sonnet-4-20250514', 'claude-sonnet-4-6');
            updateInactiveProviderDefault('gemini', 'gemini-2.0-flash', 'gemini-2.5-flash');
            updateInactiveProviderDefault('openai', 'gpt-4o', 'gpt-5.4-mini');
        },
    },
    {
        version: 3,
        migrate(settings) {
            const sf = settings.providers.siliconflow;
            if (sf && !sf.baseUrl) {
                sf.baseUrl = 'https://api.siliconflow.cn/v1';
            }

            const custom = settings.providers.custom;
            if (
                custom &&
                settings.activeProvider !== 'custom' &&
                (!custom.baseUrl || custom.baseUrl === 'https://api.deepseek.com/v1')
            ) {
                custom.baseUrl = 'https://api.siliconflow.cn/v1';
            }
        },
    },
];

/** Current schema version — always equals the last migration's version */
export const CURRENT_SETTINGS_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

/**
 * Run any pending migrations on the settings object.
 * @returns true if any migrations were applied (caller should save)
 */
export function migrateSettings(settings: TideLogSettings): boolean {
    const from = settings.settingsVersion ?? 0;

    if (from >= CURRENT_SETTINGS_VERSION) {
        return false;
    }

    for (const m of MIGRATIONS) {
        if (m.version > from) {
            m.migrate(settings);
        }
    }

    settings.settingsVersion = CURRENT_SETTINGS_VERSION;
    return true;
}
