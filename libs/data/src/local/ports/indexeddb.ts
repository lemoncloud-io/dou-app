import type { CacheQueryOf, CacheTtlMeta, CacheType, ChatMediaKind } from '@chatic/bridge-messages';
import type { CacheSchema } from './cacheStorage';

/**
 * The record type stored in IndexedDB.
 *
 * @template TType the cache domain type (e.g. 'channel', 'chat')
 */
export type IndexedDbRow<TType extends CacheType> = CacheSchema<TType> & {
    meta?: CacheTtlMeta;
    channel_id?: string;
    chat_no?: number;
};

/**
 * One media index entry as an IndexedDB record, in the same store as the chat rows. `channel_id` and
 * `chat_no` are copied from the message's row so the entry can be found and ordered without it.
 */
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

/** Anything the cache store holds. */
export type IndexedDbRecord = IndexedDbRow<CacheType> | IndexedDbChatMediaRow;

/**
 * One message's entries from a room fill. The entries carry no channel or number: those are copied
 * from the chat row the write checks, so they are the row's as it stands, not as the fill read it.
 */
export interface IndexedDbChatMediaFill {
    /** The message's chat row. */
    chatKey: string;
    /** Every entry key of the message. */
    entriesRange: IDBKeyRange;
    entries: Array<Omit<IndexedDbChatMediaRow, 'channel_id' | 'chat_no'>>;
}

/** Writes that land together or not at all: deletes first, then puts, in one `readwrite` transaction. */
export interface IndexedDbWriteBatch {
    deleteKeys?: string[];
    /** Primary-key ranges to delete. */
    deleteRanges?: IDBKeyRange[];
    put?: IndexedDbRecord[];
}

/**
 * Options for a cursor-based query.
 *
 * @template TType the cache domain type
 */
export interface CursorQueryOptions<TType extends CacheType> {
    indexName: string;
    range: IDBKeyRange;
    direction: IDBCursorDirection;
    limit: number;
    /**
     * The filter called as the cursor walks each record.
     *
     * @param item - the record currently being walked
     * @returns whether to include it
     */
    filter: (item: IndexedDbRow<TType>) => boolean;
}

/**
 * The low-level interface shared by everything that talks to IndexedDB.
 */
export interface IIndexedDB {
    /**
     * Inserts or updates a single item.
     */
    save<TType extends CacheType>(item: IndexedDbRow<TType>): Promise<void>;

    /**
     * Inserts or updates several items in one batch.
     */
    saveAll<TType extends CacheType>(items: IndexedDbRow<TType>[]): Promise<void>;

    /**
     * Loads a single item by primary key.
     */
    load<TType extends CacheType>(key: string): Promise<IndexedDbRow<TType> | undefined>;

    /**
     * Loads every matching item through an index.
     * Passing an IDBKeyRange as `key` enables a range scan (a global search that pins only the type and walks every cid, for instance).
     */
    loadAll<TType extends CacheType>(indexName: string, key: IDBValidKey | IDBKeyRange): Promise<IndexedDbRow<TType>[]>;

    /**
     * Runs an optimized paging query through a cursor.
     */
    loadWithCursor<TType extends CacheType>(options: CursorQueryOptions<TType>): Promise<IndexedDbRow<TType>[]>;

    /**
     * Deletes a single record by primary key.
     */
    delete(key: string): Promise<void>;

    /**
     * Deletes the records for several primary keys in one batch.
     */
    deleteAll(keys: string[]): Promise<void>;

    /**
     * Deletes every record matching the condition, through an index.
     */
    clearAll(indexName: string, key: IDBValidKey): Promise<void>;

    /**
     * Deletes every record falling in a range (IDBKeyRange), through an index.
     */
    /** Removes every row in `range` and returns how many were removed. */
    clearByRange(indexName: string, range: IDBKeyRange): Promise<number>;

    /**
     * Walks an index range newest-first and returns the **index key** of the first record after
     * skipping `skip` of them. Returns null when the range holds `skip` records or fewer.
     *
     * Being a key cursor plus advance, it deserializes no values and finishes in a single readonly
     * transaction — so the race in a two-step "count, then read again with that count" query (a record
     * changing in between shifts the boundary) cannot structurally occur.
     */
    findNewestKeyBeyond(indexName: string, range: IDBKeyRange, skip: number): Promise<IDBValidKey | null>;

    /**
     * Applies one batch in a single `readwrite` transaction — a chat row and its media index entries
     * are written this way, so a failed write leaves neither.
     */
    writeBatch(batch: IndexedDbWriteBatch): Promise<void>;

    /**
     * Walks an index range in `direction`, handing each record to `visit` until it returns `false` or
     * the range ends. One `readonly` transaction; for a read whose stopping point depends on what it
     * has seen (a page that must not split a message, plus a look past its end).
     */
    walkIndex<T>(
        indexName: string,
        range: IDBKeyRange,
        direction: IDBCursorDirection,
        visit: (record: T) => boolean
    ): Promise<void>;

    /** How many records an index range holds, without reading them. */
    count(indexName: string, range: IDBKeyRange): Promise<number>;

    /**
     * Applies a room fill in one `readwrite` transaction: for each message, reads its chat row and —
     * only when the row exists and its `data.mediaEntriesVersion` (absent = 0) is below `version` —
     * replaces the message's entries. Never writes a chat row. Answers how many messages were applied.
     */
    applyChatMediaFill(fills: IndexedDbChatMediaFill[], version: number): Promise<number>;
}

/**
 * The executor interface that encapsulates a domain's more involved paging and filtering queries
 * against IndexedDB.
 *
 * @template TType the cache domain type
 */
export interface IndexedDbQueryExecutor<TType extends CacheType> {
    /**
     * Loads IndexedDB records for the given query.
     *
     * @param db the low-level IndexedDB database interface
     * @param scope the read scope holding type, cid and uid
     * @param options the domain's query options
     */
    execute(
        db: IIndexedDB,
        scope: { type: TType; cid: string; uid: string },
        options?: CacheQueryOf<TType>
    ): Promise<IndexedDbRow<TType>[]>;
}
