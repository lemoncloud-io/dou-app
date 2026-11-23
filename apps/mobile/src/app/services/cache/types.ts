import type {
    CacheModelMap,
    CacheQueryMap,
    CacheType,
    ChatMediaCounts,
    ChatMediaFillItem,
    ChatMediaKind,
    ChatMediaPage,
    LastChatItem,
    PagingMeta,
} from '@chatic/bridge-messages';

export interface ICacheCrudService {
    fetch<K extends CacheType>(payload: {
        type: K;
        id: string;
        cid?: string;
        uid?: string;
    }): Promise<CacheModelMap[K] | null>;

    fetchMany<K extends CacheType>(payload: {
        type: K;
        ids: string[];
        cid?: string;
        uid?: string;
    }): Promise<CacheModelMap[K][]>;

    fetchAll<K extends CacheType>(payload: {
        type: K;
        query?: CacheQueryMap[K] & PagingMeta;
        cid?: string;
        uid?: string;
    }): Promise<CacheModelMap[K][]>;

    fetchLastChats(payload: {
        type: 'chat';
        channelIds: string[];
        cid?: string;
        uid?: string;
    }): Promise<LastChatItem[] | null>;

    fetchChatMedia(payload: {
        type: 'chat';
        channelId: string;
        kind: ChatMediaKind;
        cursorNo?: number;
        limit: number;
        cid: string;
        uid: string;
    }): Promise<ChatMediaPage>;

    countChatMedia(payload: { type: 'chat'; channelId: string; cid: string; uid: string }): Promise<ChatMediaCounts>;

    saveChatMedia(payload: {
        type: 'chat';
        items: ChatMediaFillItem[];
        version: number;
        cid: string;
        uid: string;
    }): Promise<void>;

    save<K extends CacheType>(payload: {
        type: K;
        id: string;
        item: CacheModelMap[K];
        cid: string;
        uid: string;
    }): Promise<string>;

    saveAll<K extends CacheType>(payload: {
        type: K;
        items: CacheModelMap[K][];
        cid: string;
        uid: string;
        query?: CacheQueryMap[K] & PagingMeta;
    }): Promise<string[]>;

    delete<K extends CacheType>(payload: { type: K; id: string; cid: string; uid: string }): Promise<string>;

    deleteAll<K extends CacheType>(payload: { type: K; ids: string[]; cid: string; uid: string }): Promise<string[]>;

    clear<K extends CacheType>(payload: { type: K; cid?: string; uid?: string }): Promise<void>;

    clearByChannel<K extends CacheType>(payload: {
        type: K;
        channelId: string;
        cid?: string;
        uid?: string;
    }): Promise<void>;
}

export interface ICacheSearchService {
    search(keyword: string, cid?: string, uid?: string): Promise<any[]>;
}
