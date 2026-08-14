import { useCallback } from 'react';
import { useServices } from '../../hooks';
import { provider } from '../../services';
import type { WebMessageData } from '@chatic/app-messages';

export const useCrudCacheHandler = () => {
    const { logService: logger } = useServices();
    // `provider.cacheCrudService` is read inside each callback (not at render) so the SQLite database
    // opens on the first actual cache message, off the boot critical path (boot-optimization.md 4.4).
    // `provider` is a stable module singleton, so the callbacks need not depend on the service.

    const handleFetchAllCache = useCallback(
        async (message: WebMessageData<'FetchAllCacheData'>) => {
            const data = message.data;
            try {
                const items = await provider.cacheCrudService.fetchAll(data);
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
        [logger]
    );

    const handleFetchCache = useCallback(
        async (message: WebMessageData<'FetchCacheData'>) => {
            const data = message.data;
            try {
                const item = await provider.cacheCrudService.fetch(data);
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
        [logger]
    );

    const handleFetchManyCache = useCallback(
        async (message: WebMessageData<'FetchManyCacheData'>) => {
            const data = message.data;
            try {
                const items = await provider.cacheCrudService.fetchMany(data);
                return {
                    type: 'OnFetchManyCacheData' as const,
                    success: true,
                    data: { type: data.type, cid: data.cid, uid: data.uid, ids: data.ids, items },
                };
            } catch (e) {
                logger.error('CACHE', `FetchMany error: ${data.type}`, e);
                return {
                    type: 'OnFetchManyCacheData' as const,
                    success: true,
                    data: { type: data.type, cid: data.cid, uid: data.uid, ids: data.ids, items: null },
                };
            }
        },
        [logger]
    );

    const handleSaveCache = useCallback(
        async (message: WebMessageData<'SaveCacheData'>) => {
            const data = message.data;
            try {
                const savedId = await provider.cacheCrudService.save(data);
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
        [logger]
    );

    const handleSaveAllCache = useCallback(
        async (message: WebMessageData<'SaveAllCacheData'>) => {
            const data = message.data;
            try {
                const savedIds = await provider.cacheCrudService.saveAll(data);
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
        [logger]
    );

    const handleDeleteCache = useCallback(
        async (message: WebMessageData<'DeleteCacheData'>) => {
            const data = message.data;
            try {
                const deletedId = await provider.cacheCrudService.delete(data);
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
        [logger]
    );

    const handleDeleteAllCache = useCallback(
        async (message: WebMessageData<'DeleteAllCacheData'>) => {
            const data = message.data;
            try {
                const deletedIds = await provider.cacheCrudService.deleteAll(data);
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
        [logger]
    );

    const handleClearCache = useCallback(
        async (message: WebMessageData<'ClearCacheData'>) => {
            const data = message.data;
            try {
                await provider.cacheCrudService.clear(data);
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
        [logger]
    );

    return {
        handleFetchAllCache,
        handleFetchCache,
        handleFetchManyCache,
        handleSaveCache,
        handleSaveAllCache,
        handleDeleteCache,
        handleDeleteAllCache,
        handleClearCache,
    };
};
