import { en, ko } from './locales';

import type { TranslationKey } from './types';

const translations: Record<string, typeof en> = { en, ko };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/**
 * Get all translations for a given language
 */
export const getTranslations = (lang: string): typeof en => {
    return translations[lang] ?? translations.en;
};

/**
 * Get translated string for the given key
 * @param key - Translation key in dot notation (e.g., 'app.exitDialog.title')
 * @param lang - Language code (e.g., 'en', 'ko')
 */
export const t = (key: TranslationKey, lang: string): string => {
    const locale = translations[lang] ?? translations.en;

    const keys = key.split('.');
    let value: unknown = locale;

    for (const k of keys) {
        if (!isRecord(value)) {
            return key;
        }
        value = value[k];
    }

    return typeof value === 'string' ? value : key;
};
