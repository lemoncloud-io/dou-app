import { initReactI18next } from 'react-i18next';

import i18n from 'i18next';

import { en } from './locales/en';
import { ko } from './locales/ko';

// Inline resources, one module per locale. The full desktop app will adopt the
// shared remote-backed i18n (see apps/web/src/i18n) in a later phase; until then
// `locales/en.ts` is the source of truth for the key set and every other bundle
// is typed against it.
const resources = {
    en: { translation: en },
    ko: { translation: ko },
} as const;

/** Locales with a complete bundle, in the order the picker lists them. */
export const SUPPORTED_LANGUAGES = ['ko', 'en'] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const STORED_LANGUAGE_KEY = 'chatic.language';

const isSupported = (value: string | null | undefined): value is SupportedLanguage =>
    SUPPORTED_LANGUAGES.includes(value as SupportedLanguage);

/**
 * The locale to boot in: an explicit choice first, then the system language.
 * Most of these users read Korean, and the app used to open in English for all
 * of them because English was the only bundle that existed.
 */
const initialLanguage = (): SupportedLanguage => {
    try {
        const stored = localStorage.getItem(STORED_LANGUAGE_KEY);
        if (isSupported(stored)) return stored;
    } catch {
        // Private mode or blocked storage: fall through to the system language.
    }
    const system = typeof navigator === 'undefined' ? '' : navigator.language;
    const base = system.split('-')[0];
    return isSupported(base) ? base : 'en';
};

/** Switch locale and remember it, so the next launch opens the same way. */
export const setLanguage = (language: SupportedLanguage) => {
    void i18n.changeLanguage(language);
    try {
        localStorage.setItem(STORED_LANGUAGE_KEY, language);
    } catch {
        // The choice still applies to this session.
    }
};

// `lang` tells a screen reader which voice to read with, and a static
// `lang="en"` had it read Korean text with an English one.
const syncDocumentLanguage = (language: string) => {
    if (typeof document !== 'undefined') document.documentElement.lang = language;
};
i18n.on('languageChanged', syncDocumentLanguage);

void i18n.use(initReactI18next).init({
    resources,
    lng: initialLanguage(),
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
});

export default i18n;
