import type { CacheStorage } from '../storages';
import { PlaceLocalDataSourceV2 } from './PlaceLocalDataSourceV2';

// Keep storage unsorted so ordering guarantees are proven by the datasource, not the fixture.
const createMemoryStorage = (): CacheStorage<'site'> => {
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

describe('PlaceLocalDataSourceV2', () => {
    const contextProvider = {
        current: { cid: 'cloud-a', sid: 'site-1', uid: 'me' },
        getContext() {
            return this.current;
        },
        setContext(context: any) {
            this.current = context;
        },
    };

    it('sorts places by id ascending (numeric-aware), ignoring server order/name', async () => {
        const storage = createMemoryStorage();
        const dataSource = new PlaceLocalDataSourceV2(contextProvider as any, storage);

        // order/name are intentionally out of id order to prove id drives the sort.
        await dataSource.cacheWriteMany([
            { id: '10', name: 'Bravo', order: 1 } as any,
            { id: '2', name: 'Alpha', order: 2 } as any,
            { id: '1', name: 'Zulu', order: 3 } as any,
        ]);

        const result = await dataSource.cacheReadList(undefined);

        // id order, with numeric awareness so '10' sorts after '2'.
        expect(result?.list.map(item => item.id)).toEqual(['1', '2', '10']);
    });

    it('clears all cached places for the scope when a logout-style reset happens', async () => {
        const storage = createMemoryStorage();
        const dataSource = new PlaceLocalDataSourceV2(contextProvider as any, storage);

        await dataSource.cacheWriteMany([{ id: 's1', name: 'Alpha' } as any, { id: 's2', name: 'Bravo' } as any]);
        await dataSource.cacheClear();

        const result = await dataSource.cacheReadList(undefined);

        // Scope clear should leave no residual place rows behind.
        expect(result?.list).toEqual([]);
    });
});
