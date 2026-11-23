import { initReactI18next } from 'react-i18next';

import i18n from 'i18next';

import { en } from './locales/en';
import { emojiNames as emojiEn } from './locales/emoji/en';
import { emojiNames as emojiKo } from './locales/emoji/ko';
import { ko } from './locales/ko';
import { deviceStore } from './app/storage';

const resources = {
    en: { translation: en, emoji: emojiEn },
    ko: { translation: ko, emoji: emojiKo },
} as const;

export const SUPPORTED_LANGUAGES = ['ko', 'en'] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = { ko: '한국어', en: 'English' };

const STORED_LANGUAGE_KEY = 'chatic.language';

const isSupported = (value: string | null | undefined): value is SupportedLanguage =>
    SUPPORTED_LANGUAGES.includes(value as SupportedLanguage);

const initialLanguage = (): SupportedLanguage => {
    const stored = deviceStore.get(STORED_LANGUAGE_KEY);
    if (isSupported(stored)) return stored;
    const system = typeof navigator === 'undefined' ? '' : navigator.language;
    const base = system.split('-')[0];
    return isSupported(base) ? base : 'en';
};

export const setLanguage = (language: SupportedLanguage) => {
    void i18n.changeLanguage(language);
    deviceStore.set(STORED_LANGUAGE_KEY, language);
};

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
