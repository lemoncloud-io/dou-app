import type { CacheStorage } from '../ports';
import { JoinLocalDataSource } from './JoinLocalDataSource';

/**
 * Re-emit fan-out contract.
 *
 * Observer notify re-reads storage (`callback(await query())`), so every observer woken by a write
 * costs one storage round trip — a bridge call on native. With one join observer per channel
 * (`useMyJoins`), waking all of them turns a single write into N round trips: measured in the app,
 * `loadAll:join` was 77% of all cache calls and 84% of all cache time, at 16.5 reads per write.
 *
 * The cause was a prefix, not the fan-out design: prefixes match by `startsWith`, and a bare
 * `${scope}|joins` entry matched every join observer key. These tests pin both directions — narrow
 * enough to skip other channels, still wide enough to catch every query variant of the written one.
 */
const flushPromises = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

let loadAllCalls = 0;

const createMemoryStorage = (): CacheStorage<'join'> => {
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
        async loadMany(ids) {
            // Per the contract this omits absent ids and guarantees no order (it returns them
            // reversed) — this fixture exists so that any code pairing by position breaks here.
            return ids
                .filter(id => map.has(id))
                .map(id => ({ ...map.get(id) }))
                .reverse();
        },
        async loadAll(options) {
            loadAllCalls += 1;
            const list = Array.from(map.values()).map(item => ({ ...item }));
            if (!options?.channelId) return list;
            return list.filter(item => item.channelId === options.channelId);
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
            // not used here
        },
    };
};

const createSource = () => {
    const storage = createMemoryStorage();
    const contextProvider = {
        getContext: () => ({ cid: 'cloud-a', uid: 'me', sid: 'site-1' }),
        setContext: () => undefined,
    };
    return new JoinLocalDataSource(contextProvider as any, storage);
};

describe('JoinLocalDataSource re-emit scope', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });
    afterEach(() => {
        jest.useRealTimers();
    });

    const settle = async () => {
        jest.runOnlyPendingTimers();
        await flushPromises();
    };

    it('a write to one channel does not wake the observers of another channel', async () => {
        const source = createSource();
        const a = jest.fn();
        const b = jest.fn();

        source.observeList({ channelId: 'ch-a' }, a);
        source.observeList({ channelId: 'ch-b' }, b);
        await settle();
        a.mockClear();
        b.mockClear();

        await source.cacheWrite({ id: 'ch-a@me', channelId: 'ch-a', userId: 'me', readNo: 1 } as any);
        await settle();

        expect(a).toHaveBeenCalled();
        expect(b).not.toHaveBeenCalled();
    });

    // Without a separator in the prefix, `channel:ch-1` would also catch `channel:ch-10` — ids that share
    // a prefix are common (ch-1 / ch-10), so the segment boundary is checked too.
    it('another channel sharing an id prefix is not woken', async () => {
        const source = createSource();
        const one = jest.fn();
        const ten = jest.fn();

        source.observeList({ channelId: 'ch-1' }, one);
        source.observeList({ channelId: 'ch-10' }, ten);
        await settle();
        one.mockClear();
        ten.mockClear();

        await source.cacheWrite({ id: 'ch-1@me', channelId: 'ch-1', userId: 'me', readNo: 1 } as any);
        await settle();

        expect(one).toHaveBeenCalled();
        expect(ten).not.toHaveBeenCalled();
    });

    // Narrowing must not overshoot into missing things: query variants on the same channel (activeOnly)
    // have different keys but all have to wake. Three consumers watch the same key (UnifiedLayout,
    // UnreadBadgeRunner, and HomePage's useMyJoins), so one write used to produce three identical reads.
    // On a serial bridge the last observer waits three times as long.
    it('storage is read once even with several observers on the same key', async () => {
        const source = createSource();
        const a = jest.fn();
        const b = jest.fn();
        const c = jest.fn();

        source.observeList({ channelId: 'ch-a' }, a);
        source.observeList({ channelId: 'ch-a' }, b);
        source.observeList({ channelId: 'ch-a' }, c);
        await settle();

        loadAllCalls = 0;
        await source.cacheWrite({ id: 'ch-a@me', channelId: 'ch-a', userId: 'me', readNo: 7 } as any);
        await settle();

        // All three receive a value, but storage is queried once (the write path's own query is counted only after the loadAllCalls reset).
        expect(a).toHaveBeenCalled();
        expect(b).toHaveBeenCalled();
        expect(c).toHaveBeenCalled();
        expect(loadAllCalls).toBe(1);
    });

    it('every query variant on the same channel is woken', async () => {
        const source = createSource();
        const plain = jest.fn();
        const activeOnly = jest.fn();

        source.observeList({ channelId: 'ch-a' }, plain);
        source.observeList({ channelId: 'ch-a', activeOnly: true }, activeOnly);
        await settle();
        plain.mockClear();
        activeOnly.mockClear();

        await source.cacheWrite({ id: 'ch-a@me', channelId: 'ch-a', userId: 'me', readNo: 2 } as any);
        await settle();

        expect(plain).toHaveBeenCalled();
        expect(activeOnly).toHaveBeenCalled();
    });
});
