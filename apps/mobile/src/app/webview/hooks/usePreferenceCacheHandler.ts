import { useCallback } from 'react';
import type {
    DeletePreference,
    FetchPreference,
    OnDeletePreferencePayload,
    OnFetchPreferencePayload,
    OnSavePreferencePayload,
    SavePreference,
} from '@chatic/app-messages';
import { useLanguageStore, useThemeStore } from '../../stores';
import { useServices } from '../../hooks';

export const usePreferenceCacheHandler = () => {
    const { preferenceService, logService } = useServices();

    const handleFetchPreference = useCallback(
        async (message: FetchPreference): Promise<{ data: OnFetchPreferencePayload }> => {
            const { key } = message.data;
            try {
                const value = await preferenceService.get(key as any);
                return { data: { key, value } };
            } catch (e) {
                logService.error('CACHE', `FetchPreference error: ${key}`, e as Error);
                return { data: { key, value: null } };
            }
        },
        [preferenceService, logService]
    );

    const handleSavePreference = useCallback(
        async (message: SavePreference): Promise<{ data: OnSavePreferencePayload }> => {
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

                return { data: { key, success: true } };
            } catch (e) {
                logService.error('CACHE', `SavePreference error: ${key}`, e as Error);
                return { data: { key, success: false } };
            }
        },
        [preferenceService, logService]
    );

    const handleDeletePreference = useCallback(
        async (message: DeletePreference): Promise<{ data: OnDeletePreferencePayload }> => {
            const { key } = message.data;
            try {
                await preferenceService.remove(key as any);
                return { data: { key, success: true } };
            } catch (e) {
                logService.error('CACHE', `DeletePreference error: ${key}`, e as Error);
                return { data: { key, success: false } };
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
