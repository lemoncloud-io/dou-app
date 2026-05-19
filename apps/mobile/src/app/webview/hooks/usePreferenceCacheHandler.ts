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
        async (payload: FetchPreference): Promise<OnFetchPreferencePayload> => {
            const { key } = payload.data;
            try {
                const value = await preferenceService.get(key as any);
                return { key, value };
            } catch (e) {
                logService.error('CACHE', `FetchPreference error: ${key}`, e as Error);
                return { key, value: null };
            }
        },
        [preferenceService, logService]
    );

    const handleSavePreference = useCallback(
        async (payload: SavePreference): Promise<OnSavePreferencePayload> => {
            const { key, value } = payload.data;

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

                return { key, success: true };
            } catch (e) {
                logService.error('CACHE', `SavePreference error: ${key}`, e as Error);
                return { key, success: false };
            }
        },
        [preferenceService, logService]
    );

    const handleDeletePreference = useCallback(
        async (payload: DeletePreference): Promise<OnDeletePreferencePayload> => {
            const { key } = payload.data;
            try {
                await preferenceService.remove(key as any);
                return { key, success: true };
            } catch (e) {
                logService.error('CACHE', `DeletePreference error: ${key}`, e as Error);
                return { key, success: false };
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
