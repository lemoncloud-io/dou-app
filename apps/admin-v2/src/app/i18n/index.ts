/**
 * `i18n/index.ts`
 * - The console's two languages, Korean and English, and the viewer's choice between them.
 *
 * Korean is the default whatever the browser says: the people who read this console day to day
 * — planning, operations, support — work in Korean, and a browser left on English is not a
 * request for an English console. The choice is the viewer's own, so it lives in this browser's
 * storage and never in the URL: a shared link carries the screen, not the sender's language.
 *
 * Its own `i18next` instance rather than the global one. `apps/web` initialises the global
 * instance with an HTTP backend and a language detector; none of that belongs here, and an
 * instance of our own keeps this console's resources and language out of anything else that
 * imports `i18next`. Resources are bundled, so `t()` is ready on the first render and tests need
 * no setup beyond importing this module.
 */
import i18next from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';

import { NAMESPACES, resources, type Namespace } from './locales';

export const LANGUAGES = ['ko', 'en'] as const;

export type Language = (typeof LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = 'ko';

/** Browser storage key for the viewer's choice. */
export const LANGUAGE_STORAGE_KEY = 'admin-v2.language';

/** BCP 47 tags for `Intl`, so dates and numbers follow the chosen language. */
export const LOCALE_OF: Record<Language, string> = { ko: 'ko-KR', en: 'en-US' };

const isLanguage = (value: unknown): value is Language => (LANGUAGES as readonly unknown[]).includes(value);

/** Storage can throw (private mode, blocked site data), and the console must still render. */
const readStoredLanguage = (): Language => {
    try {
        const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
        return isLanguage(stored) ? stored : DEFAULT_LANGUAGE;
    } catch {
        return DEFAULT_LANGUAGE;
    }
};

export const i18n = i18next.createInstance();

void i18n.use(initReactI18next).init({
    resources,
    lng: readStoredLanguage(),
    fallbackLng: DEFAULT_LANGUAGE,
    ns: [...NAMESPACES],
    defaultNS: 'common',
    // React escapes on render; escaping here as well would show `&amp;` in the copy.
    interpolation: { escapeValue: false },
    // Bundled resources: initialise synchronously so the first render already has its words.
    initAsync: false,
    react: { useSuspense: false },
});

if (typeof document !== 'undefined') document.documentElement.lang = i18n.language;

/** Switch language and remember it for this browser. */
export const setLanguage = (language: Language): void => {
    void i18n.changeLanguage(language);
    try {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
        // Not remembered, but still switched for this visit.
    }
    if (typeof document !== 'undefined') document.documentElement.lang = language;
};

/** The current language, narrowed to the two this console has. */
export const currentLanguage = (): Language => (isLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE);

/**
 * `useTranslation` bound to this console's instance, plus the language as a narrowed value for
 * the formatters. Components re-render when the language changes.
 */
export const useT = (ns: Namespace | Namespace[] = 'common') => {
    const { t, i18n: instance } = useTranslation(ns, { i18n });
    const lng: Language = isLanguage(instance.language) ? instance.language : DEFAULT_LANGUAGE;
    return { t, lng };
};

export type { Namespace };
