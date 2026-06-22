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

    it('sorts places by server order before name so the rail stays deterministic', async () => {
        const storage = createMemoryStorage();
        const dataSource = new PlaceLocalDataSourceV2(contextProvider as any, storage);

        await dataSource.cacheWriteMany([
            { id: 's2', name: 'Bravo', order: 2 } as any,
            { id: 's1', name: 'Alpha', order: 1 } as any,
            { id: 's3', name: 'Zulu', order: 2 } as any,
        ]);

        const result = await dataSource.cacheReadList(undefined);

        // The rail order should follow server order first and name second.
        expect(result?.list.map(item => item.id)).toEqual(['s1', 's2', 's3']);
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
