/**
 * Internationalization module
 * Usage:
 *   import { t, setLanguage } from '../i18n';
 *   setLanguage('en');
 *   t('chat.welcomeTitle')             // => "👋 Hi, I'm Flow"
 *   t('kanban.completed', '3', '5')    // => "3/5 done"
 */

import { zh } from './zh';
import { en } from './en';

export type Language = 'zh' | 'en';

const dictionaries: Record<Language, Record<string, string>> = { zh, en };

let currentLang: Language = 'zh';

/**
 * Set the active language. Call this when the plugin loads and
 * whenever the user changes the language setting.
 */
export function setLanguage(lang: Language): void {
    currentLang = lang;
}

/**
 * Get the current language.
 */
export function getLanguage(): Language {
    return currentLang;
}

/**
 * Translate a key, optionally replacing {0}, {1}, … placeholders.
 * Falls back to Chinese if the key is missing from the active dictionary,
 * then to the raw key if missing everywhere.
 */
export function t(key: string, ...args: (string | number)[]): string {
    let text = dictionaries[currentLang]?.[key]
        ?? dictionaries['zh']?.[key]
        ?? key;

    // Replace positional placeholders {0}, {1}, …
    for (let i = 0; i < args.length; i++) {
        text = text.replace(`{${i}}`, String(args[i]));
    }
    // Also replace {provider} style named placeholders
    // (they will be passed as the first arg)
    if (args.length > 0) {
        text = text.replace('{provider}', String(args[0]));
    }

    return text;
}
