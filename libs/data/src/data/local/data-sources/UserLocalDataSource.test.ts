import type { CacheStorage } from '../storages';
import { UserLocalDataSource } from './UserLocalDataSource';

const createMemoryStorage = (): CacheStorage<'user'> => {
    const map = new Map<string, any>();
    return {
        async save(id, item) {
            map.set(id, { ...item });
            return item;
        },
        async saveAll(items) {
            items.forEach(item => {
                if (!item?.id) return;
                map.set(item.id, { ...item });
            });
            return items;
        },
        async replaceAll(items) {
            map.clear();
            items.forEach(item => {
                if (!item?.id) return;
                map.set(item.id, { ...item });
            });
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
    };
};

describe('UserLocalDataSource', () => {
    const contextProvider = {
        getContext: () => ({ cid: 'cloud-a', uid: 'user-a' }),
        setContext: () => undefined,
    };

    it('fetches users filtered by channelId', async () => {
        const storage = createMemoryStorage();
        const dataSource = new UserLocalDataSource(contextProvider, storage);

        await dataSource.upsertUsers([
            { id: 'u1', cid: 'cloud-a', name: 'A', $join: { channelId: 'ch-1' } },
            { id: 'u2', cid: 'cloud-a', name: 'B', channelId: 'ch-1' },
            { id: 'u3', cid: 'cloud-a', name: 'C', channelId: 'ch-2' },
        ] as any);

        const result = await dataSource.fetchUsers({ channelId: 'ch-1' } as any);

        expect(result?.list.map(item => item.id).sort()).toEqual(['u1', 'u2']);
    });

    it('re-emits subscribed user list when cache is mutated', async () => {
        const storage = createMemoryStorage();
        const dataSource = new UserLocalDataSource(contextProvider, storage);
        const emissions: number[] = [];

        const unsubscribe = dataSource.subscribeUsers({ channelId: 'ch-1' } as any, result => {
            emissions.push(result?.list.length ?? 0);
        });

        await Promise.resolve();
        await dataSource.upsertUser({ id: 'u1', cid: 'cloud-a', name: 'A', channelId: 'ch-1' } as any);
        await dataSource.deleteUser('u1');
        unsubscribe();

        expect(emissions).toEqual([0, 1, 0]);
    });
});
