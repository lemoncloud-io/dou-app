import { initReactI18next } from 'react-i18next';

import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import ChainedBackend from 'i18next-chained-backend';
import LocalStorageBackend from 'i18next-localstorage-backend';
import Backend from 'i18next-xhr-backend';

import { logger } from '@chatic/bridges';

// This module runs at IMPORT time (`i18n.use(...).init(...)` below is a top-level call), which
// happens before `main.tsx`'s own body — including its `config.init(...)` — ever executes: ES
// module evaluation runs a file's imports, in order, before the importing file's statements
// (`app.tsx` imports this before `main.tsx` reaches its first line). Routing PROJECT/ENV through
// `@chatic/config` would read it uninitialized. Neither value is a setting anyway — this is a
// localStorage key namespace, a technical detail — so it reads `import.meta.env` directly, the same
// way `apps/web/src/app/utils/buildEnv.ts` already does (ADR-0079 결정 11 retired the single
// `import.meta` holder these used to come through, `@chatic/web-config`).
const PROJECT = (import.meta.env.VITE_PROJECT || '').toLowerCase();
const ENV = (import.meta.env.VITE_ENV || '').toLowerCase();
/** i18next's own localStorage key name — not a setting, just where it keeps the language. */
const LANGUAGE_KEY = 'i18nextLng';

const I18N_VERSION = process.env.I18N_VERSION || 'fallback';
const isDevelopment = process.env.NODE_ENV === 'development';

if (!isDevelopment) {
    const currentPrefix = `i18next_res_${I18N_VERSION}_`;
    const cleanupOldCache = () => {
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('i18next_res_') && !key.startsWith(currentPrefix)) {
                localStorage.removeItem(key);
                logger.info('I18N', `Cleaned up old i18n cache: ${key}`);
            }
        });
    };
    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(cleanupOldCache);
    } else {
        setTimeout(cleanupOldCache, 0);
    }
}

i18n.use(ChainedBackend)
    .use(
        new LanguageDetector(null, {
            lookupLocalStorage: `@${PROJECT}_${ENV}.${LANGUAGE_KEY}`,
        })
    )
    .use(initReactI18next)
    .init({
        fallbackLng: 'en',
        supportedLngs: ['ko', 'en'],
        interpolation: {
            escapeValue: false,
        },
        debug: isDevelopment,
        backend: {
            backends: [LocalStorageBackend, Backend],
            backendOptions: [
                {
                    prefix: `i18next_res_${I18N_VERSION}_`,
                    expirationTime: isDevelopment
                        ? 5 * 60 * 1000 // 개발: 5분
                        : 60 * 60 * 1000, // 프로덕션: 1시간
                    versions: {
                        en: I18N_VERSION,
                        ko: I18N_VERSION,
                    },
                },
                {
                    loadPath: `/locales/{{lng}}/{{ns}}.json${isDevelopment ? '' : `?v=${I18N_VERSION}`}`,
                },
            ],
        },
    });

export default i18n;
