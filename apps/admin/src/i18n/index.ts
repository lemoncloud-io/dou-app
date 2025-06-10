import { initReactI18next } from 'react-i18next';

import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-xhr-backend';

import en from './locales/en.json';
import ko from './locales/ko.json';

const resources = {
    en: {
        translation: en,
    },
    ko: {
        translation: ko,
    },
};

i18n.use(Backend)
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources,
        fallbackLng: 'en',
        supportedLngs: ['ko', 'en'],
        interpolation: {
            escapeValue: false,
        },
        debug: process.env.NODE_ENV === 'development',
    });

export default i18n;
