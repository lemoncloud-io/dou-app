import { OutboxRefusalError } from './ports';
import type {
    OutboxDelivery,
    OutboxObserver,
    OutboxOp,
    OutboxPort,
    OutboxSettleOutcome,
    OutboxTransport,
    OutboxValues,
    StateSpec,
    StateWrite,
    WriteReceipt,
} from './ports';

interface Waiter {
    seq: number;
    resolve: () => void;
    reject: (error: unknown) => void;
}

interface Watch {
    report: (delivery: OutboxDelivery) => void;
    startedAt: number;
    downSince: number | null;
    waitSocketMs: number;
    failures: number;
}

interface KeyState {
    write: StateWrite;
    seq: number;
    settledSeq: number;
    accepted: { value: unknown } | null;
    baseline: { value: unknown } | null;
    inFlight: Promise<void> | null;
    failures: number;
    timer: unknown;
    waiters: Waiter[];
    watch: Watch | null;
}

interface CloudState {
    ready: boolean;
    unwatch: () => void;
}

export type StateSpecs<R = unknown> = { [Op in OutboxOp]?: StateSpec<OutboxValues[Op], R> };

export class OutboxAccountChangedError extends Error {
    constructor() {
        super('The account changed before this write went out');
        this.name = 'OutboxAccountChangedError';
    }
}

const idOf = (write: StateWrite): string => `${write.cid}|${write.uid}|${write.op}|${write.key}`;

export const createStateOutbox = <R>({
    specs,
    transport,
    observer,
}: {
    specs: StateSpecs<R>;
    transport: OutboxTransport<R>;
    observer?: OutboxObserver;
}): OutboxPort & { pending(cid?: string): readonly StateWrite[]; flush(): Promise<void> } => {
    const keys = new Map<string, KeyState>();
    const clouds = new Map<string, CloudState>();
    let sequence = 0;

    const specOf = (op: OutboxOp): StateSpec<unknown, R> => {
        const spec = specs[op] as unknown as StateSpec<unknown, R> | undefined;
        if (!spec) throw new Error(`[outbox] no spec for ${op}`);
        return spec;
    };

    const isPending = (state: KeyState): boolean => state.seq > state.settledSeq;

    const cancelTimer = (state: KeyState): void => {
        if (state.timer === undefined) return;
        transport.clearTimer(state.timer);
        state.timer = undefined;
    };

    const beginWatch = (cid: string): Watch | null => {
        const report = observer?.begin();
        if (!observer || !report) return null;
        const startedAt = observer.now();
        const downSince = clouds.get(cid)?.ready ? null : startedAt;
        return { report, startedAt, downSince, waitSocketMs: 0, failures: 0 };
    };

    const noteReadiness = (cid: string, ready: boolean): void => {
        if (!observer) return;
        for (const state of keys.values()) {
            const watch = state.watch;
            if (!watch || state.write.cid !== cid) continue;
            if (ready && watch.downSince !== null) {
                watch.waitSocketMs += observer.now() - watch.downSince;
                watch.downSince = null;
            } else if (!ready && watch.downSince === null) {
                watch.downSince = observer.now();
            }
        }
    };

    const endWatch = (state: KeyState, outcome: OutboxSettleOutcome, answered: boolean): void => {
        const watch = state.watch;
        if (!observer || !watch) return;
        state.watch = null;
        const at = observer.now();
        const down = watch.downSince === null ? 0 : at - watch.downSince;
        try {
            watch.report({
                op: state.write.op,
                cid: state.write.cid,
                outcome,
                deliveryMs: at - watch.startedAt,
                waitSocketMs: watch.waitSocketMs + down,
                attempts: watch.failures + (answered ? 1 : 0),
            });
        } catch {
            // A measurement must not change what the outbox does next.
        }
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

        const currentUid = transport.uidOf(cid);
        if (uid && currentUid !== null && currentUid !== uid) {
            state.settledSeq = state.seq;
            settleWaiters(state, state.seq, new OutboxAccountChangedError());
            endWatch(state, 'account_changed', false);
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
                    if (!isPending(state)) endWatch(state, 'accepted', true);
                    afterSettle(state);
                },
                (error: unknown) => {
                    state.inFlight = null;
                    if (error instanceof OutboxRefusalError || transport.isRefusal(error)) {
                        state.settledSeq = Math.max(state.settledSeq, seq);
                        settleWaiters(state, seq, error);
                        if (!isPending(state)) endWatch(state, 'refused', true);
                        const restore = spec.restore;
                        const restoreTo = state.accepted ?? state.baseline;
                        if (!isPending(state) && restore && restoreTo) {
                            void transport
                                .inCloud(cid, repositories => restore(repositories, write, restoreTo.value))
                                .catch(() => undefined);
                        }
                        afterSettle(state);
                        return;
                    }
                    state.failures += 1;
                    if (state.watch) state.watch.failures += 1;
                    const delay = transport.retryDelaysMs[state.failures - 1];
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
        const unwatch = transport.watchReady(cid, ready => {
            const becameReady = ready && !cloud.ready;
            cloud.ready = ready;
            noteReadiness(cid, ready);
            if (!becameReady) return;
            for (const state of keys.values()) {
                if (state.write.cid !== cid) continue;
                state.failures = 0;
                drain(state);
            }
        });
        if (clouds.get(cid) === cloud) cloud.unwatch = unwatch;
        else unwatch();
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
            const startsWaiting = !state || !isPending(state);
            if (!state) {
                state = {
                    write,
                    seq: sequence,
                    settledSeq: 0,
                    accepted: null,
                    baseline: 'previous' in write ? { value: write.previous } : null,
                    inFlight: null,
                    failures: 0,
                    timer: undefined,
                    waiters: [],
                    watch: null,
                };
                keys.set(id, state);
            } else {
                if (!isPending(state)) state.baseline = 'previous' in write ? { value: write.previous } : null;
                if (!state.inFlight) state.failures = 0;
                const value = isPending(state) && spec.merge ? spec.merge(state.write.value, write.value) : write.value;
                state.write = { ...write, value };
                state.seq = sequence;
            }

            const current = state;
            if (startsWaiting) current.watch = beginWatch(write.cid);
            const delivered = new Promise<void>((resolve, reject) => {
                current.waiters.push({ seq: current.seq, resolve, reject });
            });
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
            for (;;) {
                const inFlight = [...keys.values()].map(state => state.inFlight).filter(Boolean);
                if (!inFlight.length) return;
                await Promise.all(inFlight);
            }
        },
    };
};

export const createImmediateTransport = <R>(graph: () => R): OutboxTransport<R> => ({
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
