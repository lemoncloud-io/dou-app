import type {
    OnClearCacheDataByChannelPayload,
    OnClearCacheDataPayload,
    OnCountChatMediaCacheDataPayload,
    OnDeleteAllCacheDataPayload,
    OnDeleteCacheDataPayload,
    OnFetchAllCacheDataPayload,
    OnFetchCacheDataPayload,
    OnFetchChatMediaCacheDataPayload,
    OnFetchLastChatsDataPayload,
    OnFetchManyCacheDataPayload,
    OnSaveAllCacheDataPayload,
    OnSaveCacheDataPayload,
    OnSaveChatMediaCacheDataPayload,
    OnSearchGlobalCacheDataPayload,
} from '../model';

export type CacheAppMessageDataMap = {
    OnFetchAllCacheData: OnFetchAllCacheDataPayload;
    OnFetchCacheData: OnFetchCacheDataPayload;
    OnFetchManyCacheData: OnFetchManyCacheDataPayload;
    OnFetchLastChatsData: OnFetchLastChatsDataPayload;
    OnSaveCacheData: OnSaveCacheDataPayload;
    OnSaveAllCacheData: OnSaveAllCacheDataPayload;
    OnDeleteCacheData: OnDeleteCacheDataPayload;
    OnDeleteAllCacheData: OnDeleteAllCacheDataPayload;
    OnClearCacheData: OnClearCacheDataPayload;
    OnClearCacheDataByChannel: OnClearCacheDataByChannelPayload;
    OnSearchGlobalCacheData: OnSearchGlobalCacheDataPayload;
    OnFetchChatMediaCacheData: OnFetchChatMediaCacheDataPayload;
    OnCountChatMediaCacheData: OnCountChatMediaCacheDataPayload;
    OnSaveChatMediaCacheData: OnSaveChatMediaCacheDataPayload;
};
