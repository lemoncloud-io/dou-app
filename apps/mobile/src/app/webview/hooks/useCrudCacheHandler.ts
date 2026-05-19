import { useCallback } from 'react';
import { useServices } from '../../hooks';

import type {
    ClearCacheData,
    DeleteAllCacheData,
    DeleteCacheData,
    FetchAllCacheData,
    FetchCacheData,
    OnClearCacheDataPayload,
    OnDeleteAllCacheDataPayload,
    OnDeleteCacheDataPayload,
    OnFetchAllCacheDataPayload,
    OnFetchCacheDataPayload,
    OnSaveAllCacheDataPayload,
    OnSaveCacheDataPayload,
    SaveAllCacheData,
    SaveCacheData,
} from '@chatic/app-messages';

export const useCrudCacheHandler = () => {
    const { cacheCrudService, logService: logger } = useServices();

    const handleFetchAllCache = useCallback(
        async (payload: FetchAllCacheData['data']): Promise<OnFetchAllCacheDataPayload> => {
            try {
                const items = await cacheCrudService.fetchAll(payload);
                return {
                    type: payload.type,
                    cid: payload.cid,
                    uid: payload.uid,
                    items: items,
                    query: payload.query,
                } as OnFetchAllCacheDataPayload;
            } catch (e) {
                logger.error('CACHE', `FetchAll error: ${payload.type}`, e);
                return {
                    type: payload.type,
                    cid: payload.cid,
                    uid: payload.uid,
                    items: null,
                };
            }
        },
        [cacheCrudService, logger]
    );

    const handleFetchCache = useCallback(
        async (payload: FetchCacheData['data']): Promise<OnFetchCacheDataPayload> => {
            try {
                const item = await cacheCrudService.fetch(payload);
                return {
                    type: payload.type,
                    cid: payload.cid,
                    uid: payload.uid,
                    id: payload.id,
                    item: item,
                } as OnFetchCacheDataPayload;
            } catch (e) {
                logger.error('CACHE', `Fetch error: ${payload.type} ${payload.id}`, e);
                return {
                    type: payload.type,
                    cid: payload.cid,
                    uid: payload.uid,
                    id: payload.id,
                    item: null,
                };
            }
        },
        [cacheCrudService, logger]
    );

    const handleSaveCache = useCallback(
        async (payload: SaveCacheData['data']): Promise<OnSaveCacheDataPayload> => {
            try {
                const savedId = await cacheCrudService.save(payload);
                return {
                    type: payload.type,
                    cid: payload.cid,
                    uid: payload.uid,
                    id: savedId,
                    success: true,
                };
            } catch (e) {
                logger.error('CACHE', `Save error: ${payload.type} ${payload.id}`, e);
                return {
                    type: payload.type,
                    cid: payload.cid,
                    uid: payload.uid,
                    id: null,
                    success: false,
                };
            }
        },
        [cacheCrudService, logger]
    );

    const handleSaveAllCache = useCallback(
        async (payload: SaveAllCacheData['data']): Promise<OnSaveAllCacheDataPayload> => {
            try {
                const savedIds = await cacheCrudService.saveAll(payload);
                return {
                    type: payload.type,
                    cid: payload.cid,
                    uid: payload.uid,
                    ids: savedIds,
                    success: true,
                    query: payload.query,
                };
            } catch (e) {
                logger.error('CACHE', `SaveAll error: ${payload.type}`, e);
                return {
                    type: payload.type,
                    cid: payload.cid,
                    uid: payload.uid,
                    ids: [],
                    success: false,
                };
            }
        },
        [cacheCrudService, logger]
    );

    const handleDeleteCache = useCallback(
        async (payload: DeleteCacheData['data']): Promise<OnDeleteCacheDataPayload> => {
            try {
                const deletedId = await cacheCrudService.delete(payload);
                return {
                    type: payload.type,
                    cid: payload.cid,
                    uid: payload.uid,
                    id: deletedId,
                    success: true,
                };
            } catch (e) {
                logger.error('CACHE', `Delete error: ${payload.type} ${payload.id}`, e);
                return {
                    type: payload.type,
                    cid: payload.cid,
                    uid: payload.uid,
                    id: null,
                    success: false,
                };
            }
        },
        [cacheCrudService, logger]
    );

    const handleDeleteAllCache = useCallback(
        async (payload: DeleteAllCacheData['data']): Promise<OnDeleteAllCacheDataPayload> => {
            try {
                const deletedIds = await cacheCrudService.deleteAll(payload);
                return {
                    type: payload.type,
                    cid: payload.cid,
                    uid: payload.uid,
                    ids: deletedIds,
                    success: true,
                };
            } catch (e) {
                logger.error('CACHE', `DeleteAll error: ${payload.type}`, e);
                return {
                    type: payload.type,
                    cid: payload.cid,
                    uid: payload.uid,
                    ids: [],
                    success: false,
                };
            }
        },
        [cacheCrudService, logger]
    );

    const handleClearCache = useCallback(
        async (payload: ClearCacheData['data']): Promise<OnClearCacheDataPayload> => {
            try {
                await cacheCrudService.clear(payload);
                return {
                    type: payload.type,
                    cid: payload.cid,
                    uid: payload.uid,
                    success: true,
                };
            } catch (e) {
                logger.error('CACHE', `Clear error: ${payload.type}`, e);
                return {
                    type: payload.type,
                    cid: payload.cid,
                    uid: payload.uid,
                    success: false,
                };
            }
        },
        [cacheCrudService, logger]
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
