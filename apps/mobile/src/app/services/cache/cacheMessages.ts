import type { WebMessageData } from '@chatic/bridge-messages';

import type { ILogService } from '../log';
import type { ICacheCrudService, ICacheSearchService } from './types';

/**
 * What the cache's messages are answered with. Getters, not the services themselves: the SQLite
 * database opens on the first cache message that reaches a service, off the boot's critical path.
 */
export interface CacheMessageServices {
    crud(): ICacheCrudService;
    search(): ICacheSearchService;
    logger: ILogService;
}

/**
 * How the cache's messages are answered on this device — once, for every caller. The WebView's
 * handlers answer the page with these, and the runtime in this process reaches the same SQLite through
 * them too, so the two can never read or write the cache differently.
 *
 * A failed read or write is answered, not thrown: `success: true` with an empty result (`items: null`,
 * `id: null`, `success: false` in the payload). The web reads `null` as "fall back for this read
 * only", and learns a message is unsupported only from a missing handler (older app builds). Search is
 * the exception: its failure is `success: false`, which a bridge client turns into a rejection.
 */
export const createCacheMessageHandlers = ({ crud, search, logger }: CacheMessageServices) => ({
    FetchAllCacheData: async (message: WebMessageData<'FetchAllCacheData'>) => {
        const data = message.data;
        try {
            const items = await crud().fetchAll(data);
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

    FetchCacheData: async (message: WebMessageData<'FetchCacheData'>) => {
        const data = message.data;
        try {
            const item = await crud().fetch(data);
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

    FetchLastChatsData: async (message: WebMessageData<'FetchLastChatsData'>) => {
        const data = message.data;
        try {
            const items = await crud().fetchLastChats(data);
            return {
                type: 'OnFetchLastChatsData' as const,
                success: true,
                data: { type: data.type, cid: data.cid, uid: data.uid, channelIds: data.channelIds, items },
            };
        } catch (e) {
            logger.error('CACHE', `FetchLastChats error`, e);
            return {
                type: 'OnFetchLastChatsData' as const,
                success: true,
                data: { type: data.type, cid: data.cid, uid: data.uid, channelIds: data.channelIds, items: null },
            };
        }
    },

    FetchManyCacheData: async (message: WebMessageData<'FetchManyCacheData'>) => {
        const data = message.data;
        try {
            const items = await crud().fetchMany(data);
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

    SaveCacheData: async (message: WebMessageData<'SaveCacheData'>) => {
        const data = message.data;
        try {
            const savedId = await crud().save(data);
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

    SaveAllCacheData: async (message: WebMessageData<'SaveAllCacheData'>) => {
        const data = message.data;
        try {
            const savedIds = await crud().saveAll(data);
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

    DeleteCacheData: async (message: WebMessageData<'DeleteCacheData'>) => {
        const data = message.data;
        try {
            const deletedId = await crud().delete(data);
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

    DeleteAllCacheData: async (message: WebMessageData<'DeleteAllCacheData'>) => {
        const data = message.data;
        try {
            const deletedIds = await crud().deleteAll(data);
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

    ClearCacheData: async (message: WebMessageData<'ClearCacheData'>) => {
        const data = message.data;
        try {
            await crud().clear(data);
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

    ClearCacheDataByChannel: async (message: WebMessageData<'ClearCacheDataByChannel'>) => {
        const data = message.data;
        try {
            await crud().clearByChannel(data);
            return {
                type: 'OnClearCacheDataByChannel' as const,
                success: true,
                data: { type: data.type, cid: data.cid, uid: data.uid, channelId: data.channelId, success: true },
            };
        } catch (e) {
            logger.error('CACHE', `ClearByChannel error: ${data.type}`, e);
            return {
                type: 'OnClearCacheDataByChannel' as const,
                success: true,
                data: { type: data.type, cid: data.cid, uid: data.uid, channelId: data.channelId, success: false },
            };
        }
    },

    SearchGlobalCacheData: async (message: WebMessageData<'SearchGlobalCacheData'>) => {
        const { keyword, cid, uid } = message.data;
        try {
            const items = await search().search(keyword, cid, uid);
            return { type: 'OnSearchGlobalCacheData' as const, success: true, data: { items } };
        } catch (e) {
            logger.error('CACHE', `Search execution failed for keyword: ${keyword}`, e);
            return {
                type: 'OnSearchGlobalCacheData' as const,
                success: false,
                // `message` exactly as the WebView handler always sent it: a thrown value's own `message`.
                error: { code: 'SEARCH_ERROR', message: (e as { message?: string }).message },
            };
        }
    },
});

export type CacheMessageHandlers = ReturnType<typeof createCacheMessageHandlers>;

/** The messages the cache answers — every one a page's cache adapters and global search send. */
export type CacheMessageType = keyof CacheMessageHandlers;
