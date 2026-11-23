import type {
    ChatMediaCounts,
    ChatMediaFillItem,
    ChatMediaKind,
    ChatMediaPage,
    LastChatItem,
} from '@chatic/bridge-messages';

export interface ICacheDataSource<T, Q = void> {
    fetch: (id: string, cid?: string, uid?: string) => Promise<T | null>;

    fetchMany?: (ids: string[], cid?: string, uid?: string) => Promise<T[]>;

    fetchAll: (cid?: string, query?: Q, uid?: string) => Promise<T[]>;

    save: (id: string, item: T, cid: string, uid: string) => Promise<void>;

    saveAll: (items: { id: string; data: T }[], cid: string, uid: string) => Promise<void>;

    remove: (id: string, cid: string, uid: string) => Promise<void>;

    removeAll: (ids: string[], cid: string, uid: string) => Promise<void>;

    clear: (cid?: string, uid?: string) => Promise<void>;
}

export interface IChatCacheDataSource<T, Q = void> extends ICacheDataSource<T, Q> {
    fetchLastPerChannel: (channelIds: string[], cid?: string, uid?: string) => Promise<LastChatItem[]>;
    clearByChannel: (channelId: string, cid?: string, uid?: string) => Promise<void>;
    fetchMediaPage: (
        query: { channelId: string; kind: ChatMediaKind; cursorNo?: number; limit: number },
        cid: string,
        uid: string
    ) => Promise<ChatMediaPage>;
    countMedia: (channelId: string, cid: string, uid: string) => Promise<ChatMediaCounts>;
    saveMediaFill: (items: ChatMediaFillItem[], version: number, cid: string, uid: string) => Promise<void>;
}
