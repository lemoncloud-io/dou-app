import { useCallback } from 'react';
import { logger } from '../../services';

import type { WebViewBridge } from './useBaseBridge';
import type {
    AppMessageData,
    DeleteAllCacheData,
    DeleteCacheData,
    DeletePreference,
    FetchAllCacheData,
    FetchCacheData,
    FetchPreference,
    SaveAllCacheData,
    SaveCacheData,
    SavePreference,
} from '@chatic/app-messages';
import { cacheRepository } from '../../storages';

export const useCacheHandler = (bridge: WebViewBridge) => {
    const handleFetchAllCacheData = useCallback(
        async (message: FetchAllCacheData) => {
            try {
                const items = await cacheRepository.fetchAll(message.data);
                const response: AppMessageData<'OnFetchAllCacheData'> = {
                    type: 'OnFetchAllCacheData',
                    nonce: message.nonce,
                    data: {
                        type: message.data.type,
                        items,
                    } as any,
                };
                bridge.post(response);
            } catch (e) {
                logger.error('CACHE', `FetchAll error: ${message.data.type}`, e);
            }
        },
        [bridge]
    );

    const handleFetchCacheData = useCallback(
        async (message: FetchCacheData) => {
            try {
                const item = await cacheRepository.fetch(message.data);
                const response: AppMessageData<'OnFetchCacheData'> = {
                    type: 'OnFetchCacheData',
                    nonce: message.nonce,
                    data: {
                        type: message.data.type,
                        id: message.data.id,
                        item,
                    } as any,
                };
                bridge.post(response);
            } catch (e) {
                logger.error('CACHE', `Fetch error: ${message.data.type} ${message.data.id}`, e);
                bridge.post({
                    type: 'OnFetchCacheData',
                    nonce: message.nonce,
                    data: { type: message.data.type, id: message.data.id, item: null } as any,
                });
            }
        },
        [bridge]
    );

    const handleSaveCacheData = useCallback(
        async (message: SaveCacheData) => {
            try {
                const savedId = await cacheRepository.save(message.data);
                const response: AppMessageData<'OnSaveCacheData'> = {
                    type: 'OnSaveCacheData',
                    nonce: message.nonce,
                    data: {
                        type: message.data.type,
                        id: savedId,
                    } as any,
                };
                bridge.post(response);
            } catch (e) {
                logger.error('CACHE', `Save error: ${message.data.type} ${message.data.id}`, e);
                bridge.post({
                    type: 'OnSaveCacheData',
                    nonce: message.nonce,
                    data: { type: message.data.type, id: null } as any,
                });
            }
        },
        [bridge]
    );

    const handleSaveAllCacheData = useCallback(
        async (message: SaveAllCacheData) => {
            try {
                const savedIds = await cacheRepository.saveAll(message.data);
                const response: AppMessageData<'OnSaveAllCacheData'> = {
                    type: 'OnSaveAllCacheData',
                    nonce: message.nonce,
                    data: {
                        type: message.data.type,
                        ids: savedIds,
                    } as any,
                };
                bridge.post(response);
            } catch (e) {
                logger.error('CACHE', `SaveAll error: ${message.data.type}`, e);
            }
        },
        [bridge]
    );

    const handleDeleteCacheData = useCallback(
        async (message: DeleteCacheData) => {
            try {
                const deletedId = await cacheRepository.delete(message.data);
                const response: AppMessageData<'OnDeleteCacheData'> = {
                    type: 'OnDeleteCacheData',
                    nonce: message.nonce,
                    data: {
                        type: message.data.type,
                        id: deletedId,
                    } as any,
                };
                bridge.post(response);
            } catch (e) {
                logger.error('CACHE', `Delete error: ${message.data.type} ${message.data.id}`, e);
                bridge.post({
                    type: 'OnDeleteCacheData',
                    nonce: message.nonce,
                    data: { type: message.data.type, id: null } as any,
                });
            }
        },
        [bridge]
    );

    const handleDeleteAllCacheData = useCallback(
        async (message: DeleteAllCacheData) => {
            try {
                const deletedIds = await cacheRepository.deleteAll(message.data);
                const response: AppMessageData<'OnDeleteAllCacheData'> = {
                    type: 'OnDeleteAllCacheData',
                    nonce: message.nonce,
                    data: {
                        type: message.data.type,
                        ids: deletedIds,
                    } as any,
                };
                bridge.post(response);
            } catch (e) {
                logger.error('CACHE', `DeleteAll error: ${message.data.type}`, e);
            }
        },
        [bridge]
    );

    const handleFetchPreference = useCallback(
        async (message: FetchPreference) => {
            try {
                const value = await cacheRepository.getPreference(message.data.key);
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
            try {
                await cacheRepository.savePreference(message.data.key, message.data.value);
                const response: AppMessageData<'OnSavePreference'> = {
                    type: 'OnSavePreference',
                    nonce: message.nonce,
                    data: {
                        key: message.data.key,
                        success: true,
                    },
                };
                bridge.post(response);
            } catch (e) {
                logger.error('CACHE', `SavePreference error: ${message.data.key}`, e);
                bridge.post({
                    type: 'OnSavePreference',
                    nonce: message.nonce,
                    data: { key: message.data.key, success: false },
                });
            }
        },
        [bridge]
    );

    const handleDeletePreference = useCallback(
        async (message: DeletePreference) => {
            try {
                await cacheRepository.removePreference(message.data.key);
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
        handleFetchAllCacheData,
        handleFetchCacheData,
        handleSaveCacheData,
        handleSaveAllCacheData,
        handleDeleteCacheData,
        handleDeleteAllCacheData,
        handleFetchPreference,
        handleSavePreference,
        handleDeletePreference,
    };
};
