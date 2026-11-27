import type { CacheQueryOf, CacheTtlMeta, CacheType, ChatMediaKind } from '@chatic/bridge-messages';
import type { CacheSchema } from './cacheStorage';

export type IndexedDbRow<TType extends CacheType> = CacheSchema<TType> & {
    meta?: CacheTtlMeta;
    channel_id?: string;
    chat_no?: number;
};

export interface IndexedDbChatMediaRow {
    key: string;
    type: 'chatmedia';
    cid: string;
    uid: string;
    channel_id: string;
    chat_no: number;
    kind: ChatMediaKind;
    chat_id: string;
    idx: number;
    ref: string;
}

export type IndexedDbRecord = IndexedDbRow<CacheType> | IndexedDbChatMediaRow;

export interface IndexedDbChatMediaFill {
    chatKey: string;
    entriesRange: IDBKeyRange;
    entries: Array<Omit<IndexedDbChatMediaRow, 'channel_id' | 'chat_no'>>;
}

export interface IndexedDbWriteBatch {
    deleteKeys?: string[];
    deleteRanges?: IDBKeyRange[];
    put?: IndexedDbRecord[];
}

export interface CursorQueryOptions<TType extends CacheType> {
    indexName: string;
    range: IDBKeyRange;
    direction: IDBCursorDirection;
    limit: number;
    filter: (item: IndexedDbRow<TType>) => boolean;
}

export interface IIndexedDB {
    save<TType extends CacheType>(item: IndexedDbRow<TType>): Promise<void>;

    saveAll<TType extends CacheType>(items: IndexedDbRow<TType>[]): Promise<void>;

    load<TType extends CacheType>(key: string): Promise<IndexedDbRow<TType> | undefined>;

    loadAll<TType extends CacheType>(indexName: string, key: IDBValidKey | IDBKeyRange): Promise<IndexedDbRow<TType>[]>;

    loadWithCursor<TType extends CacheType>(options: CursorQueryOptions<TType>): Promise<IndexedDbRow<TType>[]>;

    delete(key: string): Promise<void>;

    deleteAll(keys: string[]): Promise<void>;

    clearAll(indexName: string, key: IDBValidKey): Promise<void>;

    clearByRange(indexName: string, range: IDBKeyRange): Promise<number>;

    findNewestKeyBeyond(indexName: string, range: IDBKeyRange, skip: number): Promise<IDBValidKey | null>;

    writeBatch(batch: IndexedDbWriteBatch): Promise<void>;

    walkIndex<T>(
        indexName: string,
        range: IDBKeyRange,
        direction: IDBCursorDirection,
        visit: (record: T) => boolean
    ): Promise<void>;

    count(indexName: string, range: IDBKeyRange): Promise<number>;

    applyChatMediaFill(fills: IndexedDbChatMediaFill[], version: number): Promise<number>;
}

export interface IndexedDbQueryExecutor<TType extends CacheType> {
    execute(
        db: IIndexedDB,
        scope: { type: TType; cid: string; uid: string },
        options?: CacheQueryOf<TType>
    ): Promise<IndexedDbRow<TType>[]>;
}
