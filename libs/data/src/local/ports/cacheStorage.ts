import type { CacheModelOf, CacheQueryOf, CacheType, LastChatItem } from '@chatic/app-messages';
import type { DataContextProvider } from '../../repositories/types';

/**
 * The interface an actual storage implementation (IndexedDB, native, …) has to satisfy.
 * Every factory type above it connects through this interface.
 *
 * @template TType the cache domain type (e.g. 'channel', 'chat')
 */
export interface CacheStorage<TType extends CacheType> {
    save(id: string, item: CacheModelOf<TType>): Promise<CacheModelOf<TType>>;
    saveAll(items: CacheModelOf<TType>[]): Promise<CacheModelOf<TType>[]>;
    load(id: string): Promise<CacheModelOf<TType> | null>;
    /**
     * Reads several rows by a list of ids. The result is the same as calling `load` per id.
     *
     * Ids that are absent are omitted from the result, so **the returned length and order do not match
     * `ids`.** Callers have to re-index by id, e.g. `new Map(items.map(item => [item.id, item]))`.
     * Pairing by position (`items[index]`) shifts everything after the first missing id.
     */
    loadMany(ids: string[]): Promise<CacheModelOf<TType>[]>;
    loadAll(options?: CacheQueryOf<TType>): Promise<CacheModelOf<TType>[]>;
    delete(id: string): Promise<void>;
    deleteAll(ids: string[]): Promise<void>;
    clearAll(): Promise<void>;
    clearByChannelId(channelId: string): Promise<void>;
    /**
     * Reads, in one call, the latest preview per channel plus that channel's maximum chatNo (chat
     * only, ADR-0057).
     *
     * Implementing it is optional. `null` means "this storage cannot provide this query" — an adapter
     * that does not implement it (IndexedDB), an older app that does not know this message, and a
     * transient native error all land here — and the caller (`ChatLocalDataSource`) falls back to a
     * per-channel windowed read. Why IndexedDB does not implement it: the fallback path is in-process
     * with no round-trip cost, so it is already the best option, and keeping two copies of the decision
     * logic would only let the semantics drift.
     *
     * The returned array guarantees neither the requested order nor length — the caller re-indexes by
     * channelId.
     */
    loadLastPerChannel?(channelIds: string[]): Promise<LastChatItem[] | null>;
}

/**
 * Shorthand for the model type held in a cache store.
 */
export type CacheStorageItem<TType extends CacheType> = CacheModelOf<TType>;

/**
 * The base schema for a record stored in the database.
 *
 * @template TType the cache domain type
 */
export interface CacheSchema<TType extends CacheType> {
    key: string; // Primary key (e.g., "channel:cid:uid:id")
    type: TType; // CacheType (e.g., "channel")
    cid: string;
    uid: string;
    id: string; // Original ID
    data: CacheModelOf<TType>;
}

export type CacheStorageFactory = <TType extends CacheType>(
    type: TType,
    contextProvider: DataContextProvider
) => CacheStorage<TType>;

export interface LocalCacheStorages {
    channel: CacheStorage<'channel'>;
    chat: CacheStorage<'chat'>;
    inviteCloud: CacheStorage<'invitecloud'>;
    join: CacheStorage<'join'>;
    profile: CacheStorage<'profile'>;
    site: CacheStorage<'site'>;
    user: CacheStorage<'user'>;
    meta: CacheStorage<'meta'>;
    invite: CacheStorage<'invite'>;
}

export const createCacheStorages = (
    contextProvider: DataContextProvider,
    storageFactory: CacheStorageFactory
): LocalCacheStorages => ({
    channel: storageFactory('channel', contextProvider),
    chat: storageFactory('chat', contextProvider),
    inviteCloud: storageFactory('invitecloud', contextProvider),
    join: storageFactory('join', contextProvider),
    profile: storageFactory('profile', contextProvider),
    site: storageFactory('site', contextProvider),
    user: storageFactory('user', contextProvider),
    meta: storageFactory('meta', contextProvider),
    invite: storageFactory('invite', contextProvider),
});
