import { initReactI18next } from 'react-i18next';

import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import ko from './locales/ko.json';

// `lang` tells a screen reader which voice to read with, and index.html ships a single static
// `lang="en"` for the crawlers that never run JS, so without this the document keeps claiming
// English while a Korean reader is looking at Korean. Registered before init so the initial
// resolution emits it too.
const syncDocumentLanguage = (language: string) => {
    if (typeof document !== 'undefined') document.documentElement.lang = language;
};

i18n.on('languageChanged', syncDocumentLanguage);

i18n.use(LanguageDetector)
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
            // `htmlTag` is deliberately absent. It reads the very `lang` attribute this file
            // writes, and i18next prefers an exactly-supported code over stripping a region — so
            // with it in the list, index.html's static `lang` decided the reader's language:
            // `lang="ko"` served Korean to every browser that reports only a regional code, en-US
            // and ja-JP included. Detection now rests on what the browser actually asked for.
            order: ['localStorage', 'navigator'],
            caches: ['localStorage'],
            lookupLocalStorage: '@landing.language',
        },
    });

export default i18n;
