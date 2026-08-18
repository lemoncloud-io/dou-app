import { useCallback } from 'react';
import type { PreferenceKey, WebMessageData } from '@chatic/app-messages';
import { useLanguageStore, useThemeStore } from '../../stores';
// Imported past the barrel on purpose: themeMode is provider-free, so this stays
// testable against the parser that actually ships.
import { parseThemeMode } from '../../stores/themeMode';
import { useServices } from '../../hooks';

// SavePreference bridge messages originate from untrusted WebView page JS. Only
// web-facing preferences may be persisted through this path. System keys — above
// all 'debugSettings', which carries webviewBaseUrlOverride and therefore decides
// the WebView origin on next launch — must NEVER be writable from the web, or a
// single crafted bridge message could silently hijack the app origin (persistent
// MITM). theme/language are handled by their own cases below; every other key
// falls through to this allowlist.
// NOTE: 'theme' validates its value below; 'language' does NOT yet — it still trusts the
// web's value verbatim, which lets a page write an arbitrary blob into native storage under
// that key. Tracked separately; do not read the two cases as equally guarded.
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
                    case 'theme': {
                        // Validate before it reaches the store: an unrecognized value would be
                        // persisted verbatim and then silently degrade the status bar to light on
                        // every boot. Rejecting keeps the stored value the only normalized one.
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
