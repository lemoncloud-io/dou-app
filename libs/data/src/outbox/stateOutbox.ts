import type { DataRepositories } from '../repositories';
import type { OutboxOp, OutboxPort, OutboxTransport, OutboxValues, StateSpec, StateWrite, WriteReceipt } from './ports';

/**
 * The state outbox: every state write goes two ways — the repository writes it locally first, then
 * hands it here — and this machine gets it to the server whenever the write's cloud can carry it.
 *
 * **One value per key.** It holds the latest value per `(cid, uid, op, key)`, folding a new one into a
 * value still waiting (`merge`), and keeps one request per key in flight; a value set meanwhile goes
 * right after. A value the server already holds (`isCovered`) resolves without a request — but only
 * while nothing waits for that key: with a value queued, setting the accepted value again has to
 * replace the queued one, or the server would end on the queued value.
 *
 * **Retries.** A failure while the socket still looks ready (a 408, a 5xx, a close the slot has not
 * noticed yet) is retried on the transport's bounded schedule; past that, and for any failure while
 * the socket is down, the next ready transition is the retry, and it restarts the schedule. A repeat
 * is harmless here and collapsed to one request per key, which is what makes a timer safe — the chat
 * send's outbox, whose every attempt mints a row, must not have one.
 *
 * **A refusal is final.** The refused value is dropped, its receipts reject, and the spec puts the
 * last value the server accepted back locally (or the value the write replaced, when it accepted
 * none). A value set after the refused one is its own write and still goes out.
 *
 * **Late answers do not win.** The server's answer to a request is recorded only when no newer value
 * is waiting for the key; otherwise a quick on → off → on would show the first answer for a moment.
 */

interface Waiter {
    seq: number;
    resolve: () => void;
    reject: (error: unknown) => void;
}

interface KeyState {
    write: StateWrite;
    /** Sequence of the latest set for this key. */
    seq: number;
    /** Highest sequence the server has answered for good, accepted or refused. */
    settledSeq: number;
    /** The last value the server accepted. */
    accepted: { value: unknown } | null;
    /** What a refusal restores when nothing was accepted: the value before the first waiting write. */
    baseline: unknown;
    inFlight: Promise<void> | null;
    failures: number;
    timer: unknown;
    waiters: Waiter[];
}

interface CloudState {
    ready: boolean;
    unwatch: () => void;
}

export type StateSpecs = { [Op in OutboxOp]?: StateSpec<OutboxValues[Op]> };

/** The write was made by an account that is no longer the one signed in to its cloud. */
export class OutboxAccountChangedError extends Error {
    constructor() {
        super('The account changed before this write went out');
        this.name = 'OutboxAccountChangedError';
    }
}

const idOf = (write: StateWrite): string => `${write.cid}|${write.uid}|${write.op}|${write.key}`;

export const createStateOutbox = ({
    specs,
    transport,
}: {
    specs: StateSpecs;
    transport: OutboxTransport;
}): OutboxPort & { pending(cid?: string): readonly StateWrite[]; flush(): Promise<void> } => {
    const keys = new Map<string, KeyState>();
    const clouds = new Map<string, CloudState>();
    let sequence = 0;

    const specOf = (op: OutboxOp): StateSpec<unknown> => {
        // One spec per op, so the value types line up per key; the machine itself only moves values.
        const spec = specs[op] as unknown as StateSpec<unknown> | undefined;
        if (!spec) throw new Error(`[outbox] no spec for ${op}`);
        return spec;
    };

    const isPending = (state: KeyState): boolean => state.seq > state.settledSeq;

    const cancelTimer = (state: KeyState): void => {
        if (state.timer === undefined) return;
        transport.clearTimer(state.timer);
        state.timer = undefined;
    };

    const settleWaiters = (state: KeyState, seq: number, error?: unknown): void => {
        const remaining: Waiter[] = [];
        for (const waiter of state.waiters) {
            if (waiter.seq > seq) remaining.push(waiter);
            else if (error === undefined) waiter.resolve();
            else waiter.reject(error);
        }
        state.waiters = remaining;
    };

    // Watch a cloud only while it has something to send, so an idle session holds no listeners.
    const releaseCloudIfIdle = (cid: string): void => {
        const cloud = clouds.get(cid);
        if (!cloud) return;
        for (const state of keys.values()) {
            if (state.write.cid === cid && isPending(state)) return;
        }
        clouds.delete(cid);
        cloud.unwatch();
    };

    const afterSettle = (state: KeyState): void => {
        if (isPending(state)) drain(state);
        else releaseCloudIfIdle(state.write.cid);
    };

    const drain = (state: KeyState): void => {
        const { cid, uid } = state.write;
        if (state.inFlight || !isPending(state) || !clouds.get(cid)?.ready) return;
        cancelTimer(state);

        // Another account is signed in to this cloud now: its partition, its server, not this write's.
        // No uid at all says nothing either way (a host that does not track accounts).
        const currentUid = transport.uidOf(cid);
        if (currentUid !== null && currentUid !== uid) {
            state.settledSeq = state.seq;
            settleWaiters(state, state.seq, new OutboxAccountChangedError());
            releaseCloudIfIdle(cid);
            return;
        }

        const spec = specOf(state.write.op);
        const write = { ...state.write };
        const seq = state.seq;
        state.inFlight = transport
            .inCloud(cid, async repositories => {
                const answer = await spec.deliver(repositories, write);
                if (state.seq === seq) await spec.accept?.(repositories, write, answer);
            })
            .then(
                () => {
                    state.inFlight = null;
                    state.failures = 0;
                    state.settledSeq = Math.max(state.settledSeq, seq);
                    state.accepted = { value: write.value };
                    settleWaiters(state, seq);
                    afterSettle(state);
                },
                (error: unknown) => {
                    state.inFlight = null;
                    if (transport.isRefusal(error)) {
                        state.settledSeq = Math.max(state.settledSeq, seq);
                        settleWaiters(state, seq, error);
                        const restore = spec.restore;
                        const restoreTo = state.accepted ? state.accepted.value : state.baseline;
                        // Nothing to put back over a newer value: it is its own write and goes out next.
                        if (!isPending(state) && restore && restoreTo !== undefined) {
                            void transport
                                .inCloud(cid, repositories => restore(repositories, write, restoreTo))
                                .catch(() => undefined);
                        }
                        afterSettle(state);
                        return;
                    }
                    state.failures += 1;
                    const delay = transport.retryDelaysMs[state.failures - 1];
                    // Out of retries, or the socket is already known to be down: the next ready
                    // transition is the retry.
                    if (delay === undefined || !clouds.get(cid)?.ready) return;
                    state.timer = transport.setTimer(() => {
                        state.timer = undefined;
                        drain(state);
                    }, delay);
                }
            );
    };

    const watchCloud = (cid: string): void => {
        if (clouds.has(cid)) return;
        const cloud: CloudState = { ready: false, unwatch: () => undefined };
        clouds.set(cid, cloud);
        // `watchReady` reports the current value synchronously, which drains right away when the
        // socket is already up.
        cloud.unwatch = transport.watchReady(cid, ready => {
            const becameReady = ready && !cloud.ready;
            cloud.ready = ready;
            if (!becameReady) return;
            for (const state of keys.values()) {
                if (state.write.cid !== cid) continue;
                // A reconnect is a fresh start for a key that ran out of timed retries.
                state.failures = 0;
                drain(state);
            }
        });
    };

    return {
        set: <V>(write: StateWrite<V>): WriteReceipt => {
            const spec = specOf(write.op);
            const id = idOf(write);
            let state = keys.get(id);

            if (state?.accepted && !isPending(state) && spec.isCovered?.(state.accepted.value, write.value)) {
                return { delivered: Promise.resolve() };
            }

            sequence += 1;
            if (!state) {
                state = {
                    write,
                    seq: sequence,
                    settledSeq: 0,
                    accepted: null,
                    baseline: write.previous,
                    inFlight: null,
                    failures: 0,
                    timer: undefined,
                    waiters: [],
                };
                keys.set(id, state);
            } else {
                if (!isPending(state)) state.baseline = write.previous;
                const value = isPending(state) && spec.merge ? spec.merge(state.write.value, write.value) : write.value;
                state.write = { ...write, value };
                state.seq = sequence;
            }

            const current = state;
            const delivered = new Promise<void>((resolve, reject) => {
                current.waiters.push({ seq: current.seq, resolve, reject });
            });
            // Many callers never look at the server half; a refusal nobody asked about must not surface
            // as an unhandled rejection. A caller that chains on `delivered` still sees it.
            delivered.catch(() => undefined);
            watchCloud(write.cid);
            drain(current);
            return { delivered };
        },
        pending: cid =>
            [...keys.values()]
                .filter(state => isPending(state) && (!cid || state.write.cid === cid))
                .map(state => state.write),
        flush: async () => {
            // A settled send can start the next one, so keep waiting until nothing is in flight.
            for (;;) {
                const inFlight = [...keys.values()].map(state => state.inFlight).filter(Boolean);
                if (!inFlight.length) return;
                await Promise.all(inFlight);
            }
        },
    };
};

/**
 * A transport that sends at once through one graph and treats every failure as final — what a host
 * without a socket runtime gets (tests, a bare `createRepositories`). The app runtime always injects
 * its own, so screens never meet this one.
 */
export const createImmediateTransport = (graph: () => DataRepositories): OutboxTransport => ({
    watchReady: (_cid, listener) => {
        listener(true);
        return () => undefined;
    },
    inCloud: (_cid, work) => work(graph()),
    uidOf: () => null,
    isRefusal: () => true,
    retryDelaysMs: [],
    setTimer: (callback, ms) => setTimeout(callback, ms),
    clearTimer: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
});
