import type { CacheStorage } from '../storages';
import { JoinLocalDataSource } from './JoinLocalDataSource';

const createMemoryStorage = (): CacheStorage<'join'> => {
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

describe('JoinLocalDataSource', () => {
    const contextProvider = {
        getContext: () => ({ cid: 'cloud-a', uid: 'user-a' }),
        setContext: () => undefined,
    };

    it('filters active joins by channel', async () => {
        const storage = createMemoryStorage();
        const dataSource = new JoinLocalDataSource(contextProvider, storage);

        await dataSource.upsertJoins([
            { id: 'j1', cid: 'cloud-a', channelId: 'ch-1', userId: 'u1', joined: 1 },
            { id: 'j2', cid: 'cloud-a', channelId: 'ch-1', userId: 'u2', joined: 0 },
            { id: 'j3', cid: 'cloud-a', channelId: 'ch-2', userId: 'u3', joined: 1 },
        ] as any);

        const result = await dataSource.getActiveJoinsByChannel('ch-1');

        expect(result.map(item => item.id)).toEqual(['j1']);
    });

    it('re-emits subscribed join list when cache is mutated', async () => {
        const storage = createMemoryStorage();
        const dataSource = new JoinLocalDataSource(contextProvider, storage);
        const emissions: number[] = [];

        const unsubscribe = dataSource.subscribeJoinsByChannel('ch-1', joins => {
            emissions.push(joins.length);
        });

        await Promise.resolve();
        await dataSource.upsertJoin({ id: 'j1', cid: 'cloud-a', channelId: 'ch-1', userId: 'u1', joined: 1 } as any);
        await dataSource.deleteJoin('j1');
        unsubscribe();

        expect(emissions).toEqual([0, 1, 0]);
    });
});
