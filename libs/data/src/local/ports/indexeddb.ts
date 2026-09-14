import type { CacheQueryOf, CacheTtlMeta, CacheType } from '@chatic/app-messages';
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
