import i18next from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';

import { deviceStore } from '../storage';

import { NAMESPACES, resources, type Namespace } from './locales';

export const LANGUAGES = ['ko', 'en'] as const;

export type Language = (typeof LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = 'ko';

export const LANGUAGE_STORAGE_KEY = 'admin-v2.language';

export const LOCALE_OF: Record<Language, string> = { ko: 'ko-KR', en: 'en-US' };

const isLanguage = (value: unknown): value is Language => (LANGUAGES as readonly unknown[]).includes(value);

const readStoredLanguage = (): Language => {
    const stored = deviceStore.get(LANGUAGE_STORAGE_KEY);
    return isLanguage(stored) ? stored : DEFAULT_LANGUAGE;
};

export const i18n = i18next.createInstance();

void i18n.use(initReactI18next).init({
    resources,
    lng: readStoredLanguage(),
    fallbackLng: DEFAULT_LANGUAGE,
    ns: [...NAMESPACES],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    initAsync: false,
    react: { useSuspense: false },
});

if (typeof document !== 'undefined') document.documentElement.lang = i18n.language;

export const setLanguage = (language: Language): void => {
    void i18n.changeLanguage(language);
    deviceStore.set(LANGUAGE_STORAGE_KEY, language);
    if (typeof document !== 'undefined') document.documentElement.lang = language;
};

export const currentLanguage = (): Language => (isLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE);

export const useT = (ns: Namespace | Namespace[] = 'common') => {
    const { t, i18n: instance } = useTranslation(ns, { i18n });
    const lng: Language = isLanguage(instance.language) ? instance.language : DEFAULT_LANGUAGE;
    return { t, lng };
};

export type { Namespace };
