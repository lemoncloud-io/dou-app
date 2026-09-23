import type { CacheType } from '@chatic/app-messages';
import type { DataContextProvider } from '../../../repositories/types';
import type { CacheStorage, CacheStorageFactory, ScopedCacheStorage } from '../../ports';
import { createScopedCacheStorage, resolveScopedContext } from '../../ports';

/**
 * The in-memory cache every local suite runs on: a slot with real partitions — one map per resolved
 * `(cid, uid)`, and no storage at all for a uid-less scope, the rule the production adapters apply.
 *
 * It is assembled by the production `createScopedCacheStorage`, so the routing under test is the
 * real one; only the rows live in memory. `slot.forScope(context)` returns the very storage a data
 * source uses for that context — which is how a test seeds a partition, reads one back, or spies on
 * a storage call.
 *
 * Shared rather than written per suite, and a state-holding map rather than `jest.fn()` doubles: a
 * double only records the arguments a write was called with, which is not the same question as
 * what the cache then holds. A rollback that writes the previous record back looks correct to an
 * argument assertion and is still wrong if the key it must clear was one the previous record never
 * had; a late answer handed the right scope looks correct too, and still lands in the wrong
 * partition if the scope never reaches storage.
 */
export const createPartitionedMemoryStorage = <TType extends CacheType>(type: TType): ScopedCacheStorage<TType> => {
    const memoryFactory: CacheStorageFactory = <T extends CacheType>(slotType: T, provider: DataContextProvider) =>
        (resolveScopedContext(slotType, provider)
            ? createMemoryStore(slotType)
            : createUnscopedStorage()) as unknown as CacheStorage<T>;
    return createScopedCacheStorage(type, memoryFactory);
};

/**
 * One partition's rows. Just enough query behaviour for the suites: `channelId` narrows the two
 * domains that declare it as a query field, as the adapters do; only `chat` is ordered and paged,
 * so every other domain comes back in insertion order and its ordering is left for the data source
 * under test to prove.
 */
const createMemoryStore = (type: CacheType): CacheStorage<'chat'> => {
    const map = new Map<string, any>();
    return {
        async save(id, item) {
            map.set(id, { ...item });
            return item;
        },
        async saveAll(items) {
            items.forEach(item => item?.id && map.set(item.id, { ...item }));
            return items;
        },
        async load(id) {
            return map.has(id) ? { ...map.get(id) } : null;
        },
        async loadMany(ids) {
            // Per the contract this omits absent ids and guarantees no order (it returns them
            // reversed) — this fixture exists so that any code pairing by position breaks here.
            return ids
                .filter(id => map.has(id))
                .map(id => ({ ...map.get(id) }))
                .reverse();
        },
        async loadAll(options?: any) {
            let items = Array.from(map.values()).map(item => ({ ...item }));
            if (options?.channelId) {
                items = items.filter(item => item.channelId === options.channelId);
            }
            if (type !== 'chat') return items;
            items.sort((a, b) => (a.chatNo ?? 0) - (b.chatNo ?? 0));
            if (options?.cursorNo) {
                items = items.filter(item => (item.chatNo ?? 0) < options.cursorNo);
            }
            if (options?.limit) {
                items = items.slice(-options.limit);
            }
            return items;
        },
        async delete(id) {
            map.delete(id);
        },
        async deleteAll(ids) {
            ids.forEach(id => map.delete(id));
        },
        async clearAll() {
            map.clear();
        },
        async clearByChannelId(channelId: string) {
            Array.from(map.entries()).forEach(([id, item]) => {
                if (item.channelId === channelId) map.delete(id);
            });
        },
    };
};

/** What an adapter does with no session: reads come back empty, writes are dropped. */
const createUnscopedStorage = (): CacheStorage<'chat'> => ({
    save: async (_id, item) => item,
    saveAll: async items => items,
    load: async () => null,
    loadMany: async () => [],
    loadAll: async () => [],
    delete: async () => undefined,
    deleteAll: async () => undefined,
    clearAll: async () => undefined,
    clearByChannelId: async () => undefined,
});
