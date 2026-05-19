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
        async (message: FetchAllCacheData) => {
            const data = message.data;
            try {
                const items = await cacheCrudService.fetchAll(data);
                return {
                    data: {
                        type: data.type,
                        cid: data.cid,
                        uid: data.uid,
                        items: items,
                        query: data.query,
                    } as OnFetchAllCacheDataPayload,
                };
            } catch (e) {
                logger.error('CACHE', `FetchAll error: ${data.type}`, e);
                return {
                    data: {
                        type: data.type,
                        cid: data.cid,
                        uid: data.uid,
                        items: null,
                    } as OnFetchAllCacheDataPayload,
                };
            }
        },
        [cacheCrudService, logger]
    );

    const handleFetchCache = useCallback(
        async (message: FetchCacheData) => {
            const data = message.data;
            try {
                const item = await cacheCrudService.fetch(data);
                return {
                    data: {
                        type: data.type,
                        cid: data.cid,
                        uid: data.uid,
                        id: data.id,
                        item: item,
                    } as OnFetchCacheDataPayload,
                };
            } catch (e) {
                logger.error('CACHE', `Fetch error: ${data.type} ${data.id}`, e);
                return {
                    data: {
                        type: data.type,
                        cid: data.cid,
                        uid: data.uid,
                        id: data.id,
                        item: null,
                    } as OnFetchCacheDataPayload,
                };
            }
        },
        [cacheCrudService, logger]
    );

    const handleSaveCache = useCallback(
        async (message: SaveCacheData) => {
            const data = message.data;
            try {
                const savedId = await cacheCrudService.save(data);
                return {
                    data: {
                        type: data.type,
                        cid: data.cid,
                        uid: data.uid,
                        id: savedId,
                        success: true,
                    } as OnSaveCacheDataPayload,
                };
            } catch (e) {
                logger.error('CACHE', `Save error: ${data.type} ${data.id}`, e);
                return {
                    data: {
                        type: data.type,
                        cid: data.cid,
                        uid: data.uid,
                        id: null,
                        success: false,
                    } as OnSaveCacheDataPayload,
                };
            }
        },
        [cacheCrudService, logger]
    );

    const handleSaveAllCache = useCallback(
        async (message: SaveAllCacheData) => {
            const data = message.data;
            try {
                const savedIds = await cacheCrudService.saveAll(data);
                return {
                    data: {
                        type: data.type,
                        cid: data.cid,
                        uid: data.uid,
                        ids: savedIds,
                        success: true,
                        query: data.query,
                    } as OnSaveAllCacheDataPayload,
                };
            } catch (e) {
                logger.error('CACHE', `SaveAll error: ${data.type}`, e);
                return {
                    data: {
                        type: data.type,
                        cid: data.cid,
                        uid: data.uid,
                        ids: [],
                        success: false,
                    } as OnSaveAllCacheDataPayload,
                };
            }
        },
        [cacheCrudService, logger]
    );

    const handleDeleteCache = useCallback(
        async (message: DeleteCacheData) => {
            const data = message.data;
            try {
                const deletedId = await cacheCrudService.delete(data);
                return {
                    data: {
                        type: data.type,
                        cid: data.cid,
                        uid: data.uid,
                        id: deletedId,
                        success: true,
                    } as OnDeleteCacheDataPayload,
                };
            } catch (e) {
                logger.error('CACHE', `Delete error: ${data.type} ${data.id}`, e);
                return {
                    data: {
                        type: data.type,
                        cid: data.cid,
                        uid: data.uid,
                        id: null,
                        success: false,
                    } as OnDeleteCacheDataPayload,
                };
            }
        },
        [cacheCrudService, logger]
    );

    const handleDeleteAllCache = useCallback(
        async (message: DeleteAllCacheData) => {
            const data = message.data;
            try {
                const deletedIds = await cacheCrudService.deleteAll(data);
                return {
                    data: {
                        type: data.type,
                        cid: data.cid,
                        uid: data.uid,
                        ids: deletedIds,
                        success: true,
                    } as OnDeleteAllCacheDataPayload,
                };
            } catch (e) {
                logger.error('CACHE', `DeleteAll error: ${data.type}`, e);
                return {
                    data: {
                        type: data.type,
                        cid: data.cid,
                        uid: data.uid,
                        ids: [],
                        success: false,
                    } as OnDeleteAllCacheDataPayload,
                };
            }
        },
        [cacheCrudService, logger]
    );

    const handleClearCache = useCallback(
        async (message: ClearCacheData) => {
            const data = message.data;
            try {
                await cacheCrudService.clear(data);
                return {
                    data: {
                        type: data.type,
                        cid: data.cid,
                        uid: data.uid,
                        success: true,
                    } as OnClearCacheDataPayload,
                };
            } catch (e) {
                logger.error('CACHE', `Clear error: ${data.type}`, e);
                return {
                    data: {
                        type: data.type,
                        cid: data.cid,
                        uid: data.uid,
                        success: false,
                    } as OnClearCacheDataPayload,
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
