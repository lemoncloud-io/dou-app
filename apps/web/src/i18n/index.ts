import { initReactI18next } from 'react-i18next';

import i18n from 'i18next';
import ChainedBackend from 'i18next-chained-backend';
import LocalStorageBackend from 'i18next-localstorage-backend';
import Backend from 'i18next-xhr-backend';

import { logger } from '@chatic/bridges';

import {
    FALLBACK_LANGUAGE,
    SUPPORTED_LANGUAGES,
    deviceLanguageCandidates,
    readShellConfigBag,
    readStoredLanguagePreference,
    resolveLanguage,
} from './languagePreference';

// This module runs at IMPORT time (`i18n.use(...).init(...)` below is a top-level call), which
// happens before `main.tsx`'s own body — including its `config.init(...)` — ever executes: ES
// module evaluation runs a file's imports, in order, before the importing file's statements
// (`app.tsx` imports this before `main.tsx` reaches its first line). Routing PROJECT/ENV through
// `@chatic/config` would read it uninitialized. Neither value is a setting anyway — this is a
// localStorage key namespace, a technical detail — so it reads `import.meta.env` directly, the same
// way `apps/web/src/app/utils/buildEnv.ts` already does (ADR-0079 decision 11 retired the single
// `import.meta` holder these used to come through, `@chatic/web-config`).
const PROJECT = (import.meta.env.VITE_PROJECT || '').toLowerCase();
const ENV = (import.meta.env.VITE_ENV || '').toLowerCase();
/**
 * Where the language in effect is written — not the setting (that is `ui.language`). The name is the
 * one i18next's detector used, kept because `relaySession` points lemon-web-core's
 * `x-lemon-language` header at `i18nextLng`. The SDK reads that name under its own prefix and in its
 * own storage, which matches this key only in a native local build, so in a deployed build the header
 * is not sent — as it was not before. Keeping the write keeps that behaviour unchanged.
 */
const LANGUAGE_KEY = 'i18nextLng';
const LANGUAGE_STORAGE_KEY = `@${PROJECT}_${ENV}.${LANGUAGE_KEY}`;

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

// The language is resolved here rather than by i18next-browser-languagedetector. The detector read
// the key above first and wrote whatever it detected back into it, so the language a device happened
// to report on first launch was kept forever and the device setting was never looked at again — and on
// iOS that first report was English for everyone (see `deviceLanguageCandidates`). Only an explicit
// choice in Settings is remembered now; `system` is resolved from the device on every boot.
const safeLocalStorage = (): Storage | undefined => {
    try {
        return typeof localStorage === 'undefined' ? undefined : localStorage;
    } catch {
        return undefined;
    }
};

i18n.on('languageChanged', language => {
    try {
        safeLocalStorage()?.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
        // Best-effort — only the request header reads it, and it is rewritten on the next change.
    }
});

i18n.use(ChainedBackend)
    .use(initReactI18next)
    .init({
        lng: resolveLanguage(
            readStoredLanguagePreference({ bag: readShellConfigBag(), storage: safeLocalStorage() }),
            deviceLanguageCandidates()
        ),
        fallbackLng: FALLBACK_LANGUAGE,
        supportedLngs: [...SUPPORTED_LANGUAGES],
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
                        ? 5 * 60 * 1000 // dev: 5 min
                        : 60 * 60 * 1000, // production: 1 hour
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
