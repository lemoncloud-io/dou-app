import { useCallback } from 'react';
import { logger } from '../../services';

import type { WebViewBridge } from './useBaseBridge';
import type { AppMessageData, DeletePreference, FetchPreference, SavePreference } from '@chatic/app-messages';
import { cachePreferenceService } from '../../storages';
import { useLanguageStore, useThemeStore } from '../../stores';

export const usePreferenceCacheHandler = (bridge: WebViewBridge) => {
    const handleFetchPreference = useCallback(
        async (message: FetchPreference) => {
            try {
                const value = await cachePreferenceService.getPreference(message.data.key);
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
                logger.error('CACHE', `FetchPreference error: ${message.data.key}`, e);
                bridge.post({
                    type: 'OnFetchPreference',
                    nonce: message.nonce,
                    data: { key: message.data.key, value: null },
                });
            }
        },
        [bridge]
    );

    const handleSavePreference = useCallback(
        async (message: SavePreference) => {
            const { key, value } = message.data;

            try {
                switch (key) {
                    case 'theme': {
                        useThemeStore.getState().setTheme(value);
                        break;
                    }
                    case 'language': {
                        useLanguageStore.getState().setLanguage(value);
                        break;
                    }
                    default:
                        await cachePreferenceService.savePreference(key, value);
                }

                const response: AppMessageData<'OnSavePreference'> = {
                    type: 'OnSavePreference',
                    nonce: message.nonce,
                    data: { key, success: true },
                };
                bridge.post(response);
            } catch (e) {
                logger.error('CACHE', `SavePreference error: ${key}`, e);
                bridge.post({
                    type: 'OnSavePreference',
                    nonce: message.nonce,
                    data: { key, success: false },
                });
            }
        },
        [bridge]
    );

    const handleDeletePreference = useCallback(
        async (message: DeletePreference) => {
            try {
                await cachePreferenceService.removePreference(message.data.key);
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
                logger.error('CACHE', `DeletePreference error: ${message.data.key}`, e);
                bridge.post({
                    type: 'OnDeletePreference',
                    nonce: message.nonce,
                    data: { key: message.data.key, success: false },
                });
            }
        },
        [bridge]
    );

    return {
        handleFetchPreference,
        handleSavePreference,
        handleDeletePreference,
    };
};
