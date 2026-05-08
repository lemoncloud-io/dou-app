import type { CacheStorage } from '../storages';
import { SiteLocalDataSource } from './SiteLocalDataSource';

const createMemoryStorage = (): CacheStorage<'site'> => {
    const map = new Map<string, any>();
    return {
        async save(id, item) {
            map.set(id, { ...item });
            return item;
        },
        async saveAll(items) {
            items.forEach(item => {
                if (item?.id) map.set(item.id, { ...item });
            });
            return items;
        },
        async replaceAll(items) {
            map.clear();
            items.forEach(item => {
                if (item?.id) map.set(item.id, { ...item });
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

describe('SiteLocalDataSource', () => {
    const contextProvider = {
        getContext: () => ({ cid: 'cloud-a', uid: 'user-a' }),
        setContext: () => undefined,
    };

    it('sorts sites by order then name', async () => {
        const storage = createMemoryStorage();
        const dataSource = new SiteLocalDataSource(contextProvider, storage);

        await dataSource.replaceSites([
            { id: 's1', cid: 'cloud-a', name: 'Beta', order: 2 },
            { id: 's2', cid: 'cloud-a', name: 'Alpha', order: 1 },
        ] as any);

        const result = await dataSource.fetchList(undefined);

        expect(result?.list.map(site => site.id)).toEqual(['s2', 's1']);
    });

    it('re-emits subscribed site list when cache is mutated', async () => {
        const storage = createMemoryStorage();
        const dataSource = new SiteLocalDataSource(contextProvider, storage);
        const emissions: number[] = [];

        const unsubscribe = dataSource.subscribeList(undefined, result => {
            emissions.push(result?.meta?.total ?? 0);
        });

        await Promise.resolve();
        await dataSource.upsert({ id: 's1', cid: 'cloud-a', name: 'Alpha', order: 1 } as any);
        await dataSource.remove('s1');
        unsubscribe();

        expect(emissions).toEqual([0, 1, 0]);
    });
});
