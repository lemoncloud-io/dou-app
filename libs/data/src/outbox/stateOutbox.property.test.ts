import * as fc from 'fast-check';

import { STATE_SPECS } from './joinStates';
import { createStateOutbox } from './stateOutbox';
import type { DataRepositories } from '../repositories';
import type { OutboxTransport, StateWrite } from './ports';
import type { StateSpecs } from './stateOutbox';

const RUNS = { numRuns: 150, seed: 1123 };
const CID = 'cloud-a';
const UID = 'me';
const KEYS = ['ch-1', 'ch-2'] as const;

type Op = 'join.read' | 'join.nick';

interface Attempt {
    op: Op;
    key: string;
    value: number | string;
    ready: boolean;
    answer: (ok: boolean) => void;
}

interface Real {
    outbox: ReturnType<typeof createStateOutbox>;
    ready: boolean;
    setReady(ready: boolean): void;
    inFlight: Attempt[];
    attempts: Attempt[];
    accepted: Map<string, (number | string)[]>;
    timers: Array<{ callback: () => void; cleared: boolean }>;
    receipts: Array<{ state: 'waiting' | 'resolved' | 'rejected' }>;
}

interface Model {
    lastNick: Map<string, string>;
    maxRead: Map<string, number>;
}

const idOf = (op: Op, key: string) => `${op}|${key}`;

const settle = async () => {
    for (let tick = 0; tick < 40; tick++) await Promise.resolve();
};

const createReal = (): Real => {
    let listener: ((ready: boolean) => void) | null = null;
    const real = {} as Real;

    const send = (op: Op, key: string, value: number | string) =>
        new Promise((resolve, reject) => {
            const attempt: Attempt = {
                op,
                key,
                value,
                ready: real.ready,
                answer: ok => {
                    if (!ok) return reject(new Error('500 INTERNAL SERVER ERROR'));
                    const log = real.accepted.get(idOf(op, key)) ?? [];
                    log.push(value);
                    real.accepted.set(idOf(op, key), log);
                    resolve({ id: `${key}:${UID}`, channelId: key, userId: UID });
                },
            };
            real.attempts.push(attempt);
            real.inFlight.push(attempt);
        });

    const graph = {
        join: {
            sendRead: ({ channelId, chatNo }: { channelId: string; chatNo: number }) =>
                send('join.read', channelId, chatNo),
            sendJoinUpdate: (key: string, patch: { nick?: string }) => send('join.nick', key, patch.nick ?? ''),
            cacheWrite: async () => undefined,
            writeMyJoinLocally: async () => undefined,
        },
    } as unknown as DataRepositories;

    const transport: OutboxTransport = {
        watchReady: (_cid, next) => {
            listener = next;
            next(real.ready);
            return () => {
                if (listener === next) listener = null;
            };
        },
        inCloud: (_cid, work) => work(graph),
        uidOf: () => UID,
        isRefusal: error => /^(403|404)/.test((error as Error).message),
        retryDelaysMs: [10, 20],
        setTimer: callback => {
            const timer = { callback, cleared: false };
            real.timers.push(timer);
            return timer;
        },
        clearTimer: handle => {
            (handle as { cleared: boolean }).cleared = true;
        },
    };

    Object.assign(real, {
        outbox: createStateOutbox({ specs: STATE_SPECS as unknown as StateSpecs, transport }),
        ready: true,
        setReady: (ready: boolean) => {
            real.ready = ready;
            listener?.(ready);
        },
        inFlight: [],
        attempts: [],
        accepted: new Map(),
        timers: [],
        receipts: [],
    });
    return real;
};

class SetCommand implements fc.AsyncCommand<Model, Real> {
    constructor(
        readonly op: Op,
        readonly key: string,
        readonly value: number | string
    ) {}
    check = () => true;
    async run(model: Model, real: Real) {
        const write: StateWrite = { op: this.op, cid: CID, uid: UID, key: this.key, value: this.value };
        const receipt: Real['receipts'][number] = { state: 'waiting' };
        real.receipts.push(receipt);
        real.outbox.set(write).delivered.then(
            () => (receipt.state = 'resolved'),
            () => (receipt.state = 'rejected')
        );
        if (this.op === 'join.read') {
            model.maxRead.set(this.key, Math.max(model.maxRead.get(this.key) ?? 0, this.value as number));
        } else {
            model.lastNick.set(this.key, this.value as string);
        }
        await settle();
    }
    toString = () => `set(${this.op}, ${this.key}, ${JSON.stringify(this.value)})`;
}

class ReadyCommand implements fc.AsyncCommand<Model, Real> {
    constructor(readonly ready: boolean) {}
    check = () => true;
    async run(_model: Model, real: Real) {
        real.setReady(this.ready);
        await settle();
    }
    toString = () => (this.ready ? 'socketUp' : 'socketDown');
}

class AnswerCommand implements fc.AsyncCommand<Model, Real> {
    constructor(readonly ok: boolean) {}
    check = () => true;
    async run(_model: Model, real: Real) {
        real.inFlight.shift()?.answer(this.ok);
        await settle();
    }
    toString = () => (this.ok ? 'serverAccepts' : 'serverFails500');
}

class FireTimersCommand implements fc.AsyncCommand<Model, Real> {
    check = () => true;
    async run(_model: Model, real: Real) {
        real.timers.splice(0).forEach(timer => !timer.cleared && timer.callback());
        await settle();
    }
    toString = () => 'retryTimersFire';
}

const mostly = (value: boolean) =>
    fc.oneof({ arbitrary: fc.constant(value), weight: 3 }, { arbitrary: fc.constant(!value), weight: 1 });

const commands = fc.commands(
    [
        fc
            .tuple(fc.constantFrom(...KEYS), fc.integer({ min: 1, max: 5 }))
            .map(([key, value]) => new SetCommand('join.read', key, value)),
        fc
            .tuple(fc.constantFrom(...KEYS), fc.constantFrom('ann', 'bo', 'cy'))
            .map(([key, value]) => new SetCommand('join.nick', key, value)),
        mostly(true).map(ready => new ReadyCommand(ready)),
        mostly(true).map(ok => new AnswerCommand(ok)),
        fc.constant(new FireTimersCommand()),
    ],
    { maxCommands: 30 }
);

const quiesce = async (real: Real) => {
    real.setReady(false);
    real.setReady(true);
    await settle();
    let failuresLeft = 2;
    for (let round = 0; round < 50 && (real.inFlight.length || real.timers.length); round++) {
        while (real.inFlight.length) {
            real.inFlight.shift()?.answer(failuresLeft-- <= 0);
            await settle();
        }
        real.timers.splice(0).forEach(timer => !timer.cleared && timer.callback());
        await settle();
    }
};

describe('state outbox properties', () => {
    it('after any mix of writes, socket drops, 500s and retries, one reconnect settles each key on its intended value', async () => {
        await fc.assert(
            fc.asyncProperty(commands, async cmds => {
                const real = createReal();
                const model: Model = { lastNick: new Map(), maxRead: new Map() };
                await fc.asyncModelRun(() => ({ model, real }), cmds);
                await quiesce(real);

                expect(real.outbox.pending()).toEqual([]);
                expect(real.receipts.filter(receipt => receipt.state !== 'resolved')).toEqual([]);
                expect(real.attempts.filter(attempt => !attempt.ready)).toEqual([]);
                for (const [key, max] of model.maxRead) {
                    const log = (real.accepted.get(idOf('join.read', key)) ?? []) as number[];
                    expect(log[log.length - 1]).toBe(max);
                    expect(log).toEqual([...log].sort((a, b) => a - b));
                }
                for (const [key, nick] of model.lastNick) {
                    const log = real.accepted.get(idOf('join.nick', key)) ?? [];
                    expect(log[log.length - 1]).toBe(nick);
                }
            }),
            RUNS
        );
    });

    it('sends no accepted write again on a reconnect while the cloud is still watched', async () => {
        await fc.assert(
            fc.asyncProperty(commands, async cmds => {
                const real = createReal();
                const model: Model = { lastNick: new Map(), maxRead: new Map() };
                await fc.asyncModelRun(() => ({ model, real }), cmds);
                await quiesce(real);
                const sent = real.attempts.length;
                real.outbox.set({ op: 'join.nick', cid: CID, uid: UID, key: 'ch-held', value: 'held' });
                await settle();

                real.setReady(false);
                real.setReady(true);
                await settle();

                expect(real.attempts.slice(sent).filter(attempt => attempt.key !== 'ch-held')).toEqual([]);
                expect(real.outbox.pending().map(write => write.key)).toEqual(['ch-held']);
            }),
            RUNS
        );
    });
});
