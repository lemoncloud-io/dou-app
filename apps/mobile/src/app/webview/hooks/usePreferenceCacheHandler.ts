import { useCallback } from 'react';
import type { PreferenceKey, WebMessageData } from '@chatic/app-messages';
import { useLanguageStore, useThemeStore } from '../../stores';
import { useServices } from '../../hooks';

// SavePreference bridge messages originate from untrusted WebView page JS. Only
// web-facing preferences may be persisted through this path. System keys — above
// all 'debugSettings', which carries webviewBaseUrlOverride and therefore decides
// the WebView origin on next launch — must NEVER be writable from the web, or a
// single crafted bridge message could silently hijack the app origin (persistent
// MITM). theme/language are handled by their own cases below; every other key
// falls through to this allowlist.
const BRIDGE_WRITABLE_PREFERENCE_KEYS: readonly PreferenceKey[] = ['blurLastMessage', 'isFirstRun'];

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
                    case 'theme':
                        useThemeStore.getState().setTheme(value as any);
                        break;
                    case 'language':
                        useLanguageStore.getState().setLanguage(value as any);
                        break;
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
