import type { CacheStorage } from '../ports';
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
        async loadMany(ids) {
            // 계약대로 없는 id는 빼고, 순서도 보장하지 않습니다(뒤집어 돌려줍니다) — 위치로 짝을
            // 맞추는 코드가 여기서 반드시 깨지도록 두는 것이 이 fixture의 역할입니다.
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

    // Reemit routing is keyed by {cid, uid} scope. The observer's scope is fixed at SUBSCRIBE time, so
    // any DataContextProvider whose reported cid lags behind a cloud switch (the mock `provider` below
    // simulates that) leaves an observer that keys off the live provider registered under the
    // pre-commit cid, never hearing the post-commit write. An explicit contextOverride pins the
    // observer's scope to the target cloud and closes that gap. (This used to be caused in practice by
    // `RuntimeDataBinder` pushing the provider in an effect that ran after the home hook subscribed;
    // that binder is now an inert no-op and the real provider, `ActiveScope`, derives its value live
    // from `session/store` with no such lag — this test guards the LocalDataSource-level defense.)
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

    // Embedded-$site pollution (relay-default-place-scoping.md): a fetch that lands while a cloud
    // is active can tag the relay's single personal place (id '0000') with that cloud's cid. The
    // write-time guard stops NEW rows; this is what keeps an already-poisoned row (including one
    // written before the guard existed) from resurfacing.
    describe("mistagged relay home place ('0000' under a non-default cid)", () => {
        it('cacheReadList filters it out', async () => {
            const storage = createMemoryStorage();
            const dataSource = new PlaceLocalDataSourceV2(contextProvider as any, storage);

            // contextProvider is fixed on cid 'cloud-a' — the write stamps that cid onto id '0000'.
            await dataSource.cacheWriteMany([
                { id: '0000', name: 'default' } as any,
                { id: 'p1', name: 'Real place' } as any,
            ]);

            const result = await dataSource.cacheReadList(undefined);

            expect(result?.list.map(item => item.id)).toEqual(['p1']);
        });

        it('cacheRead returns null for it', async () => {
            const storage = createMemoryStorage();
            const dataSource = new PlaceLocalDataSourceV2(contextProvider as any, storage);
            await dataSource.cacheWrite({ id: '0000', name: 'default' } as any);

            await expect(dataSource.cacheRead('0000')).resolves.toBeNull();
        });

        it('a legitimate id-0000 row under cid "default" is unaffected', async () => {
            const storage = createMemoryStorage();
            const provider = {
                current: { cid: 'default', sid: '', uid: 'me' },
                getContext() {
                    return this.current;
                },
                setContext(c: any) {
                    this.current = c;
                },
            };
            const dataSource = new PlaceLocalDataSourceV2(provider as any, storage);
            await dataSource.cacheWrite({ id: '0000', name: 'default' } as any);

            await expect(dataSource.cacheRead('0000')).resolves.toMatchObject({ id: '0000' });
            const result = await dataSource.cacheReadList(undefined);
            expect(result?.list.map(item => item.id)).toEqual(['0000']);
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
