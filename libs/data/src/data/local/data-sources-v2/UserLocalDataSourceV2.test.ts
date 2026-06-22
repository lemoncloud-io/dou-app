import type { CacheStorage } from '../storages';
import { UserLocalDataSourceV2 } from './UserLocalDataSourceV2';

// The storage fixture is deliberately naive so channel-member resolution is owned by the datasource.
const createMemoryStorage = (): CacheStorage<'user'> => {
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

describe('UserLocalDataSourceV2', () => {
    const contextProvider = {
        current: { cid: 'cloud-a', sid: 'site-1', uid: 'me' },
        getContext() {
            return this.current;
        },
        setContext(context: any) {
            this.current = context;
        },
    };

    it('filters channel members from either direct channelId or nested join metadata', async () => {
        const storage = createMemoryStorage();
        const dataSource = new UserLocalDataSourceV2(contextProvider as any, storage);

        await dataSource.cacheWriteMany([
            { id: 'u1', channelId: 'ch-1', name: 'Direct' } as any,
            { id: 'u2', $join: { channelId: 'ch-1' }, name: 'Nested' } as any,
            { id: 'u3', channelId: 'ch-2', name: 'Other' } as any,
        ]);

        const result = await dataSource.cacheReadList({ channelId: 'ch-1' } as any);

        // Member lookups should work whether the channel link lives directly on the user or in join metadata.
        expect(result?.list.map(item => item.id)).toEqual(['u1', 'u2']);
    });

    it('reads multiple users by id in one call so higher-level assemblers can hydrate batched lookups', async () => {
        const storage = createMemoryStorage();
        const dataSource = new UserLocalDataSourceV2(contextProvider as any, storage);

        await dataSource.cacheWriteMany([{ id: 'u1', name: 'One' } as any, { id: 'u2', name: 'Two' } as any]);

        const users = await dataSource.cacheReadMany(['u1', 'u2']);

        // Batched reads should preserve the requested set without forcing callers into N single-item reads.
        expect(users.map(user => user.id)).toEqual(['u1', 'u2']);
    });
});
