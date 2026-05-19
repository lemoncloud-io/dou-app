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
        async (payload: FetchAllCacheData): Promise<OnFetchAllCacheDataPayload> => {
            const data = payload.data;
            try {
                const items = await cacheCrudService.fetchAll(data);
                return {
                    type: data.type,
                    cid: data.cid,
                    uid: data.uid,
                    items: items,
                    query: data.query,
                } as OnFetchAllCacheDataPayload;
            } catch (e) {
                logger.error('CACHE', `FetchAll error: ${data.type}`, e);
                return {
                    type: data.type,
                    cid: data.cid,
                    uid: data.uid,
                    items: null,
                };
            }
        },
        [cacheCrudService, logger]
    );

    const handleFetchCache = useCallback(
        async (payload: FetchCacheData): Promise<OnFetchCacheDataPayload> => {
            const data = payload.data;
            try {
                const item = await cacheCrudService.fetch(data);
                return {
                    type: data.type,
                    cid: data.cid,
                    uid: data.uid,
                    id: data.id,
                    item: item,
                } as OnFetchCacheDataPayload;
            } catch (e) {
                logger.error('CACHE', `Fetch error: ${data.type} ${data.id}`, e);
                return {
                    type: data.type,
                    cid: data.cid,
                    uid: data.uid,
                    id: data.id,
                    item: null,
                };
            }
        },
        [cacheCrudService, logger]
    );

    const handleSaveCache = useCallback(
        async (payload: SaveCacheData): Promise<OnSaveCacheDataPayload> => {
            const data = payload.data;
            try {
                const savedId = await cacheCrudService.save(data);
                return {
                    type: data.type,
                    cid: data.cid,
                    uid: data.uid,
                    id: savedId,
                    success: true,
                };
            } catch (e) {
                logger.error('CACHE', `Save error: ${data.type} ${data.id}`, e);
                return {
                    type: data.type,
                    cid: data.cid,
                    uid: data.uid,
                    id: null,
                    success: false,
                };
            }
        },
        [cacheCrudService, logger]
    );

    const handleSaveAllCache = useCallback(
        async (payload: SaveAllCacheData): Promise<OnSaveAllCacheDataPayload> => {
            const data = payload.data;
            try {
                const savedIds = await cacheCrudService.saveAll(data);
                return {
                    type: data.type,
                    cid: data.cid,
                    uid: data.uid,
                    ids: savedIds,
                    success: true,
                    query: data.query,
                };
            } catch (e) {
                logger.error('CACHE', `SaveAll error: ${data.type}`, e);
                return {
                    type: data.type,
                    cid: data.cid,
                    uid: data.uid,
                    ids: [],
                    success: false,
                };
            }
        },
        [cacheCrudService, logger]
    );

    const handleDeleteCache = useCallback(
        async (payload: DeleteCacheData): Promise<OnDeleteCacheDataPayload> => {
            const data = payload.data;
            try {
                const deletedId = await cacheCrudService.delete(data);
                return {
                    type: data.type,
                    cid: data.cid,
                    uid: data.uid,
                    id: deletedId,
                    success: true,
                };
            } catch (e) {
                logger.error('CACHE', `Delete error: ${data.type} ${data.id}`, e);
                return {
                    type: data.type,
                    cid: data.cid,
                    uid: data.uid,
                    id: null,
                    success: false,
                };
            }
        },
        [cacheCrudService, logger]
    );

    const handleDeleteAllCache = useCallback(
        async (payload: DeleteAllCacheData): Promise<OnDeleteAllCacheDataPayload> => {
            const data = payload.data;
            try {
                const deletedIds = await cacheCrudService.deleteAll(data);
                return {
                    type: data.type,
                    cid: data.cid,
                    uid: data.uid,
                    ids: deletedIds,
                    success: true,
                };
            } catch (e) {
                logger.error('CACHE', `DeleteAll error: ${data.type}`, e);
                return {
                    type: data.type,
                    cid: data.cid,
                    uid: data.uid,
                    ids: [],
                    success: false,
                };
            }
        },
        [cacheCrudService, logger]
    );

    const handleClearCache = useCallback(
        async (payload: ClearCacheData): Promise<OnClearCacheDataPayload> => {
            const data = payload.data;
            try {
                await cacheCrudService.clear(data);
                return {
                    type: data.type,
                    cid: data.cid,
                    uid: data.uid,
                    success: true,
                };
            } catch (e) {
                logger.error('CACHE', `Clear error: ${data.type}`, e);
                return {
                    type: data.type,
                    cid: data.cid,
                    uid: data.uid,
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
