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

        await dataSource.cacheWriteMany([
            { id: '10', name: 'Bravo', order: 1 } as any,
            { id: '2', name: 'Alpha', order: 2 } as any,
            { id: '1', name: 'Zulu', order: 3 } as any,
        ]);

        const result = await dataSource.cacheReadList(undefined);

        expect(result?.list.map(item => item.id)).toEqual(['1', '2', '10']);
    });

    describe('cloud-switch reemit routing (P1)', () => {
        const flush = async () => {
            await jest.advanceTimersByTimeAsync(60);
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
            ds.observeList(undefined, cb);
            await flush();
            cb.mockClear();

            provider.setContext({ cid: 'cloud-b', sid: '', uid: 'me' });
            await ds.cacheWriteMany([{ id: 'p1', name: 'Place 1' } as any]);
            await flush();

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
            live = { cid: 'cloud-b', uid: 'me' };
            await pending;

            expect(await places.forScope({ cid: 'cloud-a', uid: 'me' }).load('p1')).toMatchObject({ cid: 'cloud-a' });
            expect(await places.forScope({ cid: 'cloud-b', uid: 'me' }).load('p1')).toBeNull();
        });

        it('a write that started with no session does not wake the account that signs in during it', async () => {
            const places = createPartitionedMemoryStorage('site');
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
            ds.observeList(undefined, cb, { cid: 'cloud-b', uid: 'me' });
            await flush();

            expect(cb.mock.calls.at(-1)?.[0]?.list.map((p: any) => p.id)).toEqual(['p-b']);
        });
    });

    describe("mistagged relay home place ('0000' under a non-default cid)", () => {
        it('cacheReadList filters it out', async () => {
            const storage = createPartitionedMemoryStorage('site');
            const dataSource = new PlaceLocalDataSource(contextProvider as any, storage);

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

        expect(result?.list).toEqual([]);
    });
});
