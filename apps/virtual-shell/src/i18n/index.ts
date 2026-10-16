import { createContext, useContext } from 'react';

import { en, type MessageKey, type Messages } from './en';
import { ko } from './ko';

export type Language = 'ko' | 'en';

export const LANGUAGES: readonly Language[] = ['ko', 'en'];

/** Each language named in itself, as a language switch shows it. */
export const LANGUAGE_NAMES: Record<Language, string> = { ko: '한국어', en: 'English' };

const PACKS: Record<Language, Messages> = { en, ko };

const STORAGE_KEY = 'virtual-shell.language';

/** A translator: the key's text in the language, with `{name}` slots filled. Unknown slots stay as written. */
export type Translate = (key: MessageKey, values?: Record<string, string>) => string;

export const translator =
    (language: Language): Translate =>
    (key, values) =>
        PACKS[language][key].replace(/\{(\w+)\}/g, (slot, name: string) => values?.[name] ?? slot);

/**
 * The language the page opens in: the one a link asked for (`?lang=` — an environment switch moves to
 * another origin, whose storage has not heard the pick), else the one picked last time on this browser,
 * else the browser's own (Korean for a Korean browser, English for anything else). Storage can be
 * unavailable — a private window, blocked site data — and then the browser's language decides.
 */
export const initialLanguage = (
    storage: Pick<Storage, 'getItem'> | null = safeStorage(),
    browser: string = globalThis.navigator?.language ?? 'en',
    search: string = globalThis.location?.search ?? ''
): Language => {
    const asked = new URLSearchParams(search).get('lang');
    if (asked === 'ko' || asked === 'en') return asked;
    const saved = readSaved(storage);
    if (saved) return saved;
    return browser.toLowerCase().startsWith('ko') ? 'ko' : 'en';
};

/** Remembers the pick for this browser; a storage that refuses is ignored. */
export const saveLanguage = (language: Language, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void => {
    try {
        storage?.setItem(STORAGE_KEY, language);
    } catch {
        // Not remembered — the next visit falls back to the browser's language.
    }
};

const readSaved = (storage: Pick<Storage, 'getItem'> | null): Language | null => {
    try {
        const value = storage?.getItem(STORAGE_KEY);
        return value === 'ko' || value === 'en' ? value : null;
    } catch {
        return null;
    }
};

const safeStorage = (): Storage | null => {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        return null;
    }
};

export const LanguageContext = createContext<{
    language: Language;
    t: Translate;
    setLanguage: (language: Language) => void;
}>({
    language: 'en',
    t: translator('en'),
    setLanguage: () => undefined,
});

export const useI18n = () => useContext(LanguageContext);
