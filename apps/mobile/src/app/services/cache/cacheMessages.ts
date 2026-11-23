import type { WebMessageData } from '@chatic/bridge-messages';

import type { ILogService } from '../log';
import type { ICacheCrudService, ICacheSearchService } from './types';

export interface CacheMessageServices {
    crud(): ICacheCrudService;
    search(): ICacheSearchService;
    logger: ILogService;
}

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

    FetchChatMediaCacheData: async (message: WebMessageData<'FetchChatMediaCacheData'>) => {
        const data = message.data;
        const base = { type: data.type, cid: data.cid, uid: data.uid, channelId: data.channelId, kind: data.kind };
        try {
            const page = await crud().fetchChatMedia(data);
            return {
                type: 'OnFetchChatMediaCacheData' as const,
                success: true,
                data: { ...base, items: page.items, nextCursorNo: page.nextCursorNo },
            };
        } catch (e) {
            logger.error('CACHE', `FetchChatMedia error: ${data.kind}`, e);
            return {
                type: 'OnFetchChatMediaCacheData' as const,
                success: true,
                data: { ...base, items: null, nextCursorNo: null },
            };
        }
    },

    CountChatMediaCacheData: async (message: WebMessageData<'CountChatMediaCacheData'>) => {
        const data = message.data;
        const base = { type: data.type, cid: data.cid, uid: data.uid, channelId: data.channelId };
        try {
            const counts = await crud().countChatMedia(data);
            return { type: 'OnCountChatMediaCacheData' as const, success: true, data: { ...base, counts } };
        } catch (e) {
            logger.error('CACHE', 'CountChatMedia error', e);
            return { type: 'OnCountChatMediaCacheData' as const, success: true, data: { ...base, counts: null } };
        }
    },

    SaveChatMediaCacheData: async (message: WebMessageData<'SaveChatMediaCacheData'>) => {
        const data = message.data;
        const base = { type: data.type, cid: data.cid, uid: data.uid };
        try {
            await crud().saveChatMedia(data);
            return { type: 'OnSaveChatMediaCacheData' as const, success: true, data: { ...base, success: true } };
        } catch (e) {
            logger.error('CACHE', 'SaveChatMedia error', e);
            return { type: 'OnSaveChatMediaCacheData' as const, success: true, data: { ...base, success: false } };
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
                error: { code: 'SEARCH_ERROR', message: (e as { message?: string }).message },
            };
        }
    },
});

export type CacheMessageHandlers = ReturnType<typeof createCacheMessageHandlers>;

export type CacheMessageType = keyof CacheMessageHandlers;
