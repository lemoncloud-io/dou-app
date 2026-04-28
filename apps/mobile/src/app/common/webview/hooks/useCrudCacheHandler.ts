import { useCallback } from 'react';
import { logger } from '../../services';

import type { WebViewBridge } from './useBaseBridge';
import type {
    AppMessageData,
    ClearCacheData,
    DeleteAllCacheData,
    DeleteCacheData,
    FetchAllCacheData,
    FetchCacheData,
    SaveAllCacheData,
    SaveCacheData,
} from '@chatic/app-messages';
import { cacheCrudService } from '../../storages';

export const useCrudCacheHandler = (bridge: WebViewBridge) => {
    const handleFetchAllCache = useCallback(
        async (message: FetchAllCacheData) => {
            try {
                const items = await cacheCrudService.fetchAll(message.data);
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

    const handleFetchCache = useCallback(
        async (message: FetchCacheData) => {
            try {
                const item = await cacheCrudService.fetch(message.data);
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

    const handleSaveCache = useCallback(
        async (message: SaveCacheData) => {
            try {
                const savedId = await cacheCrudService.save(message.data);
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

    const handleSaveAllCache = useCallback(
        async (message: SaveAllCacheData) => {
            try {
                const savedIds = await cacheCrudService.saveAll(message.data);
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

    const handleDeleteCache = useCallback(
        async (message: DeleteCacheData) => {
            try {
                const deletedId = await cacheCrudService.delete(message.data);
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

    const handleDeleteAllCache = useCallback(
        async (message: DeleteAllCacheData) => {
            try {
                const deletedIds = await cacheCrudService.deleteAll(message.data);
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

    const handleClearCache = useCallback(
        async (message: ClearCacheData) => {
            try {
                await cacheCrudService.clear(message.data);
                const response: AppMessageData<'OnClearCacheData'> = {
                    type: 'OnClearCacheData',
                    nonce: message.nonce,
                    data: {
                        type: message.data.type,
                    } as any,
                };
                bridge.post(response);
            } catch (e) {
                logger.error('CACHE', `Clear error: ${message.data.type}`, e);
            }
        },
        [bridge]
    );

    return {
        handleFetchAllCache,
        handleFetchCache,
        handleSaveCache,
        handleSaveAllCache,
        handleDeleteCache,
        handleDeleteAllCache,
        handleClearCache,
    };
};
