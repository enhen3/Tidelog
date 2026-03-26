/**
 * Settings Migration — Versioned migration system for TideLog settings
 *
 * When models are deprecated or settings schema changes, add a new entry
 * to the MIGRATIONS array. Each migration runs exactly once per user.
 */

import { TideLogSettings } from './types';

interface Migration {
    version: number;
    description: string;
    migrate: (settings: TideLogSettings) => void;
}

/**
 * Add new migrations at the end of this array with an incrementing version.
 * Each migrate() function mutates the settings object in place.
 */
const MIGRATIONS: Migration[] = [
    {
        version: 1,
        description: 'Replace deprecated deepseek-ai/DeepSeek-V3 with DeepSeek-V3.2 on SiliconFlow',
        migrate(settings) {
            const sf = settings.providers.siliconflow;
            if (sf && sf.model === 'deepseek-ai/DeepSeek-V3') {
                sf.model = 'deepseek-ai/DeepSeek-V3.2';
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
            console.log(`[TideLog] Running migration v${m.version}: ${m.description}`);
            m.migrate(settings);
        }
    }

    settings.settingsVersion = CURRENT_SETTINGS_VERSION;
    return true;
}
