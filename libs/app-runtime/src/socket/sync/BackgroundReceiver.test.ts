import { logger } from '@chatic/bridges';

import type { ISocketManager, SlotKey } from '../types';
import { BackgroundReceiver } from './BackgroundReceiver';
import type { BackgroundReceiveRepositories, BackgroundReceiverDeps } from './types';

jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
// The defaults reach the data runtime and the session store; every test injects its own instead.
jest.mock('../../data/runtime', () => ({ getDataManager: jest.fn() }));
jest.mock('../../session/store', () => ({ getUidInCloud: jest.fn() }));

const RELAY = 'default' as SlotKey;
const A = 'cloud-a' as SlotKey;
const B = 'cloud-b' as SlotKey;

const INTERVAL = 60_000;
const DEBOUNCE = 300;
const PLACE = 600_000;

/**
 * The part of the socket manager the receiver reads, with the slot lifecycle driven by the test:
 * `bind` announces a slot, `activate` moves the active pointer, `verify` flips a slot's handshake,
 * `push` delivers a frame on one slot.
 */
const createManager = () => {
    const slotListeners = new Set<(key: SlotKey, client: unknown) => void>();
    const activeListeners = new Set<() => void>();
    const verifiedListeners = new Map<SlotKey, Set<(verified: boolean) => void>>();
    const pushListeners = new Map<string, Set<() => void>>();
    const verified = new Set<SlotKey>();
    const bound = new Set<SlotKey>();
    let active: SlotKey | null = null;

    const manager = {
        subscribeSlotClients: (listener: (key: SlotKey, client: unknown) => void) => {
            slotListeners.add(listener);
            for (const key of bound) listener(key, {});
            return () => slotListeners.delete(listener);
        },
        subscribeClient: (listener: () => void) => {
            activeListeners.add(listener);
            listener();
            return () => activeListeners.delete(listener);
        },
        getBoundCid: () => active,
        subscribeSlotVerified: (key: SlotKey, listener: (value: boolean) => void) => {
            listener(verified.has(key));
            const set = verifiedListeners.get(key) ?? new Set();
            set.add(listener);
            verifiedListeners.set(key, set);
            return () => set.delete(listener);
        },
        onSlotType: (key: SlotKey, type: string, listener: () => void) => {
            const id = `${key}|${type}`;
            const set = pushListeners.get(id) ?? new Set();
            set.add(listener);
            pushListeners.set(id, set);
            return () => set.delete(listener);
        },
    };

    return {
        manager: manager as unknown as ISocketManager,
        bind(key: SlotKey) {
            bound.add(key);
            for (const listener of [...slotListeners]) listener(key, {});
        },
        teardown(key: SlotKey) {
            for (const listener of [...slotListeners]) listener(key, null);
            bound.delete(key);
            verified.delete(key);
        },
        activate(key: SlotKey | null) {
            active = key;
            for (const listener of [...activeListeners]) listener();
        },
        verify(key: SlotKey, value = true) {
            if (value) verified.add(key);
            else verified.delete(key);
            for (const listener of [...(verifiedListeners.get(key) ?? [])]) listener(value);
        },
        push(key: SlotKey, type = 'chat.sync') {
            for (const listener of [...(pushListeners.get(`${key}|${type}`) ?? [])]) listener();
        },
    };
};

/** One cloud's scoped graph: a cursor store of its own and a delta that answers with the next cursor. */
const createGraph = () => {
    const cursors = new Map<string, number>();
    let next = 1_000;
    return {
        cursors,
        channel: {
            syncChannels: jest.fn(async (since: number) => ({
                syncedAt: Math.max(since, (next += 1)),
                removedCount: 0,
            })),
        },
        place: { refreshList: jest.fn(async () => undefined) },
        syncMeta: {
            getSyncedAt: jest.fn(async (kind: string) => cursors.get(kind) ?? 0),
            setSyncedAt: jest.fn(async (kind: string, value: number) => {
                cursors.set(kind, value);
            }),
        },
    };
};

type Graph = ReturnType<typeof createGraph>;

/** Lets every pending promise chain run, without moving the fake clock. */
const flush = async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

describe('BackgroundReceiver', () => {
    let socket: ReturnType<typeof createManager>;
    let graphs: Map<string, Graph>;
    let uids: Map<string, string | null>;
    let receiver: BackgroundReceiver | null;

    const graphOf = (cid: string): Graph => {
        let graph = graphs.get(cid);
        if (!graph) {
            graph = createGraph();
            graphs.set(cid, graph);
        }
        return graph;
    };

    const start = (deps: BackgroundReceiverDeps = {}) => {
        receiver = new BackgroundReceiver(socket.manager, {
            getRepositories: cid => graphOf(cid) as unknown as BackgroundReceiveRepositories,
            getUid: cid => (uids.has(cid) ? (uids.get(cid) ?? null) : `uid-${cid}`),
            now: () => Date.now(),
            intervalMs: INTERVAL,
            debounceMs: DEBOUNCE,
            placeRefreshMs: PLACE,
            ...deps,
        });
        return receiver;
    };

    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(10_000_000);
        jest.clearAllMocks();
        socket = createManager();
        graphs = new Map();
        uids = new Map();
        receiver = null;
    });

    afterEach(() => {
        receiver?.destroy();
        jest.useRealTimers();
    });

    /** Relay active, A bound in the background and verified — the common starting point. */
    const startWithBackgroundA = async () => {
        socket.bind(RELAY);
        socket.activate(RELAY);
        socket.verify(RELAY);
        start();
        socket.bind(A);
        socket.verify(A);
        await flush();
    };

    it('asks a background cloud for its delta through its own graph, from its own cursor, when it verifies', async () => {
        await startWithBackgroundA();

        const graph = graphOf(A);
        expect(graph.syncMeta.getSyncedAt).toHaveBeenCalledWith('channel-sync:cloud-a');
        expect(graph.channel.syncChannels).toHaveBeenCalledTimes(1);
        expect(graph.channel.syncChannels).toHaveBeenCalledWith(0);
        expect(graph.cursors.get('channel-sync:cloud-a')).toBe(1_001);
        // The active slot is the app's to keep current.
        expect(graphs.has(RELAY)).toBe(false);
    });

    it('never asks for the active slot — not on verify, not on a tick, not on a push', async () => {
        await startWithBackgroundA();
        socket.push(RELAY);
        jest.advanceTimersByTime(INTERVAL * 3);
        await flush();

        expect(graphs.has(RELAY)).toBe(false);
    });

    it('answers a burst of pushes with one delta, after the debounce', async () => {
        await startWithBackgroundA();
        const graph = graphOf(A);
        graph.channel.syncChannels.mockClear();

        socket.push(A);
        socket.push(A);
        jest.advanceTimersByTime(DEBOUNCE - 1);
        socket.push(A);
        jest.advanceTimersByTime(DEBOUNCE - 1);
        await flush();
        expect(graph.channel.syncChannels).not.toHaveBeenCalled();

        jest.advanceTimersByTime(1);
        await flush();
        expect(graph.channel.syncChannels).toHaveBeenCalledTimes(1);
        // From the cursor the first delta left, not from zero again.
        expect(graph.channel.syncChannels).toHaveBeenCalledWith(1_001);
    });

    it('asks again on every interval while verified, and not while the socket is down', async () => {
        await startWithBackgroundA();
        const graph = graphOf(A);
        graph.channel.syncChannels.mockClear();

        jest.advanceTimersByTime(INTERVAL);
        await flush();
        expect(graph.channel.syncChannels).toHaveBeenCalledTimes(1);

        socket.verify(A, false);
        jest.advanceTimersByTime(INTERVAL * 2);
        await flush();
        expect(graph.channel.syncChannels).toHaveBeenCalledTimes(1);

        // Coming back is its own edge.
        socket.verify(A);
        await flush();
        expect(graph.channel.syncChannels).toHaveBeenCalledTimes(2);
    });

    it('stops when its cloud becomes the active one, and resumes when the user leaves it', async () => {
        await startWithBackgroundA();
        const graph = graphOf(A);
        graph.channel.syncChannels.mockClear();

        // A switch onto A, with a push pending: neither the pending debounce nor the timer runs.
        socket.push(A);
        socket.activate(A);
        jest.advanceTimersByTime(INTERVAL * 2);
        socket.push(A);
        await flush();
        expect(graph.channel.syncChannels).not.toHaveBeenCalled();

        // Back to the relay a minute or more after A last received: A asks straight away — after
        // the debounce, not in the same pass as the pointer move.
        socket.activate(RELAY);
        await flush();
        expect(graph.channel.syncChannels).not.toHaveBeenCalled();
        jest.advanceTimersByTime(DEBOUNCE);
        await flush();
        expect(graph.channel.syncChannels).toHaveBeenCalledTimes(1);
    });

    it('asks nothing of a cloud the user leaves when its slot goes in the same pass', async () => {
        // A cloud that is not kept: the binder moves the pointer off it and tears its slot down
        // together. The loop it gets for that instant must not send on a socket that is going.
        socket.bind(RELAY);
        socket.bind(A);
        socket.activate(A);
        socket.verify(RELAY);
        socket.verify(A);
        start();
        await flush();
        expect(graphs.has(A)).toBe(false);

        socket.activate(RELAY);
        socket.teardown(A);
        jest.advanceTimersByTime(DEBOUNCE);
        await flush();

        expect(graphs.has(A)).toBe(false);
    });

    it('does not ask at once when it leaves the screen within an interval of its last delta', async () => {
        await startWithBackgroundA();
        const graph = graphOf(A);
        graph.channel.syncChannels.mockClear();

        socket.activate(A);
        jest.advanceTimersByTime(INTERVAL / 2);
        socket.activate(RELAY);
        await flush();
        expect(graph.channel.syncChannels).not.toHaveBeenCalled();

        jest.advanceTimersByTime(INTERVAL);
        await flush();
        expect(graph.channel.syncChannels).toHaveBeenCalledTimes(1);
    });

    it('a cloud the user entered and leaves within an interval waits for its tick', async () => {
        // The binder binds a slot, then moves the pointer onto it. From then on the app keeps that
        // cloud current, so leaving it is not a reason to ask again at once — not even when this
        // loop has never received for it.
        socket.bind(RELAY);
        socket.activate(RELAY);
        socket.verify(RELAY);
        start();
        socket.bind(A);
        socket.activate(A);
        socket.verify(A);
        await flush();
        expect(graphs.has(A)).toBe(false);

        jest.advanceTimersByTime(INTERVAL / 2);
        socket.activate(RELAY);
        jest.advanceTimersByTime(DEBOUNCE);
        await flush();
        expect(graphs.has(A)).toBe(false);

        jest.advanceTimersByTime(INTERVAL);
        await flush();
        expect(graphOf(A).channel.syncChannels).toHaveBeenCalledTimes(1);
        // Its places were the app's to keep current too.
        expect(graphOf(A).place.refreshList).not.toHaveBeenCalled();
    });

    it('turns a lookup that throws into the failure warning, not an unhandled rejection', async () => {
        const unhandled = jest.fn();
        process.on('unhandledRejection', unhandled);
        try {
            socket.bind(RELAY);
            socket.activate(RELAY);
            start({
                getRepositories: () => {
                    throw new Error('data runtime not assembled');
                },
            });
            socket.bind(A);
            socket.verify(A);
            await flush();
            await Promise.resolve();

            const failures = (logger.warn as jest.Mock).mock.calls.filter(([, message]) =>
                message.includes('delta failed')
            );
            expect(failures).toHaveLength(1);
            expect(unhandled).not.toHaveBeenCalled();
        } finally {
            process.off('unhandledRejection', unhandled);
        }
    });

    it('receives for the relay while a cloud is on screen', async () => {
        socket.bind(RELAY);
        socket.activate(RELAY);
        socket.verify(RELAY);
        start();
        await flush();
        expect(graphs.has(RELAY)).toBe(false);

        socket.bind(A);
        socket.activate(A);
        jest.advanceTimersByTime(DEBOUNCE);
        await flush();

        expect(graphOf(RELAY).channel.syncChannels).toHaveBeenCalledTimes(1);
        expect(graphOf(RELAY).syncMeta.getSyncedAt).toHaveBeenCalledWith('channel-sync:default');
    });

    it('runs one delta at a time and folds what arrives meanwhile into exactly one more', async () => {
        await startWithBackgroundA();
        const graph = graphOf(A);
        graph.channel.syncChannels.mockClear();
        let answer!: () => void;
        graph.channel.syncChannels.mockImplementationOnce(
            () => new Promise(resolve => (answer = () => resolve({ syncedAt: 2_000, removedCount: 0 })))
        );

        jest.advanceTimersByTime(INTERVAL);
        await flush();
        receiver?.receiveNow();
        socket.push(A);
        jest.advanceTimersByTime(DEBOUNCE);
        receiver?.receiveNow();
        await flush();
        expect(graph.channel.syncChannels).toHaveBeenCalledTimes(1);

        answer();
        await flush();
        expect(graph.channel.syncChannels).toHaveBeenCalledTimes(2);
        expect(graph.channel.syncChannels).toHaveBeenLastCalledWith(2_000);
    });

    it('asks nothing of a cloud where the account has no uid', async () => {
        uids.set(A, null);
        await startWithBackgroundA();

        expect(graphs.has(A)).toBe(false);
    });

    it('leaves the cursor alone when the account changed while the delta was on its way', async () => {
        socket.bind(RELAY);
        socket.activate(RELAY);
        start();
        socket.bind(A);
        const graph = graphOf(A);
        graph.channel.syncChannels.mockImplementationOnce(async () => {
            uids.set(A, 'someone-else');
            return { syncedAt: 5_000, removedCount: 0 };
        });

        socket.verify(A);
        await flush();

        expect(graph.channel.syncChannels).toHaveBeenCalledTimes(1);
        expect(graph.syncMeta.setSyncedAt).not.toHaveBeenCalled();
    });

    it('keeps the cursor where it was when the delta fails, and reports a failing streak once', async () => {
        await startWithBackgroundA();
        const graph = graphOf(A);
        graph.syncMeta.setSyncedAt.mockClear();
        graph.channel.syncChannels.mockRejectedValue(new Error('408 timeout'));

        jest.advanceTimersByTime(INTERVAL);
        await flush();
        jest.advanceTimersByTime(INTERVAL);
        await flush();

        expect(graph.channel.syncChannels).toHaveBeenLastCalledWith(1_001);
        expect(graph.syncMeta.setSyncedAt).not.toHaveBeenCalled();
        const failures = (logger.warn as jest.Mock).mock.calls.filter(([, message]) =>
            message.includes('delta failed')
        );
        expect(failures).toHaveLength(1);

        graph.channel.syncChannels.mockResolvedValue({ syncedAt: 3_000, removedCount: 0 });
        jest.advanceTimersByTime(INTERVAL);
        await flush();
        expect(graph.cursors.get('channel-sync:cloud-a')).toBe(3_000);
        expect(logger.info).toHaveBeenCalledWith('SYNC', '[BackgroundReceiver] delta recovered', expect.anything());
    });

    it('reads its place list on its first delta, then only once the place interval has passed', async () => {
        await startWithBackgroundA();
        const graph = graphOf(A);
        expect(graph.place.refreshList).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(PLACE - INTERVAL);
        await flush();
        expect(graph.place.refreshList).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(INTERVAL);
        await flush();
        expect(graph.place.refreshList).toHaveBeenCalledTimes(2);
    });

    it('retries a failed place read on the next delta instead of waiting out the place interval', async () => {
        socket.bind(RELAY);
        socket.activate(RELAY);
        start();
        socket.bind(A);
        graphOf(A).place.refreshList.mockRejectedValueOnce(new Error('504'));
        socket.verify(A);
        await flush();

        jest.advanceTimersByTime(INTERVAL);
        await flush();

        expect(graphOf(A).place.refreshList).toHaveBeenCalledTimes(2);
    });

    it('receiveNow asks every verified background cloud, and not the active or an unverified one', async () => {
        await startWithBackgroundA();
        socket.bind(B);
        await flush();
        const graphA = graphOf(A);
        graphA.channel.syncChannels.mockClear();

        receiver?.receiveNow();
        await flush();

        expect(graphA.channel.syncChannels).toHaveBeenCalledTimes(1);
        expect(graphs.has(B)).toBe(false);
        expect(graphs.has(RELAY)).toBe(false);
    });

    it('receiveNow with a cloud id asks that cloud only', async () => {
        await startWithBackgroundA();
        socket.bind(B);
        socket.verify(B);
        await flush();
        const graphA = graphOf(A);
        const graphB = graphOf(B);
        graphA.channel.syncChannels.mockClear();
        graphB.channel.syncChannels.mockClear();

        receiver?.receiveNow(B);
        jest.advanceTimersByTime(DEBOUNCE);
        await flush();

        expect(graphB.channel.syncChannels).toHaveBeenCalledTimes(1);
        expect(graphA.channel.syncChannels).not.toHaveBeenCalled();
    });

    it('a burst of kicks for one cloud is one request, after the debounce', async () => {
        await startWithBackgroundA();
        const graph = graphOf(A);
        graph.channel.syncChannels.mockClear();

        receiver?.receiveNow(A);
        receiver?.receiveNow(A);
        receiver?.receiveNow(A);
        await flush();
        expect(graph.channel.syncChannels).not.toHaveBeenCalled();

        jest.advanceTimersByTime(DEBOUNCE);
        await flush();
        expect(graph.channel.syncChannels).toHaveBeenCalledTimes(1);
    });

    it('a kick re-reads the place list even inside the place interval', async () => {
        await startWithBackgroundA();
        const graph = graphOf(A);
        graph.place.refreshList.mockClear();

        receiver?.receiveNow(A);
        jest.advanceTimersByTime(DEBOUNCE);
        await flush();

        expect(graph.place.refreshList).toHaveBeenCalledTimes(1);
    });

    it('a push landing in the same debounce as a kick does not lose the kick', async () => {
        await startWithBackgroundA();
        const graph = graphOf(A);
        graph.place.refreshList.mockClear();

        receiver?.receiveNow(A);
        socket.push(A);
        jest.advanceTimersByTime(DEBOUNCE);
        await flush();

        expect(graph.place.refreshList).toHaveBeenCalledTimes(1);
    });

    it('receiveNow with the active cloud id asks nothing', async () => {
        await startWithBackgroundA();

        receiver?.receiveNow(RELAY);
        await flush();

        expect(graphs.has(RELAY)).toBe(false);
    });

    describe('announcing answered deltas', () => {
        it('announces each answered delta with the moment its request went out', async () => {
            const onDelta = jest.fn();
            socket.bind(RELAY);
            socket.activate(RELAY);
            start({ onDelta });
            socket.bind(A);
            const graph = graphOf(A);
            // The answer comes back a second after the request, so the two moments are told apart.
            graph.channel.syncChannels.mockImplementationOnce(async () => {
                jest.setSystemTime(Date.now() + 1_000);
                return { syncedAt: 2_000, removedCount: 0 };
            });

            socket.verify(A);
            await flush();

            expect(onDelta).toHaveBeenCalledTimes(1);
            expect(onDelta).toHaveBeenCalledWith({ cid: 'cloud-a', requestedAt: 10_000_000 });
        });

        it('announces nothing for a delta that failed', async () => {
            const onDelta = jest.fn();
            socket.bind(RELAY);
            socket.activate(RELAY);
            start({ onDelta });
            socket.bind(A);
            graphOf(A).channel.syncChannels.mockRejectedValueOnce(new Error('408 timeout'));

            socket.verify(A);
            await flush();

            expect(onDelta).not.toHaveBeenCalled();
        });

        it('announces nothing when the account changed while the delta was on its way', async () => {
            const onDelta = jest.fn();
            socket.bind(RELAY);
            socket.activate(RELAY);
            start({ onDelta });
            socket.bind(A);
            graphOf(A).channel.syncChannels.mockImplementationOnce(async () => {
                uids.set(A, 'someone-else');
                return { syncedAt: 5_000, removedCount: 0 };
            });

            socket.verify(A);
            await flush();

            expect(onDelta).not.toHaveBeenCalled();
        });

        it('a request that lands during a run is answered by a later request, announced with its own time', async () => {
            const onDelta = jest.fn();
            await startWithBackgroundA();
            receiver?.destroy();
            start({ onDelta });
            await flush();
            onDelta.mockClear();
            const graph = graphOf(A);
            let answer!: () => void;
            graph.channel.syncChannels.mockImplementationOnce(
                (since: number) =>
                    new Promise(resolve => {
                        answer = () => resolve({ syncedAt: since + 1, removedCount: 0 });
                    })
            );

            receiver?.receiveNow(A);
            jest.advanceTimersByTime(DEBOUNCE);
            await flush();
            jest.setSystemTime(Date.now() + 5_000);
            receiver?.receiveNow(A);
            jest.advanceTimersByTime(DEBOUNCE);
            answer();
            await flush();

            expect(onDelta.mock.calls.map(([delta]) => delta.requestedAt)).toEqual([10_000_300, 10_005_600]);
        });

        it('a kick folded into a tick already in flight still reads places and is announced after both', async () => {
            const onDelta = jest.fn();
            await startWithBackgroundA();
            receiver?.destroy();
            start({ onDelta });
            await flush();
            onDelta.mockClear();
            const graph = graphOf(A);
            graph.place.refreshList.mockClear();
            graph.channel.syncChannels.mockClear();
            let answer!: () => void;
            graph.channel.syncChannels.mockImplementationOnce(
                (since: number) =>
                    new Promise(resolve => {
                        answer = () => resolve({ syncedAt: since + 1, removedCount: 0 });
                    })
            );

            // A tick is on its way when the kick's debounce ends.
            jest.advanceTimersByTime(INTERVAL);
            await flush();
            // The tick read places on its own (a new loop's first delta); only the kick's read counts here.
            graph.place.refreshList.mockClear();
            receiver?.receiveNow(A);
            jest.advanceTimersByTime(DEBOUNCE);
            answer();
            await flush();

            expect(graph.channel.syncChannels).toHaveBeenCalledTimes(2);
            expect(graph.place.refreshList).toHaveBeenCalledTimes(1);
            expect(onDelta).toHaveBeenCalledTimes(2);
        });

        it('a kick waits for its place list before announcing, and announces nothing if that read fails', async () => {
            const onDelta = jest.fn();
            await startWithBackgroundA();
            receiver?.destroy();
            start({ onDelta });
            await flush();
            onDelta.mockClear();
            const graph = graphOf(A);
            let finishPlaces!: (ok: boolean) => void;
            graph.place.refreshList.mockImplementationOnce(
                () =>
                    new Promise<undefined>((resolve, reject) => {
                        finishPlaces = ok => (ok ? resolve(undefined) : reject(new Error('502')));
                    })
            );

            receiver?.receiveNow(A);
            jest.advanceTimersByTime(DEBOUNCE);
            await flush();
            expect(graph.channel.syncChannels).toHaveBeenCalled();
            expect(onDelta).not.toHaveBeenCalled();

            finishPlaces(false);
            await flush();
            expect(onDelta).not.toHaveBeenCalled();

            receiver?.receiveNow(A);
            jest.advanceTimersByTime(DEBOUNCE);
            await flush();
            expect(onDelta).toHaveBeenCalledTimes(1);
        });
    });

    it('stops a torn-down slot', async () => {
        await startWithBackgroundA();
        const graph = graphOf(A);
        graph.channel.syncChannels.mockClear();

        socket.teardown(A);
        jest.advanceTimersByTime(INTERVAL * 2);
        socket.push(A);
        jest.advanceTimersByTime(DEBOUNCE);
        await flush();

        expect(graph.channel.syncChannels).not.toHaveBeenCalled();
    });

    it("a run caught by its slot's rebuild neither asks nor moves the cursor; the new loop does", async () => {
        await startWithBackgroundA();
        const graph = graphOf(A);
        graph.channel.syncChannels.mockClear();
        graph.syncMeta.setSyncedAt.mockClear();
        let readCursor!: (value: number) => void;
        graph.syncMeta.getSyncedAt.mockImplementationOnce(() => new Promise(resolve => (readCursor = resolve)));

        jest.advanceTimersByTime(INTERVAL);
        await flush();
        // The manager rebuilds a slot as a teardown followed by a new bind.
        socket.teardown(A);
        socket.bind(A);
        readCursor(1_001);
        await flush();
        expect(graph.channel.syncChannels).not.toHaveBeenCalled();

        // The new connection verifies and its own loop asks.
        socket.verify(A);
        await flush();
        expect(graph.channel.syncChannels).toHaveBeenCalledTimes(1);
        expect(graph.syncMeta.setSyncedAt).toHaveBeenCalledTimes(1);
    });

    it('an answer that lands after its slot was rebuilt does not move the cursor', async () => {
        await startWithBackgroundA();
        const graph = graphOf(A);
        graph.syncMeta.setSyncedAt.mockClear();
        let answer!: () => void;
        graph.channel.syncChannels.mockImplementationOnce(
            () => new Promise(resolve => (answer = () => resolve({ syncedAt: 9_000, removedCount: 0 })))
        );

        jest.advanceTimersByTime(INTERVAL);
        await flush();
        socket.teardown(A);
        socket.bind(A);
        answer();
        await flush();

        expect(graph.syncMeta.setSyncedAt).not.toHaveBeenCalled();
    });

    it('destroy stops every loop', async () => {
        await startWithBackgroundA();
        const graph = graphOf(A);
        graph.channel.syncChannels.mockClear();

        receiver?.destroy();
        receiver = null;
        jest.advanceTimersByTime(INTERVAL * 2);
        socket.push(A);
        jest.advanceTimersByTime(DEBOUNCE);
        await flush();

        expect(graph.channel.syncChannels).not.toHaveBeenCalled();
    });
});
