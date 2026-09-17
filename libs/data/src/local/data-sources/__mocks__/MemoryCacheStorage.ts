import type { CacheStorage } from '../../ports';

/**
 * An in-memory {@link CacheStorage} that emulates just enough query behavior to validate
 * pagination, channel scoping and — crucially — the MERGE semantics of `cacheWrite`.
 *
 * Shared rather than local to one suite because a `jest.fn()` double only records the
 * arguments a write was called with, which is not the same question as what the cache
 * then holds. A rollback that writes the previous record back looks correct to an
 * argument assertion and is still wrong if the key it must clear was one the previous
 * record never had. Tests that care about the resulting state build on this instead.
 */
export const createMemoryCacheStorage = (): CacheStorage<'chat'> => {
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
