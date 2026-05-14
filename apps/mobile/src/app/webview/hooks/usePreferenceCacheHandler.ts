import { useCallback } from 'react';
import type { WebViewBridge } from './useBaseBridge';
import type { AppMessageData, DeletePreference, FetchPreference, SavePreference } from '@chatic/app-messages';
import { useLanguageStore, useThemeStore } from '../../stores';
import { useServices } from '../../hooks';

export const usePreferenceCacheHandler = (bridge: WebViewBridge) => {
    const { preferenceService, logService } = useServices();

    const handleFetchPreference = useCallback(
        async (message: FetchPreference) => {
            try {
                const value = await preferenceService.get(message.data.key as any);
                const response: AppMessageData<'OnFetchPreference'> = {
                    type: 'OnFetchPreference',
                    nonce: message.nonce,
                    data: {
                        key: message.data.key,
                        value,
                    },
                };
                bridge.post(response);
            } catch (e) {
                logService.error('CACHE', `FetchPreference error: ${message.data.key}`, e as Error);
                bridge.post({
                    type: 'OnFetchPreference',
                    nonce: message.nonce,
                    data: { key: message.data.key, value: null },
                });
            }
        },
        [bridge, preferenceService, logService]
    );

    const handleSavePreference = useCallback(
        async (message: SavePreference) => {
            const { key, value } = message.data;

            try {
                switch (key) {
                    case 'theme': {
                        useThemeStore.getState().setTheme(value as any);
                        break;
                    }
                    case 'language': {
                        useLanguageStore.getState().setLanguage(value as any);
                        break;
                    }
                    default:
                        await preferenceService.set(key as any, value);
                }

                const response: AppMessageData<'OnSavePreference'> = {
                    type: 'OnSavePreference',
                    nonce: message.nonce,
                    data: { key, success: true },
                };
                bridge.post(response);
            } catch (e) {
                logService.error('CACHE', `SavePreference error: ${key}`, e as Error);
                bridge.post({
                    type: 'OnSavePreference',
                    nonce: message.nonce,
                    data: { key, success: false },
                });
            }
        },
        [bridge, preferenceService, logService]
    );

    const handleDeletePreference = useCallback(
        async (message: DeletePreference) => {
            try {
                await preferenceService.remove(message.data.key as any);
                const response: AppMessageData<'OnDeletePreference'> = {
                    type: 'OnDeletePreference',
                    nonce: message.nonce,
                    data: {
                        key: message.data.key,
                        success: true,
                    },
                };
                bridge.post(response);
            } catch (e) {
                logService.error('CACHE', `DeletePreference error: ${message.data.key}`, e as Error);
                bridge.post({
                    type: 'OnDeletePreference',
                    nonce: message.nonce,
                    data: { key: message.data.key, success: false },
                });
            }
        },
        [bridge, preferenceService, logService]
    );

    return {
        handleFetchPreference,
        handleSavePreference,
        handleDeletePreference,
    };
};
