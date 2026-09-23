import type { CacheStorage, ScopedCacheStorage } from '../ports';
import { UserLocalDataSource } from './UserLocalDataSource';
import { createPartitionedMemoryStorage } from './__mocks__/MemoryCacheStorage';

/**
 * The contract for how many times an observer reads storage.
 *
 * Notifying an observer re-reads storage (`callback(await query())`), so one read is one bridge round
 * trip on native. Grouping merged re-emits, but **each mount still read on its own**, and in a screen
 * where several hooks watch the same data one entry produced that many round trips. Three paths are
 * pinned here: when a value already exists, when a read is in flight, and when there is neither.
 */
/**
 * Lets pending reads settle. Generous on purpose: a read here passes through the counting wrapper
 * and the partitioned store, and pinning an exact number of microtask turns would test the fixture
 * rather than the data source. Nothing below asserts on a state that a few extra turns could skip.
 */
const flushPromises = async () => {
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
};

interface Counters {
    loadAll: number;
    load: number;
}

/**
 * The shared partitioned fixture with every partition's reads counted, and optionally held behind
 * `gate`. Counted across partitions because several cases observe under two scopes and pin the total.
 */
const createCountingStorage = (counters: Counters, gate?: { block: Promise<void> }): ScopedCacheStorage<'user'> => {
    const slot = createPartitionedMemoryStorage('user');
    const instrumented = new Set<CacheStorage<'user'>>();
    return {
        forScope(context) {
            const storage = slot.forScope(context);
            if (!instrumented.has(storage)) {
                instrumented.add(storage);
                const load = storage.load.bind(storage);
                const loadAll = storage.loadAll.bind(storage);
                storage.load = async id => {
                    counters.load += 1;
                    if (gate) await gate.block;
                    return load(id);
                };
                storage.loadAll = async options => {
                    counters.loadAll += 1;
                    if (gate) await gate.block;
                    return loadAll(options);
                };
            }
            return storage;
        },
    };
};

const createContextProvider = (context: Record<string, unknown>) => ({
    current: context,
    getContext() {
        return this.current;
    },
    setContext(next: any) {
        this.current = next;
    },
});

describe('observer group sharing', () => {
    it('a second subscriber on the same key receives the value held by the group without reading storage again', async () => {
        const counters: Counters = { loadAll: 0, load: 0 };
        const dataSource = new UserLocalDataSource(
            createContextProvider({ cid: 'c', sid: 's', uid: 'u' }) as any,
            createCountingStorage(counters)
        );
        await dataSource.cacheWrite({ id: 'u1', channelIds: ['ch-1'] } as any);
        counters.loadAll = 0;

        const first = jest.fn();
        dataSource.observeList({ channelId: 'ch-1' } as any, first);
        await flushPromises();
        expect(counters.loadAll).toBe(1);

        const second = jest.fn();
        dataSource.observeList({ channelId: 'ch-1' } as any, second);
        await flushPromises();

        // The second subscriber receives a value too, but storage was not read again.
        expect(second).toHaveBeenCalledTimes(1);
        expect(second.mock.calls[0][0]?.list.map((item: any) => item.id)).toEqual(['u1']);
        expect(counters.loadAll).toBe(1);
    });

    it('a subscriber attaching mid-read joins the read in flight — a burst of mounts still costs one round trip', async () => {
        const counters: Counters = { loadAll: 0, load: 0 };
        let release: () => void = () => undefined;
        const gate = {
            block: new Promise<void>(resolve => {
                release = resolve;
            }),
        };
        const dataSource = new UserLocalDataSource(
            createContextProvider({ cid: 'c', sid: 's', uid: 'u' }) as any,
            createCountingStorage(counters, gate)
        );

        const first = jest.fn();
        const second = jest.fn();
        const third = jest.fn();
        dataSource.observeList({ channelId: 'ch-1' } as any, first);
        dataSource.observeList({ channelId: 'ch-1' } as any, second);
        dataSource.observeList({ channelId: 'ch-1' } as any, third);

        release();
        await flushPromises();

        expect(first).toHaveBeenCalledTimes(1);
        expect(second).toHaveBeenCalledTimes(1);
        expect(third).toHaveBeenCalledTimes(1);
        expect(counters.loadAll).toBe(1);
    });

    it('the re-emit result is remembered on the group, so a later subscriber receives the current value without a read', async () => {
        const counters: Counters = { loadAll: 0, load: 0 };
        const dataSource = new UserLocalDataSource(
            createContextProvider({ cid: 'c', sid: 's', uid: 'u' }) as any,
            createCountingStorage(counters)
        );

        const first = jest.fn();
        dataSource.observeList({ channelId: 'ch-1' } as any, first);
        await flushPromises();

        await dataSource.cacheWrite({ id: 'u1', channelIds: ['ch-1'] } as any);
        await new Promise(resolve => setTimeout(resolve, 80)); // past the flush timer (50ms)
        counters.loadAll = 0;

        const second = jest.fn();
        dataSource.observeList({ channelId: 'ch-1' } as any, second);
        await flushPromises();

        expect(second.mock.calls[0][0]?.list.map((item: any) => item.id)).toEqual(['u1']);
        expect(counters.loadAll).toBe(0);
    });

    // A screen transition's destroy/recreate cycle: when the last subscriber leaves the group stays in
    // grace, so a returning subscriber skips storage (a bridge round trip on native) and gets the value
    // immediately.
    it('after the last subscriber leaves, a resubscribe within grace still receives the value immediately without a read', async () => {
        const counters: Counters = { loadAll: 0, load: 0 };
        const dataSource = new UserLocalDataSource(
            createContextProvider({ cid: 'c', sid: 's', uid: 'u' }) as any,
            createCountingStorage(counters)
        );
        await dataSource.cacheWrite({ id: 'u1', channelIds: ['ch-1'] } as any);
        await new Promise(resolve => setTimeout(resolve, 80)); // past the write re-emit flush

        const unsubscribe = dataSource.observeList({ channelId: 'ch-1' } as any, jest.fn());
        await flushPromises();
        unsubscribe();
        counters.loadAll = 0;

        const returning = jest.fn();
        dataSource.observeList({ channelId: 'ch-1' } as any, returning);
        await flushPromises();

        expect(counters.loadAll).toBe(0);
        expect(returning.mock.calls[0][0]?.list.map((item: any) => item.id)).toEqual(['u1']);
    });

    it('a write on that key during grace discards the group — a resubscribe reads the new value afresh', async () => {
        const counters: Counters = { loadAll: 0, load: 0 };
        const dataSource = new UserLocalDataSource(
            createContextProvider({ cid: 'c', sid: 's', uid: 'u' }) as any,
            createCountingStorage(counters)
        );

        const unsubscribe = dataSource.observeList({ channelId: 'ch-1' } as any, jest.fn());
        await flushPromises();
        unsubscribe();

        await dataSource.cacheWrite({ id: 'u1', channelIds: ['ch-1'] } as any);
        await new Promise(resolve => setTimeout(resolve, 80)); // the flush invalidates the retired group
        counters.loadAll = 0;

        const returning = jest.fn();
        dataSource.observeList({ channelId: 'ch-1' } as any, returning);
        await flushPromises();

        // There was no re-query with nobody listening (above, the flush does not read even before the
        // counter reset), and the resubscribe reads the post-write answer afresh rather than the value
        // held in grace.
        expect(counters.loadAll).toBe(1);
        expect(returning.mock.calls[0][0]?.list.map((item: any) => item.id)).toEqual(['u1']);
    });

    it('a write flush during grace does not re-query a group with no subscribers', async () => {
        const counters: Counters = { loadAll: 0, load: 0 };
        const dataSource = new UserLocalDataSource(
            createContextProvider({ cid: 'c', sid: 's', uid: 'u' }) as any,
            createCountingStorage(counters)
        );

        const unsubscribe = dataSource.observeList({ channelId: 'ch-1' } as any, jest.fn());
        await flushPromises();
        unsubscribe();
        counters.loadAll = 0;

        await dataSource.cacheWrite({ id: 'u1', channelIds: ['ch-1'] } as any);
        await new Promise(resolve => setTimeout(resolve, 80));

        expect(counters.loadAll).toBe(0);
    });

    it('a failed first query is read again once, shortly after, and delivered to subscribers (ADR-0059)', async () => {
        jest.useFakeTimers();
        try {
            const users = createPartitionedMemoryStorage('user');
            const storage = users.forScope({ cid: 'c', uid: 'u' });
            // Storage that fails only on the first call — reproducing momentary congestion (a bridge timeout).
            const originalLoadAll = storage.loadAll.bind(storage);
            let attempts = 0;
            storage.loadAll = async (...args: unknown[]) => {
                attempts += 1;
                if (attempts === 1) throw new Error('bridge timeout');
                return originalLoadAll(...(args as []));
            };
            const dataSource = new UserLocalDataSource(
                createContextProvider({ cid: 'c', sid: 's', uid: 'u' }) as any,
                users
            );

            const observer = jest.fn();
            dataSource.observeList({ channelId: 'ch-1' } as any, observer);
            await flushPromises();

            // Back when the failure was merely swallowed, this was where the news stopped for good (a screen stuck empty).
            expect(observer).not.toHaveBeenCalled();

            jest.advanceTimersByTime(1_000);
            await flushPromises();

            expect(attempts).toBe(2);
            expect(observer).toHaveBeenCalledTimes(1);
        } finally {
            jest.useRealTimers();
        }
    });

    it('when grace expires the value is discarded and the next subscription reads afresh', async () => {
        jest.useFakeTimers();
        try {
            const counters: Counters = { loadAll: 0, load: 0 };
            const dataSource = new UserLocalDataSource(
                createContextProvider({ cid: 'c', sid: 's', uid: 'u' }) as any,
                createCountingStorage(counters)
            );

            const unsubscribe = dataSource.observeList({ channelId: 'ch-1' } as any, jest.fn());
            await flushPromises();
            unsubscribe();
            counters.loadAll = 0;

            jest.advanceTimersByTime(60_000); // RETIRED_GROUP_TTL_MS elapsed

            dataSource.observeList({ channelId: 'ch-1' } as any, jest.fn());
            await flushPromises();

            expect(counters.loadAll).toBe(1);
        } finally {
            jest.useRealTimers();
        }
    });
});

describe('item observer scope isolation', () => {
    it('observing the same id under a different scope is a different group — it does not receive data from another cloud', async () => {
        const counters: Counters = { loadAll: 0, load: 0 };
        const provider = createContextProvider({ cid: 'cloud-a', sid: 's', uid: 'u' });
        const dataSource = new UserLocalDataSource(provider as any, createCountingStorage(counters));

        const fromCloudA = jest.fn();
        const fromCloudB = jest.fn();
        // Same id, different scope. When the raw id was the key, the second subscriber inherited the
        // first's query closure and received cloud-a's data.
        dataSource.observeItem('u1', fromCloudA, { cid: 'cloud-a' });
        dataSource.observeItem('u1', fromCloudB, { cid: 'cloud-b' });
        await flushPromises();

        // Evidence the groups split: both subscribers read on their own (a shared group would have folded it to one).
        expect(counters.load).toBe(2);
    });

    it('the write and the observation produce the same scope key, so the re-emit arrives', async () => {
        const counters: Counters = { loadAll: 0, load: 0 };
        const provider = createContextProvider({ cid: 'cloud-a', sid: 's', uid: 'u' });
        const dataSource = new UserLocalDataSource(provider as any, createCountingStorage(counters));

        const observer = jest.fn();
        dataSource.observeItem('u1', observer);
        await flushPromises();
        observer.mockClear();

        await dataSource.cacheWrite({ id: 'u1', name: 'named' } as any);
        await new Promise(resolve => setTimeout(resolve, 80));

        expect(observer).toHaveBeenCalled();
        expect(observer.mock.calls[observer.mock.calls.length - 1][0]?.name).toBe('named');
    });

    it('a change written under a different scope does not wake the item observers of this scope', async () => {
        const counters: Counters = { loadAll: 0, load: 0 };
        const provider = createContextProvider({ cid: 'cloud-a', sid: 's', uid: 'u' });
        const dataSource = new UserLocalDataSource(provider as any, createCountingStorage(counters));

        const observer = jest.fn();
        dataSource.observeItem('u1', observer, { cid: 'cloud-a' });
        await flushPromises();
        observer.mockClear();

        await dataSource.cacheWrite({ id: 'u1', name: 'other-cloud' } as any, { cid: 'cloud-b' });
        await new Promise(resolve => setTimeout(resolve, 80));

        expect(observer).not.toHaveBeenCalled();
    });
});

describe('sid is not part of the observer scope (ADR-0085)', () => {
    it('two observers on the same id under different sids are ONE group — they read storage once', async () => {
        const counters: Counters = { loadAll: 0, load: 0 };
        const provider = createContextProvider({ cid: 'cloud-a', sid: 'site-1', uid: 'u' });
        const dataSource = new UserLocalDataSource(provider as any, createCountingStorage(counters));

        const fromSite1 = jest.fn();
        const fromSite2 = jest.fn();
        // Storage partitions by {cid, uid} only, so these two read the very same physical row.
        // While sid was in the scope key they were separate groups and read it twice.
        dataSource.observeItem('u1', fromSite1, { sid: 'site-1' });
        dataSource.observeItem('u1', fromSite2, { sid: 'site-2' });
        await flushPromises();

        expect(counters.load).toBe(1);
    });

    it('a write under one sid wakes the observer that subscribed under another', async () => {
        const counters: Counters = { loadAll: 0, load: 0 };
        const provider = createContextProvider({ cid: 'cloud-a', sid: 'site-1', uid: 'u' });
        const dataSource = new UserLocalDataSource(provider as any, createCountingStorage(counters));

        const observer = jest.fn();
        dataSource.observeItem('u1', observer, { sid: 'site-1' });
        await flushPromises();
        observer.mockClear();

        // The failure this pins: a site switch clears and re-selects the sid on its own timeline, so
        // the write and the subscription routinely disagreed on it — and the row went stale on screen
        // even though the cache held it.
        await dataSource.cacheWrite({ id: 'u1', name: 'written-under-site-2' } as any, { sid: 'site-2' });
        await new Promise(resolve => setTimeout(resolve, 80));

        expect(observer).toHaveBeenCalled();
        expect(observer.mock.calls[observer.mock.calls.length - 1][0]?.name).toBe('written-under-site-2');
    });

    it('cid still splits the scope — dropping sid did not widen it to other clouds', async () => {
        const counters: Counters = { loadAll: 0, load: 0 };
        const provider = createContextProvider({ cid: 'cloud-a', sid: 'site-1', uid: 'u' });
        const dataSource = new UserLocalDataSource(provider as any, createCountingStorage(counters));

        const observer = jest.fn();
        dataSource.observeItem('u1', observer, { cid: 'cloud-a' });
        await flushPromises();
        observer.mockClear();

        await dataSource.cacheWrite({ id: 'u1', name: 'other-cloud' } as any, { cid: 'cloud-b' });
        await new Promise(resolve => setTimeout(resolve, 80));

        expect(observer).not.toHaveBeenCalled();
    });
});
