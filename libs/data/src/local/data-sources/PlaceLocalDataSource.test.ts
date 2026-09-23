import { PlaceLocalDataSource } from './PlaceLocalDataSource';
import { createPartitionedMemoryStorage } from './__mocks__/MemoryCacheStorage';

describe('PlaceLocalDataSource', () => {
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
        const storage = createPartitionedMemoryStorage('site');
        const dataSource = new PlaceLocalDataSource(contextProvider as any, storage);

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
            const storage = createPartitionedMemoryStorage('site');
            const provider = {
                current: { cid: 'cloud-a', sid: '', uid: 'me' },
                getContext() {
                    return this.current;
                },
                setContext(c: any) {
                    this.current = c;
                },
            };
            const ds = new PlaceLocalDataSource(provider as any, storage);

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
            const storage = createPartitionedMemoryStorage('site');
            const provider = {
                current: { cid: 'cloud-a', sid: '', uid: 'me' },
                getContext() {
                    return this.current;
                },
                setContext(c: any) {
                    this.current = c;
                },
            };
            const ds = new PlaceLocalDataSource(provider as any, storage);

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

        it('a write with no override keeps the scope it started under when the provider moves during it', async () => {
            const places = createPartitionedMemoryStorage('site');
            let live: Record<string, string | undefined> = { cid: 'cloud-a', uid: 'me' };
            const provider = { getContext: () => live, setContext: () => undefined };
            const ds = new PlaceLocalDataSource(provider, places);

            const pending = ds.cacheWrite({ id: 'p1', name: 'Place 1' } as any);
            // The switch lands while the write is waiting on its read of the existing row.
            live = { cid: 'cloud-b', uid: 'me' };
            await pending;

            // Stored, stamped and filed under one scope — the one current when the write began.
            expect(await places.forScope({ cid: 'cloud-a', uid: 'me' }).load('p1')).toMatchObject({ cid: 'cloud-a' });
            expect(await places.forScope({ cid: 'cloud-b', uid: 'me' }).load('p1')).toBeNull();
        });

        it('a write that started with no session does not wake the account that signs in during it', async () => {
            const places = createPartitionedMemoryStorage('site');
            // No `uid` key at all: the provider has no session yet.
            let live: Record<string, string | undefined> = { cid: 'default' };
            const provider = { getContext: () => live, setContext: () => undefined };
            const ds = new PlaceLocalDataSource(provider, places);
            const accountObserver = jest.fn();
            ds.observeList(undefined, accountObserver, { cid: 'default', uid: 'account' });
            await flush();
            accountObserver.mockClear();

            const pending = ds.cacheWrite({ id: 'p1', name: 'Place 1' } as any);
            live = { cid: 'default', uid: 'account' };
            await pending;
            await flush();

            // Nothing was stored (there was no partition to store it in), so the account that
            // arrived mid-write has nothing to hear about.
            expect(accountObserver).not.toHaveBeenCalled();
            expect(await places.forScope({ cid: 'default', uid: 'account' }).load('p1')).toBeNull();
        });

        it('a pinned observer reads the partition it is pinned to while the provider still points elsewhere', async () => {
            const places = createPartitionedMemoryStorage('site');
            await places.forScope({ cid: 'cloud-b', uid: 'me' }).save('p-b', { id: 'p-b', cid: 'cloud-b' } as any);
            await places.forScope({ cid: 'cloud-a', uid: 'me' }).save('p-a', { id: 'p-a', cid: 'cloud-a' } as any);
            const provider = { getContext: () => ({ cid: 'cloud-a', uid: 'me' }), setContext: () => undefined };
            const ds = new PlaceLocalDataSource(provider, places);

            const cb = jest.fn();
            // Pinned to the target cloud before the provider has caught up. Keying the observer by the
            // pin is half of it — its read has to come from the pinned partition too.
            ds.observeList(undefined, cb, { cid: 'cloud-b', uid: 'me' });
            await flush();

            expect(cb.mock.calls.at(-1)?.[0]?.list.map((p: any) => p.id)).toEqual(['p-b']);
        });
    });

    // Embedded-$site pollution (relay-default-place-scoping.md): a fetch that lands while a cloud
    // is active can tag the relay's single personal place (id '0000') with that cloud's cid. The
    // write-time guard stops NEW rows; this is what keeps an already-poisoned row (including one
    // written before the guard existed) from resurfacing.
    describe("mistagged relay home place ('0000' under a non-default cid)", () => {
        it('cacheReadList filters it out', async () => {
            const storage = createPartitionedMemoryStorage('site');
            const dataSource = new PlaceLocalDataSource(contextProvider as any, storage);

            // contextProvider is fixed on cid 'cloud-a' — the write stamps that cid onto id '0000'.
            await dataSource.cacheWriteMany([
                { id: '0000', name: 'default' } as any,
                { id: 'p1', name: 'Real place' } as any,
            ]);

            const result = await dataSource.cacheReadList(undefined);

            expect(result?.list.map(item => item.id)).toEqual(['p1']);
        });

        it('cacheRead returns null for it', async () => {
            const storage = createPartitionedMemoryStorage('site');
            const dataSource = new PlaceLocalDataSource(contextProvider as any, storage);
            await dataSource.cacheWrite({ id: '0000', name: 'default' } as any);

            await expect(dataSource.cacheRead('0000')).resolves.toBeNull();
        });

        it('a legitimate id-0000 row under cid "default" is unaffected', async () => {
            const storage = createPartitionedMemoryStorage('site');
            const provider = {
                current: { cid: 'default', sid: '', uid: 'me' },
                getContext() {
                    return this.current;
                },
                setContext(c: any) {
                    this.current = c;
                },
            };
            const dataSource = new PlaceLocalDataSource(provider as any, storage);
            await dataSource.cacheWrite({ id: '0000', name: 'default' } as any);

            await expect(dataSource.cacheRead('0000')).resolves.toMatchObject({ id: '0000' });
            const result = await dataSource.cacheReadList(undefined);
            expect(result?.list.map(item => item.id)).toEqual(['0000']);
        });
    });

    it('clears all cached places for the scope when a logout-style reset happens', async () => {
        const storage = createPartitionedMemoryStorage('site');
        const dataSource = new PlaceLocalDataSource(contextProvider as any, storage);

        await dataSource.cacheWriteMany([{ id: 's1', name: 'Alpha' } as any, { id: 's2', name: 'Bravo' } as any]);
        await dataSource.cacheClear();

        const result = await dataSource.cacheReadList(undefined);

        // Scope clear should leave no residual place rows behind.
        expect(result?.list).toEqual([]);
    });
});
