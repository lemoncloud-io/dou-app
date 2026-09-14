import type { CacheStorage } from '../ports';
import { UserLocalDataSource } from './UserLocalDataSource';

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
        async loadMany(ids) {
            // Per the contract this omits absent ids and guarantees no order (it returns them
            // reversed) — this fixture exists so that any code pairing by position breaks here.
            return ids
                .filter(id => map.has(id))
                .map(id => ({ ...map.get(id) }))
                .reverse();
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

describe('UserLocalDataSource', () => {
    const contextProvider = {
        current: { cid: 'cloud-a', sid: 'site-1', uid: 'me' },
        getContext() {
            return this.current;
        },
        setContext(context: any) {
            this.current = context;
        },
    };

    it('filters channel members by membership in the mapped channelIds', async () => {
        const storage = createMemoryStorage();
        const dataSource = new UserLocalDataSource(contextProvider as any, storage);

        // Channel membership arrives pre-mapped as `channelIds` (resolved upstream from channelId/$join).
        await dataSource.cacheWriteMany([
            { id: 'u1', channelIds: ['ch-1'], name: 'Direct' } as any,
            { id: 'u2', channelIds: ['ch-1'], name: 'Nested' } as any,
            { id: 'u3', channelIds: ['ch-2'], name: 'Other' } as any,
        ]);

        const result = await dataSource.cacheReadList({ channelId: 'ch-1' } as any);

        expect(result?.list.map(item => item.id)).toEqual(['u1', 'u2']);
    });

    it('reads multiple users by id in one call so higher-level assemblers can hydrate batched lookups', async () => {
        const storage = createMemoryStorage();
        const dataSource = new UserLocalDataSource(contextProvider as any, storage);

        await dataSource.cacheWriteMany([{ id: 'u1', name: 'One' } as any, { id: 'u2', name: 'Two' } as any]);

        const users = await dataSource.cacheReadMany(['u1', 'u2']);

        // Batched reads should preserve the requested set without forcing callers into N single-item reads.
        //
        // Asserted as a set — order is not part of the contract. On native this goes down as a single
        // `id IN (...)` and uses whatever order SQLite returns, so matching the requested order cannot be
        // promised. (The fixture deliberately returns them reversed for the same reason: to keep this
        // assertion from leaning on order.)
        expect(users.map(user => user.id).sort()).toEqual(['u1', 'u2']);
    });

    it('drops ids that are not cached instead of returning holes, so callers can index by id', async () => {
        const storage = createMemoryStorage();
        const dataSource = new UserLocalDataSource(contextProvider as any, storage);

        await dataSource.cacheWriteMany([{ id: 'u1', name: 'One' } as any]);

        const users = await dataSource.cacheReadMany(['u1', 'missing']);

        expect(users.map(user => user.id)).toEqual(['u1']);
    });
});
