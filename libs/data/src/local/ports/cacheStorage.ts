import type { CacheModelOf, CacheQueryOf, CacheType, LastChatItem } from '@chatic/app-messages';
import type { DataContext, DataContextProvider } from '../../repositories/types';
import { stableHash } from '../stableHash';
import { resolveScopedContext } from './policy';

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

/**
 * One cache slot, handing out the storage for a given scope.
 *
 * **Why the scope is an argument.** An adapter picks its partition by asking its context provider at
 * call time. Handed the live provider, that means "whatever scope is current when the call lands" —
 * so a repository could capture its scope before a remote call and still have the answer written
 * wherever the session had moved on to. A cloud switch mid-refresh wrote cloud A's rows into cloud
 * B's partition (stamped `cid: A`), and a mid-sync switch let the stale prune read cloud B and delete
 * its channels. Asking the slot for a scope's storage is what makes the captured scope the one the
 * adapter sees.
 *
 * Only `cid` and `uid` are read — together they ARE the partition (`AdapterScope`). A context with no
 * `uid` gets a storage whose adapter has no scope and skips every operation, which is the
 * no-session rule `resolveBaseScope` states, unchanged.
 */
export interface ScopedCacheStorage<TType extends CacheType> {
    forScope(context: DataContext): CacheStorage<TType>;
}

/**
 * Builds a slot that creates one storage per partition, on first use, and reuses it afterwards.
 *
 * The memo is keyed by the RESOLVED partition (`resolveScopedContext`), not by the raw context, so
 * contexts that land in the same partition share one instance — every context for `invitecloud`,
 * whose partition is fixed, and every uid-less context, which has none. Reuse is not only thrift: a
 * native adapter coalesces identical reads that are in flight at once, and it can only do that
 * across callers that share the instance.
 *
 * The map is not evicted. It holds one small object per partition the session has touched — one per
 * account and cloud visited — which stays small for the lifetime of a session.
 *
 * @param initialContext When given, the storage for this scope is built immediately (see
 *   {@link createCacheStorages} for why).
 */
export const createScopedCacheStorage = <TType extends CacheType>(
    type: TType,
    storageFactory: CacheStorageFactory,
    initialContext?: DataContext
): ScopedCacheStorage<TType> => {
    const byPartition = new Map<string, CacheStorage<TType>>();

    const forScope = (context: DataContext): CacheStorage<TType> => {
        // A fixed provider, so the adapter's call-time read answers with THIS scope for the storage's
        // whole life. Nothing but cid/uid is carried: they are all an adapter reads. Built here rather
        // than with the repository layer's snapshot helper so this port depends on types alone.
        const scope: DataContext = { cid: context.cid, uid: context.uid };
        const provider: DataContextProvider = { getContext: () => scope, setContext: () => undefined };
        const partitionKey = stableHash(resolveScopedContext(type, provider));
        let storage = byPartition.get(partitionKey);
        if (!storage) {
            storage = storageFactory(type, provider);
            byPartition.set(partitionKey, storage);
        }
        return storage;
    };

    if (initialContext) forScope(initialContext);
    return { forScope };
};

export interface LocalCacheStorages {
    channel: ScopedCacheStorage<'channel'>;
    chat: ScopedCacheStorage<'chat'>;
    inviteCloud: ScopedCacheStorage<'invitecloud'>;
    join: ScopedCacheStorage<'join'>;
    profile: ScopedCacheStorage<'profile'>;
    site: ScopedCacheStorage<'site'>;
    user: ScopedCacheStorage<'user'>;
    meta: ScopedCacheStorage<'meta'>;
    invite: ScopedCacheStorage<'invite'>;
}

/**
 * Assembles every cache slot.
 *
 * Each slot builds the storage for the scope current at assembly straight away. Nothing treats that
 * storage specially — it is simply the first entry of the slot's memo — but building it here keeps
 * the factory being called once per slot, in slot order, while the assembler is watching: that is
 * what the assembler's routing fingerprint (the stamp that retires sync cursors when a domain's
 * store moves) and its native-fallback report count. Left lazy, both would see nothing and the
 * fingerprint check would switch itself off.
 */
export const createCacheStorages = (
    contextProvider: DataContextProvider,
    storageFactory: CacheStorageFactory
): LocalCacheStorages => {
    const initialContext = contextProvider.getContext();
    const slot = <TType extends CacheType>(type: TType): ScopedCacheStorage<TType> =>
        createScopedCacheStorage(type, storageFactory, initialContext);
    return {
        channel: slot('channel'),
        chat: slot('chat'),
        inviteCloud: slot('invitecloud'),
        join: slot('join'),
        profile: slot('profile'),
        site: slot('site'),
        user: slot('user'),
        meta: slot('meta'),
        invite: slot('invite'),
    };
};
