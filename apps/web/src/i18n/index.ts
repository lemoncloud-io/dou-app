import { initReactI18next } from 'react-i18next';

import i18n from 'i18next';
import ChainedBackend from 'i18next-chained-backend';
import LocalStorageBackend from 'i18next-localstorage-backend';
import Backend from 'i18next-xhr-backend';

import { logger } from '@chatic/bridges';

import { asDomStorage } from '@chatic/storage';

import { deviceStore } from '../app/storage';

import {
    FALLBACK_LANGUAGE,
    SUPPORTED_LANGUAGES,
    deviceLanguageCandidates,
    readShellConfigBag,
    readStoredLanguagePreference,
    resolveLanguage,
} from './languagePreference';

const I18N_VERSION = process.env.I18N_VERSION || 'fallback';
const isDevelopment = process.env.NODE_ENV === 'development';

if (!isDevelopment) {
    const currentPrefix = `i18next_res_${I18N_VERSION}_`;
    const cleanupOldCache = () => {
        deviceStore.keys().forEach(key => {
            if (key.startsWith('i18next_res_') && !key.startsWith(currentPrefix)) {
                deviceStore.remove(key);
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
    .use(initReactI18next)
    .init({
        lng: resolveLanguage(
            readStoredLanguagePreference({
                bag: readShellConfigBag(),
                storage: { getItem: key => deviceStore.get(key) },
            }),
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
                    store: asDomStorage(deviceStore),
                    prefix: `i18next_res_${I18N_VERSION}_`,
                    expirationTime: isDevelopment ? 5 * 60 * 1000 : 60 * 60 * 1000,
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
