import type { CacheStorage } from '../storages';
import { ChannelLocalDataSource } from './ChannelLocalDataSource';

const createMemoryStorage = (): CacheStorage<'channel'> => {
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

describe('ChannelLocalDataSource', () => {
    const contextProvider = {
        getContext: () => ({ cid: 'cloud-a', uid: 'user-a', sid: 'place-a' }),
        setContext: () => undefined,
    };

    it('sorts channels by latest activity and applies page/limit', async () => {
        const storage = createMemoryStorage();
        const dataSource = new ChannelLocalDataSource(contextProvider, storage);

        await dataSource.upsertChannels([
            { id: 'c1', sid: 'place-a', cid: 'cloud-a', updatedAt: 10 },
            { id: 'c2', sid: 'place-a', cid: 'cloud-a', updatedAt: 20 },
            { id: 'c3', sid: 'place-a', cid: 'cloud-a', updatedAt: 30 },
        ] as any);

        const result = await dataSource.fetchChannel({ page: 0, limit: 2 } as any);

        expect(result?.list.map(item => item.id)).toEqual(['c3', 'c2']);
        expect(result?.total).toBe(3);
    });

    it('re-emits subscribed channel list when cache is mutated', async () => {
        const storage = createMemoryStorage();
        const dataSource = new ChannelLocalDataSource(contextProvider, storage);
        const emissions: number[] = [];

        const unsubscribe = dataSource.subscribeChannelList({ page: 0, limit: 10 } as any, result =>
            emissions.push(result?.list.length ?? 0)
        );

        await Promise.resolve();
        await dataSource.upsertChannel({ id: 'c1', sid: 'place-a', cid: 'cloud-a', updatedAt: 1 } as any);
        await dataSource.deleteChannel('c1');
        unsubscribe();

        expect(emissions).toEqual([0, 1, 0]);
    });
});
