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

    // Reemit routing is keyed by {cid, uid} scope. The observer's scope is fixed at SUBSCRIBE time,
    // while the context provider (an ancestor RuntimeDataBinder) commits the new cloud AFTER the
    // descendant home hook has already re-subscribed — so an observer that keys off the live provider
    // registers under the pre-commit cid and never hears the post-commit write. An explicit
    // contextOverride pins the observer's scope to the target cloud and closes that gap.
    describe('cloud-switch reemit routing (P1)', () => {
        const flush = async () => {
            await jest.advanceTimersByTimeAsync(60); // past the 50ms reemit debounce
        };

        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        it('REPRO: an observer subscribed under a stale provider cid MISSES the post-commit write', async () => {
            const storage = createMemoryStorage();
            const provider = {
                current: { cid: 'cloud-a', sid: '', uid: 'me' },
                getContext() {
                    return this.current;
                },
                setContext(c: any) {
                    this.current = c;
                },
            };
            const ds = new PlaceLocalDataSourceV2(provider as any, storage);

            const cb = jest.fn();
            ds.observeList(undefined, cb); // keyed under cloud-a (provider still lagging on the old cloud)
            await flush(); // initial emit (empty)
            cb.mockClear();

            // Cloud switch commits: the provider flips to the new cloud, THEN discovery writes its places.
            provider.setContext({ cid: 'cloud-b', sid: '', uid: 'me' });
            await ds.cacheWriteMany([{ id: 'p1', name: 'Place 1' } as any]);
            await flush();

            // Bug: the cloud-a-keyed observer never hears the cloud-b reemit → list stays stale.
            expect(cb).not.toHaveBeenCalled();
        });

        it('FIX: an observer keyed by explicit contextOverride receives the post-commit write', async () => {
            const storage = createMemoryStorage();
            const provider = {
                current: { cid: 'cloud-a', sid: '', uid: 'me' },
                getContext() {
                    return this.current;
                },
                setContext(c: any) {
                    this.current = c;
                },
            };
            const ds = new PlaceLocalDataSourceV2(provider as any, storage);

            const cb = jest.fn();
            // The home hook knows the target cloud from the React session, so it pins the observer scope.
            ds.observeList(undefined, cb, { cid: 'cloud-b', uid: 'me' });
            await flush();
            cb.mockClear();

            provider.setContext({ cid: 'cloud-b', sid: '', uid: 'me' });
            await ds.cacheWriteMany([{ id: 'p1', name: 'Place 1' } as any]);
            await flush();

            expect(cb).toHaveBeenCalled();
            const lastArg = cb.mock.calls.at(-1)?.[0];
            expect(lastArg?.list.map((p: any) => p.id)).toEqual(['p1']);
        });
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
