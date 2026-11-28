import type { CacheBasePayload } from './base-payload';
import type { CacheType, PagingMeta } from './domain';
import type { CacheQueryMap } from './queries';
import type { CacheChannelView, CacheChatView, CacheModelMap, CacheSiteView } from './views';

export type FetchCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { id: string };
}[CacheType];

export type OnFetchCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { id: string; item: CacheModelMap[K] | null };
}[CacheType];

export type FetchManyCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { ids: string[] };
}[CacheType];

export type OnFetchManyCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { ids: string[]; items: CacheModelMap[K][] | null };
}[CacheType];

export type FetchLastChatsDataPayload = CacheBasePayload<'chat'> & { channelIds: string[] };

export interface LastChatItem {
    channelId: string;
    lastNo: number;
    item: CacheChatView | null;
    activityItem?: CacheChatView | null;
}

export type OnFetchLastChatsDataPayload = CacheBasePayload<'chat'> & {
    channelIds: string[];
    items: LastChatItem[] | null;
};

export type FetchAllCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & {
        query?: CacheQueryMap[K] & PagingMeta;
    };
}[CacheType];

export type OnFetchAllCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & {
        items: CacheModelMap[K][] | null;
        query?: CacheQueryMap[K] & PagingMeta;
    };
}[CacheType];

export type SaveCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { id: string; item: CacheModelMap[K] };
}[CacheType];

export type OnSaveCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { id: string | null; success: boolean };
}[CacheType];

export type SaveAllCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & {
        query?: CacheQueryMap[K] & PagingMeta;
        items: CacheModelMap[K][];
    };
}[CacheType];

export type OnSaveAllCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & {
        ids: string[];
        success: boolean;
        query?: CacheQueryMap[K] & PagingMeta;
    };
}[CacheType];

export type DeleteCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { id: string };
}[CacheType];

export type OnDeleteCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { id: string | null; success: boolean };
}[CacheType];

export type DeleteAllCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { ids: string[] };
}[CacheType];

export type OnDeleteAllCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { ids: string[]; success: boolean };
}[CacheType];

export type ClearCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K>;
}[CacheType];

export type OnClearCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { success: boolean };
}[CacheType];

export type ClearCacheDataByChannelPayload = {
    [K in CacheType]: CacheBasePayload<K> & { channelId: string };
}[CacheType];

export type OnClearCacheDataByChannelPayload = {
    [K in CacheType]: CacheBasePayload<K> & { channelId: string; success: boolean };
}[CacheType];

export type SearchGlobalCacheDataPayload = {
    keyword: string;
    cid?: string;
    uid?: string;
};

export type OnSearchGlobalCacheDataPayload = {
    items: (CacheChatView | CacheChannelView | CacheSiteView)[];
};
