import type { CacheStorage } from '../storages';
import { JoinLocalDataSourceV2 } from './JoinLocalDataSourceV2';

// Use a plain in-memory store so the test focuses on join-specific filtering and deletion rules.
const createMemoryStorage = (): CacheStorage<'join'> => {
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
        async loadAll() {
            return Array.from(map.values()).map(item => ({ ...item }));
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
        async clearByChannelId() {
            return undefined;
        },
    };
};

describe('JoinLocalDataSourceV2', () => {
    const contextProvider = {
        current: { cid: 'cloud-a', sid: 'site-1', uid: 'me' },
        getContext() {
            return this.current;
        },
        setContext(context: any) {
            this.current = context;
        },
    };

    it('filters by channel and activeOnly so archived joins do not leak into active views', async () => {
        const storage = createMemoryStorage();
        const dataSource = new JoinLocalDataSourceV2(contextProvider as any, storage);

        await dataSource.cacheWriteMany([
            { id: 'j1', channelId: 'ch-1', userId: 'u1', joined: 1 } as any,
            { id: 'j2', channelId: 'ch-1', userId: 'u2', joined: 0 } as any,
            { id: 'j3', channelId: 'ch-2', userId: 'u3', joined: 1 } as any,
        ]);

        const result = await dataSource.cacheReadList({ channelId: 'ch-1', activeOnly: true });

        // activeOnly should filter out archived membership rows for the same channel.
        expect(result?.list.map(item => item.id)).toEqual(['j1']);
    });

    it('throws when join list input is missing channelId instead of masking the caller bug', async () => {
        const storage = createMemoryStorage();
        const dataSource = new JoinLocalDataSourceV2(contextProvider as any, storage);

        await expect(dataSource.cacheReadList({ activeOnly: true } as any)).rejects.toThrow(
            '[LocalDataSourceV2] channelId is required.'
        );
    });

    it('deletes multiple joins in one call so channel membership snapshots can be reconciled in bulk', async () => {
        const storage = createMemoryStorage();
        const dataSource = new JoinLocalDataSourceV2(contextProvider as any, storage);

        await dataSource.cacheWriteMany([
            { id: 'j1', channelId: 'ch-1', userId: 'u1', joined: 1 } as any,
            { id: 'j2', channelId: 'ch-1', userId: 'u2', joined: 1 } as any,
        ]);
        await dataSource.cacheDeleteMany(['j1', 'j2']);

        const result = await dataSource.cacheReadList({ channelId: 'ch-1', activeOnly: false });

        // Bulk delete should remove every targeted row from the next channel snapshot.
        expect(result?.list).toEqual([]);
    });
});
