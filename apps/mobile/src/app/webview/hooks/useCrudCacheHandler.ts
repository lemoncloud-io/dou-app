import { useCallback } from 'react';
import { useServices } from '../../hooks';
import type { WebMessageAppHandler, WebMessageAppResponse } from '@chatic/app-messages';

export const useCrudCacheHandler = () => {
    const { cacheCrudService, logService: logger } = useServices();

    const handleFetchAllCache = useCallback<WebMessageAppHandler<'FetchAllCacheData'>>(
        async message => {
            const data = message.data;
            try {
                const items = await cacheCrudService.fetchAll(data);
                return {
                    type: 'OnFetchAllCacheData' as const,
                    success: true,
                    data: { type: data.type, cid: data.cid, uid: data.uid, items, query: data.query },
                } as WebMessageAppResponse<'FetchAllCacheData'>;
            } catch (e) {
                logger.error('CACHE', `FetchAll error: ${data.type}`, e);
                return {
                    type: 'OnFetchAllCacheData' as const,
                    success: true,
                    data: { type: data.type, cid: data.cid, uid: data.uid, items: null },
                } as WebMessageAppResponse<'FetchAllCacheData'>;
            }
        },
        [cacheCrudService, logger]
    );

    const handleFetchCache = useCallback<WebMessageAppHandler<'FetchCacheData'>>(
        async message => {
            const data = message.data;
            try {
                const item = await cacheCrudService.fetch(data);
                return {
                    type: 'OnFetchCacheData' as const,
                    success: true,
                    data: { type: data.type, cid: data.cid, uid: data.uid, id: data.id, item },
                } as WebMessageAppResponse<'FetchCacheData'>;
            } catch (e) {
                logger.error('CACHE', `Fetch error: ${data.type} ${data.id}`, e);
                return {
                    type: 'OnFetchCacheData' as const,
                    success: true,
                    data: { type: data.type, cid: data.cid, uid: data.uid, id: data.id, item: null },
                } as WebMessageAppResponse<'FetchCacheData'>;
            }
        },
        [cacheCrudService, logger]
    );

    const handleSaveCache = useCallback<WebMessageAppHandler<'SaveCacheData'>>(
        async message => {
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

    const handleSaveAllCache = useCallback<WebMessageAppHandler<'SaveAllCacheData'>>(
        async message => {
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

    const handleDeleteCache = useCallback<WebMessageAppHandler<'DeleteCacheData'>>(
        async message => {
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

    const handleDeleteAllCache = useCallback<WebMessageAppHandler<'DeleteAllCacheData'>>(
        async message => {
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

    const handleClearCache = useCallback<WebMessageAppHandler<'ClearCacheData'>>(
        async message => {
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
