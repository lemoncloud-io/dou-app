import type {
    ClearCacheDataByChannelPayload,
    ClearCacheDataPayload,
    CountChatMediaCacheDataPayload,
    DeleteAllCacheDataPayload,
    DeleteCacheDataPayload,
    FetchAllCacheDataPayload,
    FetchCacheDataPayload,
    FetchChatMediaCacheDataPayload,
    FetchLastChatsDataPayload,
    FetchManyCacheDataPayload,
    SaveAllCacheDataPayload,
    SaveCacheDataPayload,
    SaveChatMediaCacheDataPayload,
    SearchGlobalCacheDataPayload,
} from '../model';

export type CacheWebMessagePayloadMap = {
    FetchCacheData: FetchCacheDataPayload;
    FetchManyCacheData: FetchManyCacheDataPayload;
    FetchLastChatsData: FetchLastChatsDataPayload;
    FetchAllCacheData: FetchAllCacheDataPayload;
    SaveCacheData: SaveCacheDataPayload;
    SaveAllCacheData: SaveAllCacheDataPayload;
    DeleteCacheData: DeleteCacheDataPayload;
    DeleteAllCacheData: DeleteAllCacheDataPayload;
    ClearCacheData: ClearCacheDataPayload;
    ClearCacheDataByChannel: ClearCacheDataByChannelPayload;
    SearchGlobalCacheData: SearchGlobalCacheDataPayload;
    FetchChatMediaCacheData: FetchChatMediaCacheDataPayload;
    CountChatMediaCacheData: CountChatMediaCacheDataPayload;
    SaveChatMediaCacheData: SaveChatMediaCacheDataPayload;
};
