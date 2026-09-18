import type { LastChatItem } from '@chatic/app-messages';

/**
 * Interface for every local cache data source.
 * Standardizes the data access logic for each domain (Chat, User, etc.).
 *
 * @template T - the type of the actual data model to cache (e.g. CacheChatView)
 * @template Q - domain-specific filter/paging conditions used for `fetchAll` (default: void)
 */
export interface ICacheDataSource<T, Q = void> {
    /**
     * Fetches a single cached data item.
     *
     * @param id - the unique ID of the data to fetch (e.g. message ID, user ID)
     * @param cid - (optional) Cloud ID for data isolation
     * @param uid - (optional) User ID for data isolation
     * @returns the fetched data object, or `null` if it doesn't exist
     */
    fetch: (id: string, cid?: string, uid?: string) => Promise<T | null>;

    /**
     * Fetches multiple items in one pass from a list of ids. (Equivalent to calling `fetch` per id.)
     *
     * Missing ids are dropped from the result, so the returned length and order don't match `ids`.
     * The caller re-indexes by id.
     *
     * Optional to implement — if absent, `CacheCrudService` fills in by calling `fetch` repeatedly.
     * Either way the bridge round trip is 1, so not implementing this doesn't break the performance goal.
     *
     * @param ids - array of unique IDs of the data to fetch
     * @param cid - (optional) Cloud ID for data isolation
     * @param uid - (optional) User ID for data isolation
     */
    fetchMany?: (ids: string[], cid?: string, uid?: string) => Promise<T[]>;

    /**
     * Fetches multiple (a list of) cached data items matching the given conditions.
     *
     * @param cid - (optional) Cloud ID for data isolation
     * @param query - (optional) domain-specific filtering, sorting, and paging conditions (e.g. channel ID, limit, etc.)
     * @param uid - (optional) User ID for data isolation
     * @returns the array of fetched data
     */
    fetchAll: (cid?: string, query?: Q, uid?: string) => Promise<T[]>;

    /**
     * Saves a single data item to the cache. (Updates/upserts if it already exists.)
     *
     * @param id - the unique ID of the data to save
     * @param item - the data model object to save
     * @param cid - the Cloud ID the data belongs to (required)
     * @param uid - the User ID the data belongs to (required)
     */
    save: (id: string, item: T, cid: string, uid: string) => Promise<void>;

    /**
     * Saves multiple data items to the cache in a batch for performance. (Upsert)
     *
     * @param items - array of objects containing the data identifier (`id`) and the actual model (`data`) to save
     * @param cid - the Cloud ID the data belongs to (required)
     * @param uid - the User ID the data belongs to (required)
     */
    saveAll: (items: { id: string; data: T }[], cid: string, uid: string) => Promise<void>;

    /**
     * Removes a single data item from the cache.
     *
     * @param id - the unique ID of the data to remove
     * @param cid - the Cloud ID the data belongs to (required)
     * @param uid - the User ID the data belongs to (required)
     */
    remove: (id: string, cid: string, uid: string) => Promise<void>;

    /**
     * Removes multiple data items from the cache in a batch.
     *
     * @param ids - array of unique IDs of the data to remove
     * @param cid - the Cloud ID the data belongs to (required)
     * @param uid - the User ID the data belongs to (required)
     */
    removeAll: (ids: string[], cid: string, uid: string) => Promise<void>;

    /**
     * Completely resets (deletes) all cached data for this data source (table).
     * Caution: this wipes all data for the domain regardless of cid.
     */
    clear: (cid?: string, uid?: string) => Promise<void>;
}

/**
 * Extension specific to chat.
 *
 * - `fetchLastPerChannel` — batch-fetches, per channel, one latest preview row plus the max
 *   chat_no (ADR-0057). The home channel list's `FetchLastChatsData` is answered by this one method.
 * - `clearByChannel` — removes only the rows for one channel (ADR-0067). Leaving a room should also
 *   make that room's messages disappear, which `clear` (which wipes the whole scope) can't express.
 *
 * Both are an extension rather than part of the common interface because neither applies to, or is
 * called from, domains other than chat.
 */
export interface IChatCacheDataSource<T, Q = void> extends ICacheDataSource<T, Q> {
    fetchLastPerChannel: (channelIds: string[], cid?: string, uid?: string) => Promise<LastChatItem[]>;
    clearByChannel: (channelId: string, cid?: string, uid?: string) => Promise<void>;
}
