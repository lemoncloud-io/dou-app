import type { CacheType } from '@chatic/bridge-messages';
import type { DataContextProvider } from '../../../repositories/types';
import type { CacheStorage, CacheStorageFactory, ScopedCacheStorage } from '../../ports';
import { createScopedCacheStorage, resolveScopedContext } from '../../ports';

export const createPartitionedMemoryStorage = <TType extends CacheType>(type: TType): ScopedCacheStorage<TType> => {
    const memoryFactory: CacheStorageFactory = <T extends CacheType>(slotType: T, provider: DataContextProvider) =>
        (resolveScopedContext(slotType, provider)
            ? createMemoryStore(slotType)
            : createUnscopedStorage()) as unknown as CacheStorage<T>;
    return createScopedCacheStorage(type, memoryFactory);
};

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
