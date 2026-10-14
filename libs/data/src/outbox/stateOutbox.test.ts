import type { DataRepositories } from '../repositories';
import type { OutboxDelivery, OutboxObserver, OutboxTransport, StateSpec, StateWrite } from './ports';
import { OutboxRefusalError } from './ports';
import { createStateOutbox, OutboxAccountChangedError, type StateSpecs } from './stateOutbox';

const CID = 'cloud-a';
const UID = 'me';

/**
 * A transport the test drives: readiness per cloud it flips, timers that only run when fired, a uid
 * per cloud it can change, and a graph that is just a marker — the specs below record what they were
 * asked to do with it.
 */
const fakeTransport = () => {
    const listeners = new Map<string, (ready: boolean) => void>();
    const readiness = new Map<string, boolean>();
    const uids = new Map<string, string | null>([[CID, UID]]);
    const timers: Array<{ callback: () => void; ms: number; cleared: boolean }> = [];
    const unwatch = jest.fn();
    const graph = { marker: 'graph' } as unknown as DataRepositories;
    const inCloud = jest.fn((_cid: string, work: (repositories: DataRepositories) => Promise<unknown>) => work(graph));

    const transport: OutboxTransport = {
        watchReady: (cid, listener) => {
            listeners.set(cid, listener);
            listener(readiness.get(cid) ?? false);
            return () => {
                listeners.delete(cid);
                unwatch(cid);
            };
        },
        inCloud: inCloud as OutboxTransport['inCloud'],
        uidOf: cid => uids.get(cid) ?? null,
        isRefusal: error => /^(403|404)/.test((error as Error).message),
        retryDelaysMs: [10, 20],
        setTimer: (callback, ms) => {
            const timer = { callback, ms, cleared: false };
            timers.push(timer);
            return timer;
        },
        clearTimer: handle => {
            (handle as { cleared: boolean }).cleared = true;
        },
    };

    return {
        transport,
        inCloud,
        unwatch,
        listeners,
        setReady: (cid: string, ready: boolean) => {
            readiness.set(cid, ready);
            listeners.get(cid)?.(ready);
        },
        setUid: (cid: string, uid: string | null) => uids.set(cid, uid),
        fireTimers: () => {
            const due = timers.splice(0).filter(timer => !timer.cleared);
            due.forEach(timer => timer.callback());
            return due.map(timer => timer.ms);
        },
    };
};

/** A spec whose every hook is a mock; `deliver` answers per call. Only the value rules vary. */
const mockSpec = <V>(rules: Pick<StateSpec<V>, 'merge' | 'isCovered'> = {}) => ({
    op: 'join.read' as const,
    deliver: jest.fn<Promise<unknown>, [DataRepositories, StateWrite<V>]>().mockResolvedValue({ answer: true }),
    accept: jest.fn<Promise<void>, [DataRepositories, StateWrite<V>, unknown]>().mockResolvedValue(undefined),
    restore: jest.fn<Promise<void>, [DataRepositories, StateWrite<V>, V]>().mockResolvedValue(undefined),
    ...rules,
});

/** A read-like spec: the higher value wins and a lower one is already there. */
const cursorSpec = () =>
    mockSpec<number>({
        merge: (waiting, next) => Math.max(waiting, next),
        isCovered: (accepted, next) => next <= accepted,
    });

/** A setting-like spec: the last value wins and the same value is already there. */
const settingSpec = () => mockSpec<string>({ isCovered: (accepted, next) => accepted === next });

const setup = <V>(spec: ReturnType<typeof mockSpec<V>>, observer?: OutboxObserver) => {
    const fake = fakeTransport();
    const outbox = createStateOutbox({
        specs: { 'join.read': spec } as unknown as StateSpecs,
        transport: fake.transport,
        observer,
    });
    const write = (value: V, over: Partial<StateWrite<V>> = {}): StateWrite<V> => ({
        op: 'join.read',
        cid: CID,
        uid: UID,
        key: 'ch-1',
        value,
        ...over,
    });
    return { ...fake, outbox, write };
};

/** An observer on a clock the test moves, keeping every delivery it is told about. */
const fakeObserver = () => {
    let time = 0;
    const deliveries: OutboxDelivery[] = [];
    const observer: OutboxObserver = {
        now: jest.fn(() => time),
        begin: jest.fn(() => (delivery: OutboxDelivery) => deliveries.push(delivery)),
    };
    return {
        observer,
        deliveries,
        at: (ms: number) => {
            time = ms;
        },
    };
};

/** A promise the test settles, for a request whose answer has to wait for the clock to move. */
const deferred = <T>() => {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

const sentValues = <V>(spec: { deliver: jest.Mock<Promise<unknown>, [DataRepositories, StateWrite<V>]> }) =>
    spec.deliver.mock.calls.map(([, write]) => write.value);

describe('createStateOutbox', () => {
    describe('when it sends', () => {
        it('waits while the socket is down and sends once it is ready', async () => {
            const spec = cursorSpec();
            const { outbox, write, setReady } = setup(spec);

            const { delivered } = outbox.set(write(10));
            await outbox.flush();
            expect(spec.deliver).not.toHaveBeenCalled();
            expect(outbox.pending()).toHaveLength(1);

            setReady(CID, true);
            await delivered;
            expect(sentValues(spec)).toEqual([10]);
        });

        it('sends right away on a ready socket, through the write’s own cloud', async () => {
            const spec = cursorSpec();
            const { outbox, write, setReady, inCloud } = setup(spec);
            setReady(CID, true);

            await outbox.set(write(10)).delivered;

            expect(inCloud).toHaveBeenCalledWith(CID, expect.any(Function));
            expect(outbox.pending()).toEqual([]);
        });

        it('keeps clouds apart: the same key in two clouds is two writes', async () => {
            const spec = cursorSpec();
            const { outbox, write, setReady } = setup(spec);
            void outbox.set(write(10));
            void outbox.set(write(3, { cid: 'cloud-b' }));

            setReady('cloud-b', true);
            await outbox.flush();

            expect(spec.deliver.mock.calls.map(([, w]) => [w.cid, w.value])).toEqual([['cloud-b', 3]]);
            expect(outbox.pending().map(w => w.cid)).toEqual([CID]);
        });

        it('stops watching a cloud once it has nothing left to send', async () => {
            const spec = cursorSpec();
            const { outbox, write, setReady, unwatch, listeners } = setup(spec);
            setReady(CID, true);

            await outbox.set(write(10)).delivered;

            expect(unwatch).toHaveBeenCalledWith(CID);
            expect(listeners.has(CID)).toBe(false);
        });
    });

    describe('one value per key', () => {
        it('folds waiting values with merge — a cursor keeps the highest', async () => {
            const spec = cursorSpec();
            const { outbox, write, setReady } = setup(spec);
            const receipts = [outbox.set(write(10)), outbox.set(write(14)), outbox.set(write(12))];

            setReady(CID, true);
            await Promise.all(receipts.map(r => r.delivered));

            expect(sentValues(spec)).toEqual([14]);
        });

        it('lets the latest value replace a waiting one by default', async () => {
            const spec = settingSpec();
            const { outbox, write, setReady } = setup(spec);
            void outbox.set(write('all'));
            const last = outbox.set(write('none'));

            setReady(CID, true);
            await last.delivered;

            expect(sentValues(spec)).toEqual(['none']);
        });

        it('keeps one request in flight per key and follows up with a value set meanwhile', async () => {
            let answer: () => void = () => undefined;
            const spec = cursorSpec();
            spec.deliver.mockImplementationOnce(() => new Promise(resolve => (answer = () => resolve({}))));
            const { outbox, write, setReady } = setup(spec);
            setReady(CID, true);

            const first = outbox.set(write(10));
            const second = outbox.set(write(11));
            expect(sentValues(spec)).toEqual([10]);

            answer();
            await Promise.all([first.delivered, second.delivered]);
            expect(sentValues(spec)).toEqual([10, 11]);
        });

        it('resolves a value the server already holds without a request', async () => {
            const spec = cursorSpec();
            const { outbox, write, setReady } = setup(spec);
            setReady(CID, true);
            await outbox.set(write(10)).delivered;

            await outbox.set(write(9)).delivered;

            expect(spec.deliver).toHaveBeenCalledTimes(1);
        });

        it('sends a key set back to the accepted value while another value waits', async () => {
            let answer: () => void = () => undefined;
            const spec = settingSpec();
            const { outbox, write, setReady } = setup(spec);
            setReady(CID, true);
            await outbox.set(write('A')).delivered;

            spec.deliver.mockImplementationOnce(() => new Promise(resolve => (answer = () => resolve({}))));
            const toB = outbox.set(write('B'));
            const backToA = outbox.set(write('A'));
            answer();
            await Promise.all([toB.delivered, backToA.delivered]);

            // Skipping the second 'A' as "already on the server" would have left 'B' there.
            expect(sentValues(spec)).toEqual(['A', 'B', 'A']);
        });
    });

    describe('answers', () => {
        it('records the server’s answer through the spec', async () => {
            const spec = cursorSpec();
            const { outbox, write, setReady } = setup(spec);
            setReady(CID, true);

            await outbox.set(write(10)).delivered;

            expect(spec.accept).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ value: 10 }), {
                answer: true,
            });
        });

        it('does not record a late answer when a newer value is already waiting', async () => {
            let answer: () => void = () => undefined;
            const spec = settingSpec();
            spec.deliver.mockImplementationOnce(() => new Promise(resolve => (answer = () => resolve({ v: 'B' }))));
            const { outbox, write, setReady } = setup(spec);
            setReady(CID, true);

            const toB = outbox.set(write('B'));
            const toC = outbox.set(write('C'));
            answer();
            await Promise.all([toB.delivered, toC.delivered]);

            expect(spec.accept.mock.calls.map(([, w]) => w.value)).toEqual(['C']);
        });
    });

    describe('failures', () => {
        it('retries on the bounded schedule while the socket stays ready, then waits for a reconnect', async () => {
            const spec = cursorSpec();
            spec.deliver.mockRejectedValue(new Error('408 REQUEST TIMEOUT'));
            const { outbox, write, setReady, fireTimers } = setup(spec);
            setReady(CID, true);

            void outbox.set(write(10));
            await outbox.flush();
            expect(fireTimers()).toEqual([10]);
            await outbox.flush();
            expect(fireTimers()).toEqual([20]);
            await outbox.flush();
            expect(fireTimers()).toEqual([]);
            expect(spec.deliver).toHaveBeenCalledTimes(3);

            spec.deliver.mockResolvedValue({});
            setReady(CID, false);
            setReady(CID, true);
            await outbox.flush();
            expect(spec.deliver).toHaveBeenCalledTimes(4);
            expect(outbox.pending()).toEqual([]);
        });

        it('waits for the next ready transition when the socket went down under the send', async () => {
            const spec = cursorSpec();
            spec.deliver.mockRejectedValueOnce(new Error('499 CLIENT CLOSED REQUEST'));
            const { outbox, write, setReady, fireTimers } = setup(spec);
            setReady(CID, true);

            const { delivered } = outbox.set(write(10));
            setReady(CID, false);
            await outbox.flush();
            expect(fireTimers()).toEqual([]);

            setReady(CID, true);
            await delivered;
            expect(sentValues(spec)).toEqual([10, 10]);
        });

        it('drops a refused value, rejects its receipt and restores the value it replaced', async () => {
            const spec = settingSpec();
            spec.deliver.mockRejectedValue(new Error('403 FORBIDDEN'));
            const { outbox, write, setReady, fireTimers } = setup(spec);
            setReady(CID, true);

            await expect(outbox.set(write('none', { previous: 'all' })).delivered).rejects.toThrow('403');
            await outbox.flush();

            expect(fireTimers()).toEqual([]);
            expect(outbox.pending()).toEqual([]);
            expect(spec.restore).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ value: 'none' }),
                'all'
            );
        });

        it('restores an empty value too — a room that had no name goes back to having none', async () => {
            const spec = settingSpec();
            spec.deliver.mockRejectedValue(new Error('403 FORBIDDEN'));
            const { outbox, write, setReady } = setup(spec);
            setReady(CID, true);

            await expect(outbox.set(write('Foo', { previous: undefined })).delivered).rejects.toThrow('403');
            await outbox.flush();

            expect(spec.restore).toHaveBeenCalledWith(expect.anything(), expect.anything(), undefined);
        });

        it('restores nothing for a state that names no previous value', async () => {
            const spec = cursorSpec();
            spec.deliver.mockRejectedValue(new Error('403 FORBIDDEN'));
            const { outbox, write, setReady } = setup(spec);
            setReady(CID, true);

            await expect(outbox.set(write(10)).delivered).rejects.toThrow('403');
            await outbox.flush();

            expect(spec.restore).not.toHaveBeenCalled();
        });

        it('treats a precondition the repository found unmet as final, whatever the transport says', async () => {
            const spec = settingSpec();
            spec.deliver.mockRejectedValue(new OutboxRefusalError('[Repository] id is required.'));
            const { outbox, write, setReady, fireTimers } = setup(spec);
            setReady(CID, true);

            await expect(outbox.set(write('New', { previous: 'Old' })).delivered).rejects.toThrow('id is required');
            await outbox.flush();

            expect(fireTimers()).toEqual([]);
            expect(spec.restore).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'Old');
        });

        it('gives a parked key its timed retries again when a new value is set', async () => {
            const spec = settingSpec();
            spec.deliver.mockRejectedValue(new Error('500 INTERNAL'));
            const { outbox, write, setReady, fireTimers } = setup(spec);
            setReady(CID, true);
            void outbox.set(write('A'));
            await outbox.flush();
            fireTimers();
            await outbox.flush();
            fireTimers();
            await outbox.flush();
            expect(fireTimers()).toEqual([]);

            void outbox.set(write('B'));
            await outbox.flush();

            expect(fireTimers()).toEqual([10]);
        });

        it('restores the last accepted value rather than an older baseline', async () => {
            const spec = settingSpec();
            const { outbox, write, setReady } = setup(spec);
            setReady(CID, true);
            await outbox.set(write('mention', { previous: 'all' })).delivered;

            spec.deliver.mockRejectedValueOnce(new Error('403 FORBIDDEN'));
            await expect(outbox.set(write('none', { previous: 'mention' })).delivered).rejects.toThrow('403');
            await outbox.flush();

            expect(spec.restore).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'mention');
        });

        it('still sends a value set after a refused one, and does not restore over it', async () => {
            let refuse: (error: Error) => void = () => undefined;
            const spec = settingSpec();
            spec.deliver.mockImplementationOnce(() => new Promise((_resolve, reject) => (refuse = reject)));
            const { outbox, write, setReady } = setup(spec);
            setReady(CID, true);

            const refused = outbox.set(write('none', { previous: 'all' }));
            const after = outbox.set(write('mention'));
            refuse(new Error('403 FORBIDDEN'));

            await expect(refused.delivered).rejects.toThrow('403');
            await after.delivered;
            expect(sentValues(spec)).toEqual(['none', 'mention']);
            expect(spec.restore).not.toHaveBeenCalled();
        });

        it('keeps a refusal nobody listens to from surfacing as an unhandled rejection', async () => {
            const unhandled = jest.fn();
            process.on('unhandledRejection', unhandled);
            const spec = cursorSpec();
            spec.deliver.mockRejectedValue(new Error('403 FORBIDDEN'));
            const { outbox, write, setReady } = setup(spec);
            setReady(CID, true);

            void outbox.set(write(10));
            await outbox.flush();
            await new Promise(resolve => setTimeout(resolve, 0));

            process.off('unhandledRejection', unhandled);
            expect(unhandled).not.toHaveBeenCalled();
        });
    });

    describe('accounts', () => {
        it('drops a write made by an account that is no longer signed in to its cloud', async () => {
            const spec = cursorSpec();
            const { outbox, write, setReady, setUid } = setup(spec);
            const { delivered } = outbox.set(write(10));

            setUid(CID, 'someone-else');
            setReady(CID, true);

            await expect(delivered).rejects.toBeInstanceOf(OutboxAccountChangedError);
            expect(spec.deliver).not.toHaveBeenCalled();
            expect(outbox.pending()).toEqual([]);
        });

        it('keeps a write made before the uid was known', async () => {
            const spec = cursorSpec();
            const { outbox, write, setReady } = setup(spec);

            const { delivered } = outbox.set(write(10, { uid: '' }));
            setReady(CID, true);
            await delivered;

            expect(spec.deliver).toHaveBeenCalledTimes(1);
        });

        it('sends when the host knows no uid at all', async () => {
            const spec = cursorSpec();
            const { outbox, write, setReady, setUid } = setup(spec);
            setUid(CID, null);
            setReady(CID, true);

            await outbox.set(write(10)).delivered;

            expect(spec.deliver).toHaveBeenCalledTimes(1);
        });
    });

    describe('observer', () => {
        it('reports a write accepted after retries once, with every request it took', async () => {
            const spec = cursorSpec();
            spec.deliver
                .mockRejectedValueOnce(new Error('408 REQUEST TIMEOUT'))
                .mockRejectedValueOnce(new Error('503 SERVICE UNAVAILABLE'));
            const watch = fakeObserver();
            const { outbox, write, setReady, fireTimers } = setup(spec, watch.observer);
            setReady(CID, true);

            void outbox.set(write(10));
            await outbox.flush();
            watch.at(10);
            fireTimers();
            await outbox.flush();
            watch.at(30);
            fireTimers();
            await outbox.flush();

            expect(watch.deliveries).toEqual([
                { op: 'join.read', cid: CID, outcome: 'accepted', deliveryMs: 30, waitSocketMs: 0, attempts: 3 },
            ]);
        });

        it('splits out the time the cloud was not ready, before the send and under it', async () => {
            const spec = cursorSpec();
            const first = deferred<unknown>();
            spec.deliver.mockReturnValueOnce(first.promise);
            const watch = fakeObserver();
            const { outbox, write, setReady } = setup(spec, watch.observer);

            const { delivered } = outbox.set(write(10));
            watch.at(40);
            setReady(CID, true);
            watch.at(45);
            setReady(CID, false);
            first.reject(new Error('499 CLIENT CLOSED REQUEST'));
            await outbox.flush();
            watch.at(70);
            setReady(CID, true);
            watch.at(75);
            await delivered;

            expect(watch.deliveries).toEqual([
                { op: 'join.read', cid: CID, outcome: 'accepted', deliveryMs: 75, waitSocketMs: 65, attempts: 2 },
            ]);
        });

        it('reports a refused write as refused', async () => {
            const spec = settingSpec();
            spec.deliver.mockRejectedValue(new Error('403 FORBIDDEN'));
            const watch = fakeObserver();
            const { outbox, write, setReady } = setup(spec, watch.observer);
            setReady(CID, true);

            await expect(outbox.set(write('none', { previous: 'all' })).delivered).rejects.toThrow('403');

            expect(watch.deliveries).toEqual([
                { op: 'join.read', cid: CID, outcome: 'refused', deliveryMs: 0, waitSocketMs: 0, attempts: 1 },
            ]);
        });

        it('reports a write another account overtook, with no request sent', async () => {
            const spec = cursorSpec();
            const watch = fakeObserver();
            const { outbox, write, setReady, setUid } = setup(spec, watch.observer);

            const { delivered } = outbox.set(write(10));
            setUid(CID, 'someone-else');
            watch.at(20);
            setReady(CID, true);
            await expect(delivered).rejects.toBeInstanceOf(OutboxAccountChangedError);

            expect(watch.deliveries).toEqual([
                {
                    op: 'join.read',
                    cid: CID,
                    outcome: 'account_changed',
                    deliveryMs: 20,
                    waitSocketMs: 20,
                    attempts: 0,
                },
            ]);
        });

        it('counts a value replaced in flight once, from the first set to the last answer', async () => {
            const spec = cursorSpec();
            const first = deferred<unknown>();
            spec.deliver.mockReturnValueOnce(first.promise);
            const watch = fakeObserver();
            const { outbox, write, setReady } = setup(spec, watch.observer);
            setReady(CID, true);

            void outbox.set(write(10));
            watch.at(5);
            const { delivered } = outbox.set(write(12));
            watch.at(15);
            first.resolve({});
            await outbox.flush();
            await delivered;

            expect(sentValues(spec)).toEqual([10, 12]);
            expect(watch.observer.begin).toHaveBeenCalledTimes(1);
            expect(watch.deliveries).toEqual([
                { op: 'join.read', cid: CID, outcome: 'accepted', deliveryMs: 15, waitSocketMs: 0, attempts: 1 },
            ]);
        });

        it('counts the failed requests of a write another account overtook on its retry', async () => {
            const spec = cursorSpec();
            spec.deliver.mockRejectedValueOnce(new Error('499 CLIENT CLOSED REQUEST'));
            const watch = fakeObserver();
            const { outbox, write, setReady, setUid } = setup(spec, watch.observer);
            setReady(CID, true);

            const { delivered } = outbox.set(write(10));
            setReady(CID, false);
            await outbox.flush();
            setUid(CID, 'someone-else');
            setReady(CID, true);
            await expect(delivered).rejects.toBeInstanceOf(OutboxAccountChangedError);

            expect(watch.deliveries.map(({ outcome, attempts }) => ({ outcome, attempts }))).toEqual([
                { outcome: 'account_changed', attempts: 1 },
            ]);
        });

        it('reports one accepted delivery when a value is refused while a newer one waits', async () => {
            const spec = settingSpec();
            const first = deferred<unknown>();
            spec.deliver.mockReturnValueOnce(first.promise);
            const watch = fakeObserver();
            const { outbox, write, setReady } = setup(spec, watch.observer);
            setReady(CID, true);

            const refused = outbox.set(write('too-long'));
            const { delivered } = outbox.set(write('ok'));
            watch.at(30);
            first.reject(new Error('403 FORBIDDEN'));
            await expect(refused.delivered).rejects.toThrow('403');
            await delivered;

            expect(sentValues(spec)).toEqual(['too-long', 'ok']);
            expect(watch.deliveries).toEqual([
                { op: 'join.read', cid: CID, outcome: 'accepted', deliveryMs: 30, waitSocketMs: 0, attempts: 1 },
            ]);
        });

        it('times a wait on a cloud it stopped watching from before its first readiness report', async () => {
            const spec = cursorSpec();
            const watch = fakeObserver();
            const { outbox, write, setReady, unwatch } = setup(spec, watch.observer);
            setReady(CID, true);
            await outbox.set(write(10)).delivered;
            expect(unwatch).toHaveBeenCalledWith(CID);

            setReady(CID, false);
            watch.at(100);
            const { delivered } = outbox.set(write(12));
            watch.at(130);
            setReady(CID, true);
            await delivered;

            expect(watch.deliveries[1]).toEqual(
                expect.objectContaining({ outcome: 'accepted', deliveryMs: 30, waitSocketMs: 30, attempts: 1 })
            );
        });

        it('starts a new delivery for a value set after the last one settled', async () => {
            const spec = settingSpec();
            const watch = fakeObserver();
            const { outbox, write, setReady } = setup(spec, watch.observer);
            setReady(CID, true);

            await outbox.set(write('all')).delivered;
            await outbox.set(write('none')).delivered;

            expect(watch.deliveries.map(delivery => delivery.outcome)).toEqual(['accepted', 'accepted']);
        });

        it('reports nothing for a value the server already holds', async () => {
            const spec = cursorSpec();
            const watch = fakeObserver();
            const { outbox, write, setReady } = setup(spec, watch.observer);
            setReady(CID, true);
            await outbox.set(write(10)).delivered;

            await outbox.set(write(8)).delivered;

            expect(watch.deliveries).toHaveLength(1);
        });

        it('reads no clock for a wait the observer declines to follow', async () => {
            const spec = cursorSpec();
            const watch = fakeObserver();
            jest.mocked(watch.observer.begin).mockReturnValue(undefined);
            const { outbox, write, setReady } = setup(spec, watch.observer);

            const { delivered } = outbox.set(write(10));
            setReady(CID, true);
            await delivered;

            expect(watch.observer.now).not.toHaveBeenCalled();
            expect(watch.deliveries).toEqual([]);
        });

        it('carries on unchanged when the observer throws', async () => {
            const spec = cursorSpec();
            const watch = fakeObserver();
            jest.mocked(watch.observer.begin).mockReturnValue(() => {
                throw new Error('observer broke');
            });
            const { outbox, write, setReady } = setup(spec, watch.observer);
            setReady(CID, true);

            await outbox.set(write(10)).delivered;
            await outbox.set(write(12)).delivered;

            expect(sentValues(spec)).toEqual([10, 12]);
            expect(outbox.pending()).toEqual([]);
        });
    });
});
