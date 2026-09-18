import type { CacheModelMap, CacheQueryMap, CacheType, LastChatItem, PagingMeta } from '@chatic/app-messages';

export interface ICacheCrudService {
    /**
     * [Fetch] Fetch a single cache item
     */
    fetch<K extends CacheType>(payload: {
        type: K;
        id: string;
        cid?: string;
        uid?: string;
    }): Promise<CacheModelMap[K] | null>;

    /**
     * [Fetch] Fetch multiple items by an ID list
     *
     * Missing ids are dropped from the result, so the returned length/order don't match `ids`.
     */
    fetchMany<K extends CacheType>(payload: {
        type: K;
        ids: string[];
        cid?: string;
        uid?: string;
    }): Promise<CacheModelMap[K][]>;

    /**
     * [Fetch] Fetch multiple/paginated cache items
     */
    fetchAll<K extends CacheType>(payload: {
        type: K;
        query?: CacheQueryMap[K] & PagingMeta;
        cid?: string;
        uid?: string;
    }): Promise<CacheModelMap[K][]>;

    /**
     * [Fetch] One latest preview per channel plus the max chat_no (chat only, ADR-0057).
     * `null` = cannot answer — the web falls back to a windowed query for just this read.
     */
    fetchLastChats(payload: {
        type: 'chat';
        channelIds: string[];
        cid?: string;
        uid?: string;
    }): Promise<LastChatItem[] | null>;

    /**
     * [Save] Save a single item
     */
    save<K extends CacheType>(payload: {
        type: K;
        id: string;
        item: CacheModelMap[K];
        cid: string;
        uid: string;
    }): Promise<string>;

    /**
     * [Save] Save multiple items in a batch
     */
    saveAll<K extends CacheType>(payload: {
        type: K;
        items: CacheModelMap[K][];
        cid: string;
        uid: string;
        query?: CacheQueryMap[K] & PagingMeta;
    }): Promise<string[]>;

    /**
     * [Delete] Delete a single item
     */
    delete<K extends CacheType>(payload: { type: K; id: string; cid: string; uid: string }): Promise<string>;

    /**
     * [Delete] Delete multiple items in a batch
     */
    deleteAll<K extends CacheType>(payload: { type: K; ids: string[]; cid: string; uid: string }): Promise<string[]>;

    /**
     * [Reset] Delete all data for a specific domain
     */
    clear<K extends CacheType>(payload: { type: K; cid?: string; uid?: string }): Promise<void>;

    /**
     * [Reset] Delete only the rows for one channel (ADR-0067)
     *
     * Currently only accepts chat — other types and an empty channelId are rejected.
     */
    clearByChannel<K extends CacheType>(payload: {
        type: K;
        channelId: string;
        cid?: string;
        uid?: string;
    }): Promise<void>;
}

export interface ICacheSearchService {
    /**
     * [Search] Search cache data
     */
    search(keyword: string, cid?: string, uid?: string): Promise<any[]>;
}
