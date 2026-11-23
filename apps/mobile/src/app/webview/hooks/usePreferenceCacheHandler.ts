import { useCallback } from 'react';
import type { PreferenceKey, WebMessageData } from '@chatic/bridge-messages';
import { useLanguageStore, useThemeStore } from '../../stores';
import { parseThemeMode } from '../../stores/themeMode';
import { isLanguagePreference } from '../../stores/languagePreference';
import { useServices } from '../../hooks';

const BRIDGE_WRITABLE_PREFERENCE_KEYS: readonly PreferenceKey[] = ['blurLastMessage', 'isFirstRun', 'pushRegistration'];

export const usePreferenceCacheHandler = () => {
    const { preferenceService, logService } = useServices();

    const handleFetchPreference = useCallback(
        async (message: WebMessageData<'FetchPreference'>) => {
            const { key } = message.data;
            try {
                const value = await preferenceService.get(key as any);
                return { type: 'OnFetchPreference' as const, success: true, data: { key, value } };
            } catch (e: any) {
                logService.error('CACHE', `FetchPreference error: ${key}`, e as Error);
                return {
                    type: 'OnFetchPreference' as const,
                    success: false,
                    error: { code: 'PREF_FETCH_ERROR', message: e.message },
                };
            }
        },
        [preferenceService, logService]
    );

    const handleSavePreference = useCallback(
        async (message: WebMessageData<'SavePreference'>) => {
            const { key, value } = message.data;

            try {
                switch (key) {
                    case 'theme': {
                        const theme = parseThemeMode(value);
                        if (!theme) {
                            logService.warn('CACHE', `SavePreference rejected invalid theme: ${String(value)}`);
                            return {
                                type: 'OnSavePreference' as const,
                                success: false,
                                error: { code: 'PREF_INVALID_VALUE', message: `Invalid theme value: ${String(value)}` },
                            };
                        }
                        useThemeStore.getState().setTheme(theme);
                        break;
                    }
                    case 'language': {
                        if (!isLanguagePreference(value)) {
                            logService.warn('CACHE', `SavePreference rejected invalid language: ${String(value)}`);
                            return {
                                type: 'OnSavePreference' as const,
                                success: false,
                                error: {
                                    code: 'PREF_INVALID_VALUE',
                                    message: `Invalid language value: ${String(value)}`,
                                },
                            };
                        }
                        useLanguageStore.getState().setPreference(value);
                        break;
                    }
                    default:
                        if (!BRIDGE_WRITABLE_PREFERENCE_KEYS.includes(key)) {
                            logService.warn('CACHE', `SavePreference rejected non-writable key: ${key}`);
                            return {
                                type: 'OnSavePreference' as const,
                                success: false,
                                error: {
                                    code: 'PREF_KEY_NOT_WRITABLE',
                                    message: `Preference key not writable from web: ${key}`,
                                },
                            };
                        }
                        await preferenceService.set(key, value);
                }

                return { type: 'OnSavePreference' as const, success: true, data: { key, success: true } };
            } catch (e: any) {
                logService.error('CACHE', `SavePreference error: ${key}`, e as Error);
                return {
                    type: 'OnSavePreference' as const,
                    success: false,
                    error: { code: 'PREF_SAVE_ERROR', message: e.message },
                };
            }
        },
        [preferenceService, logService]
    );

    const handleDeletePreference = useCallback(
        async (message: WebMessageData<'DeletePreference'>) => {
            const { key } = message.data;
            try {
                await preferenceService.remove(key as any);
                return { type: 'OnDeletePreference' as const, success: true, data: { key, success: true } };
            } catch (e: any) {
                logService.error('CACHE', `DeletePreference error: ${key}`, e as Error);
                return {
                    type: 'OnDeletePreference' as const,
                    success: false,
                    error: { code: 'PREF_DELETE_ERROR', message: e.message },
                };
            }
        },
        [preferenceService, logService]
    );

    return {
        handleFetchPreference,
        handleSavePreference,
        handleDeletePreference,
    };
};
