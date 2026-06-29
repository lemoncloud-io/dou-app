import type { CacheStorage } from '../storages';
import { ProfileLocalDataSourceV2 } from './ProfileLocalDataSourceV2';

// Flush pending microtasks after timer-driven observer re-emits.
const flushPromises = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

// Minimal in-memory storage so the test only exercises datasource behavior.
const createMemoryStorage = (): CacheStorage<'profile'> => {
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
        async load(id) {
            return map.has(id) ? { ...map.get(id) } : null;
        },
        async loadAll(options) {
            const list = Array.from(map.values()).map(item => ({ ...item }));
            if (!options?.sid) return list;
            return list.filter(item => item.sid === options.sid);
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

describe('ProfileLocalDataSourceV2', () => {
    const contextProvider = {
        current: { cid: 'cloud-a', sid: 'site-1', uid: 'me' },
        getContext() {
            return this.current;
        },
        setContext(context: any) {
            this.current = context;
        },
    };

    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('stores profiles with a deterministic site-user key', async () => {
        const storage = createMemoryStorage();
        const dataSource = new ProfileLocalDataSourceV2(contextProvider as any, storage);

        // Write without a precomputed id so the datasource has to derive the cache key.
        await dataSource.cacheWrite({
            siteId: 'site-1',
            userId: 'user-1',
            nick: 'Alice',
        } as any);

        // Read back through the derived key to prove the normalization path is stable.
        const loaded = await dataSource.cacheRead('site-1@user-1');

        expect(loaded?.id).toBe('site-1@user-1');
        expect(loaded?.sid).toBe('site-1');
        expect(loaded?.uid).toBe('user-1');
        expect(loaded?.nick).toBe('Alice');
    });

    it('re-emits the current place profile list when a profile changes', async () => {
        const storage = createMemoryStorage();
        const dataSource = new ProfileLocalDataSourceV2(contextProvider as any, storage);
        const emissions: string[][] = [];

        // Subscribe first so the test can assert the initial empty snapshot and the follow-up update.
        const unsubscribe = dataSource.observeList(undefined, result => {
            emissions.push((result?.list ?? []).map(item => item.id));
        });

        // Run the initial observer emission.
        jest.runAllTimers();
        await flushPromises();

        // Mutate the cache and then flush the debounced observer pipeline.
        await dataSource.cacheWrite({
            siteId: 'site-1',
            userId: 'user-1',
            nick: 'Alice',
        } as any);

        jest.runAllTimers();
        await flushPromises();

        unsubscribe();

        expect(emissions).toEqual([[], ['site-1@user-1']]);
    });

    it('filters profile lists by site and user so display lookups stay scoped to the active target', async () => {
        const storage = createMemoryStorage();
        const dataSource = new ProfileLocalDataSourceV2(contextProvider as any, storage);

        await dataSource.cacheWriteMany([
            { siteId: 'site-1', userId: 'user-1', nick: 'Alice' } as any,
            { siteId: 'site-1', userId: 'user-2', nick: 'Bob' } as any,
            { siteId: 'site-2', userId: 'user-1', nick: 'Elsewhere' } as any,
        ]);

        const result = await dataSource.cacheReadList({ siteId: 'site-1', userId: 'user-2' });

        // Cross-site rows must not bleed into the active place/profile lookup.
        expect(result?.list.map(item => item.id)).toEqual(['site-1@user-2']);
    });

    it('accepts sid and uid aliases when filtering the cached profile list', async () => {
        const storage = createMemoryStorage();
        const dataSource = new ProfileLocalDataSourceV2(contextProvider as any, storage);

        await dataSource.cacheWriteMany([
            { sid: 'site-1', uid: 'user-1', nick: 'Alice' } as any,
            { sid: 'site-1', uid: 'user-2', nick: 'Bob' } as any,
        ]);

        const result = await dataSource.cacheReadList({ sid: 'site-1', uid: 'user-1' });

        expect(result?.list.map(item => item.id)).toEqual(['site-1@user-1']);
    });

    it('throws when cacheWrite cannot resolve sid and uid', async () => {
        const storage = createMemoryStorage();
        const dataSource = new ProfileLocalDataSourceV2(
            {
                getContext: () => ({ cid: 'cloud-a' }),
                setContext: () => undefined,
            } as any,
            storage
        );

        await expect(dataSource.cacheWrite({ nick: 'Alice' } as any)).rejects.toThrow(
            '[LocalDataSourceV2] sid is required.'
        );
    });
});
