import { useCallback } from 'react';
import { logger } from '../../services';

import type { WebViewBridge } from './useBaseBridge';
import type {
    AppMessageData,
    ClearCache,
    DeleteAllCache,
    DeleteCache,
    FetchAllCache,
    FetchCache,
    SaveAllCache,
    SaveCache,
} from '@chatic/app-messages';
import { cacheCrudService } from '../../storages';

export const useCrudCacheHandler = (bridge: WebViewBridge) => {
    const handleFetchAllCache = useCallback(
        async (message: FetchAllCache) => {
            try {
                const items = await cacheCrudService.fetchAll(message.data);
                const response: AppMessageData<'OnFetchAllCache'> = {
                    type: 'OnFetchAllCache',
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
        async (message: FetchCache) => {
            try {
                const item = await cacheCrudService.fetch(message.data);
                const response: AppMessageData<'OnFetchCache'> = {
                    type: 'OnFetchCache',
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
                    type: 'OnFetchCache',
                    nonce: message.nonce,
                    data: { type: message.data.type, id: message.data.id, item: null } as any,
                });
            }
        },
        [bridge]
    );

    const handleSaveCache = useCallback(
        async (message: SaveCache) => {
            try {
                const savedId = await cacheCrudService.save(message.data);
                const response: AppMessageData<'OnSaveCache'> = {
                    type: 'OnSaveCache',
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
                    type: 'OnSaveCache',
                    nonce: message.nonce,
                    data: { type: message.data.type, id: null } as any,
                });
            }
        },
        [bridge]
    );

    const handleSaveAllCache = useCallback(
        async (message: SaveAllCache) => {
            try {
                const savedIds = await cacheCrudService.saveAll(message.data);
                const response: AppMessageData<'OnSaveAllCache'> = {
                    type: 'OnSaveAllCache',
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
        async (message: DeleteCache) => {
            try {
                const deletedId = await cacheCrudService.delete(message.data);
                const response: AppMessageData<'OnDeleteCache'> = {
                    type: 'OnDeleteCache',
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
                    type: 'OnDeleteCache',
                    nonce: message.nonce,
                    data: { type: message.data.type, id: null } as any,
                });
            }
        },
        [bridge]
    );

    const handleDeleteAllCache = useCallback(
        async (message: DeleteAllCache) => {
            try {
                const deletedIds = await cacheCrudService.deleteAll(message.data);
                const response: AppMessageData<'OnDeleteAllCache'> = {
                    type: 'OnDeleteAllCache',
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
        async (message: ClearCache) => {
            try {
                await cacheCrudService.clear(message.data);
                const response: AppMessageData<'OnClearCache'> = {
                    type: 'OnClearCache',
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
