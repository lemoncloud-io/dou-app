import { useCallback } from 'react';
import type { WebMessageData } from '@chatic/app-messages';
import { useLanguageStore, useThemeStore } from '../../stores';
import { useServices } from '../../hooks';

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
                        await preferenceService.set(key as any, value);
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
