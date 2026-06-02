import { useCallback } from 'react';
import { useServices } from '../../hooks';
import type { WebMessageData } from '@chatic/app-messages';

export const useCrudCacheHandler = () => {
    const { cacheCrudService, logService: logger } = useServices();

    const handleFetchAllCache = useCallback(
        async (message: WebMessageData<'FetchAllCacheData'>) => {
            const data = message.data;
            try {
                const items = await cacheCrudService.fetchAll(data);
                return {
                    type: 'OnFetchAllCacheData' as const,
                    success: true,
                    data: { type: data.type, cid: data.cid, uid: data.uid, items, query: data.query },
                };
            } catch (e) {
                logger.error('CACHE', `FetchAll error: ${data.type}`, e);
                return {
                    type: 'OnFetchAllCacheData' as const,
                    success: true,
                    data: { type: data.type, cid: data.cid, uid: data.uid, items: null },
                };
            }
        },
        [cacheCrudService, logger]
    );

    const handleFetchCache = useCallback(
        async (message: WebMessageData<'FetchCacheData'>) => {
            const data = message.data;
            try {
                const item = await cacheCrudService.fetch(data);
                return {
                    type: 'OnFetchCacheData' as const,
                    success: true,
                    data: { type: data.type, cid: data.cid, uid: data.uid, id: data.id, item },
                };
            } catch (e) {
                logger.error('CACHE', `Fetch error: ${data.type} ${data.id}`, e);
                return {
                    type: 'OnFetchCacheData' as const,
                    success: true,
                    data: { type: data.type, cid: data.cid, uid: data.uid, id: data.id, item: null },
                };
            }
        },
        [cacheCrudService, logger]
    );

    const handleSaveCache = useCallback(
        async (message: WebMessageData<'SaveCacheData'>) => {
            const data = message.data;
            try {
                const savedId = await cacheCrudService.save(data);
                return {
                    type: 'OnSaveCacheData' as const,
                    success: true,
                    data: { type: data.type, cid: data.cid, uid: data.uid, id: savedId, success: true },
                };
            } catch (e) {
                logger.error('CACHE', `Save error: ${data.type} ${data.id}`, e);
                return {
                    type: 'OnSaveCacheData' as const,
                    success: true,
                    data: { type: data.type, cid: data.cid, uid: data.uid, id: null, success: false },
                };
            }
        },
        [cacheCrudService, logger]
    );

    const handleSaveAllCache = useCallback(
        async (message: WebMessageData<'SaveAllCacheData'>) => {
            const data = message.data;
            try {
                const savedIds = await cacheCrudService.saveAll(data);
                return {
                    type: 'OnSaveAllCacheData' as const,
                    success: true,
                    data: {
                        type: data.type,
                        cid: data.cid,
                        uid: data.uid,
                        ids: savedIds,
                        success: true,
                        query: data.query,
                    },
                };
            } catch (e) {
                logger.error('CACHE', `SaveAll error: ${data.type}`, e);
                return {
                    type: 'OnSaveAllCacheData' as const,
                    success: true,
                    data: { type: data.type, cid: data.cid, uid: data.uid, ids: [], success: false },
                };
            }
        },
        [cacheCrudService, logger]
    );

    const handleDeleteCache = useCallback(
        async (message: WebMessageData<'DeleteCacheData'>) => {
            const data = message.data;
            try {
                const deletedId = await cacheCrudService.delete(data);
                return {
                    type: 'OnDeleteCacheData' as const,
                    success: true,
                    data: { type: data.type, cid: data.cid, uid: data.uid, id: deletedId, success: true },
                };
            } catch (e) {
                logger.error('CACHE', `Delete error: ${data.type} ${data.id}`, e);
                return {
                    type: 'OnDeleteCacheData' as const,
                    success: true,
                    data: { type: data.type, cid: data.cid, uid: data.uid, id: null, success: false },
                };
            }
        },
        [cacheCrudService, logger]
    );

    const handleDeleteAllCache = useCallback(
        async (message: WebMessageData<'DeleteAllCacheData'>) => {
            const data = message.data;
            try {
                const deletedIds = await cacheCrudService.deleteAll(data);
                return {
                    type: 'OnDeleteAllCacheData' as const,
                    success: true,
                    data: { type: data.type, cid: data.cid, uid: data.uid, ids: deletedIds, success: true },
                };
            } catch (e) {
                logger.error('CACHE', `DeleteAll error: ${data.type}`, e);
                return {
                    type: 'OnDeleteAllCacheData' as const,
                    success: true,
                    data: { type: data.type, cid: data.cid, uid: data.uid, ids: [], success: false },
                };
            }
        },
        [cacheCrudService, logger]
    );

    const handleClearCache = useCallback(
        async (message: WebMessageData<'ClearCacheData'>) => {
            const data = message.data;
            try {
                await cacheCrudService.clear(data);
                return {
                    type: 'OnClearCacheData' as const,
                    success: true,
                    data: { type: data.type, cid: data.cid, uid: data.uid, success: true },
                };
            } catch (e) {
                logger.error('CACHE', `Clear error: ${data.type}`, e);
                return {
                    type: 'OnClearCacheData' as const,
                    success: true,
                    data: { type: data.type, cid: data.cid, uid: data.uid, success: false },
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
