import { initReactI18next } from 'react-i18next';

import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import { deviceStore } from '../app/storage';

import en from './locales/en.json';
import ko from './locales/ko.json';

const syncDocumentLanguage = (language: string) => {
    if (typeof document !== 'undefined') document.documentElement.lang = language;
};

i18n.on('languageChanged', syncDocumentLanguage);

const LANGUAGE_KEY = '@landing.language';
const languageDetector = new LanguageDetector();
languageDetector.addDetector({
    name: 'deviceStore',
    lookup: () => deviceStore.get(LANGUAGE_KEY) ?? undefined,
    cacheUserLanguage: (language: string) => deviceStore.set(LANGUAGE_KEY, language),
});

i18n.use(languageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            en: { translation: en },
            ko: { translation: ko },
        },
        fallbackLng: 'en',
        supportedLngs: ['ko', 'en'],
        interpolation: {
            escapeValue: false,
        },
        detection: {
            order: ['deviceStore', 'navigator'],
            caches: ['deviceStore'],
        },
    });

export default i18n;
