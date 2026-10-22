import { createLogUploadQueue } from './LogUploadQueue';
import { createQueueLogStore } from './QueueLogStore';
import { createLogUploadScheduler } from './LogUploadScheduler';

import type { UploadOutcome } from './uploadPolicy';
import type { LogEntry } from '../core/types';

let seq = 0;
const log = (): LogEntry => {
    seq += 1;
    return { id: `log-${seq}`, level: 'warn', tag: 'TEST', message: 'x', timestamp: seq };
};
const stat = (): LogEntry => {
    seq += 1;
    return { id: `stat-${seq}`, level: 'info', tag: 'perf.boot', message: 'boot', kind: 'trace', timestamp: seq };
};

// A timer that never fires on its own — every cycle here is a `flushNow`, awaited to completion.
const idleTimer = { schedule: (() => 0) as never, cancel: (() => undefined) as never };

const build = (selectTelemetry?: (entries: LogEntry[]) => LogEntry[], outcome: UploadOutcome = 'ok') => {
    const queue = createLogUploadQueue();
    const sent: LogEntry[][] = [];
    const scheduler = createLogUploadScheduler({
        store: createQueueLogStore(queue),
        send: async entries => {
            sent.push(entries);
            return outcome;
        },
        selectTelemetry,
        ...idleTimer,
    });
    scheduler.start();
    return { queue, sent, scheduler };
};

beforeEach(() => {
    seq = 0;
});

describe('LogUploadScheduler — selectTelemetry', () => {
    it('sends everything when no selector is given', async () => {
        const { queue, sent, scheduler } = build();
        queue.pushAll([log(), stat()]);
        await scheduler.flushNow();

        expect(sent[0]).toHaveLength(2);
        expect(queue.size()).toBe(0);
    });

    it('hands the selector only statistics, never a log', async () => {
        const select = jest.fn((entries: LogEntry[]) => entries);
        const { queue, scheduler } = build(select);
        queue.pushAll([log(), stat(), log()]);
        await scheduler.flushNow();

        expect(select).toHaveBeenCalledTimes(1);
        expect(select.mock.calls[0][0].every(e => e.kind === 'trace')).toBe(true);
    });

    it('acknowledges left-out statistics without sending them, and still sends the logs', async () => {
        const { queue, sent, scheduler } = build(() => []);
        const kept = log();
        queue.pushAll([stat(), kept, stat()]);
        await scheduler.flushNow();

        expect(sent).toEqual([[kept]]);
        expect(queue.size()).toBe(0);
    });

    it('makes no request when the selector leaves nothing to send', async () => {
        const { queue, sent, scheduler } = build(() => []);
        queue.pushAll([stat(), stat()]);
        await scheduler.flushNow();

        expect(sent).toHaveLength(0);
        expect(queue.size()).toBe(0);
    });

    it('sends the re-stamped copy the selector returns, in the original position', async () => {
        const { queue, sent, scheduler } = build(entries => entries.map(e => ({ ...e, sr: 1, pv: 3 })));
        const a = log();
        const b = stat();
        queue.pushAll([a, b]);
        await scheduler.flushNow();

        expect(sent[0][0]).toBe(a);
        expect(sent[0][1]).toMatchObject({ id: b.id, sr: 1, pv: 3 });
        expect(queue.size()).toBe(0);
    });

    it('sends the batch as drawn when the selector throws', async () => {
        const { queue, sent, scheduler } = build(() => {
            throw new Error('policy bug');
        });
        queue.pushAll([log(), stat()]);
        await scheduler.flushNow();

        expect(sent[0]).toHaveLength(2);
    });

    it('keeps the sent part for a retry but has already released the skipped part', async () => {
        const { queue, sent, scheduler } = build(() => [], 'retry');
        const kept = log();
        queue.pushAll([stat(), kept]);
        await scheduler.flushNow();

        expect(sent).toEqual([[kept]]);
        expect(queue.nextBatch(10)).toEqual([kept]);
    });
});

describe('LogUploadScheduler — a batch made only of skipped statistics', () => {
    it('draws again in the same cycle, so logs behind them are not held an interval', async () => {
        const queue = createLogUploadQueue();
        const sent: LogEntry[][] = [];
        const scheduler = createLogUploadScheduler({
            store: createQueueLogStore(queue),
            send: async entries => {
                sent.push(entries);
                return 'ok';
            },
            batchSize: 2,
            selectTelemetry: () => [],
            ...idleTimer,
        });
        scheduler.start();
        const kept = log();
        queue.pushAll([stat(), stat(), stat(), stat(), kept]);

        await scheduler.flushNow();

        expect(sent).toEqual([[kept]]);
        expect(queue.size()).toBe(0);
    });

    it('stops after a bounded number of rounds when releases keep failing', async () => {
        const entries = [stat(), stat()];
        const peek = jest.fn(async () => entries);
        const send = jest.fn(async (): Promise<UploadOutcome> => 'ok');
        const scheduler = createLogUploadScheduler({
            store: {
                peek,
                ack: async () => Promise.reject(new Error('ack')),
                clear: async () => undefined,
                size: () => 2,
            },
            send,
            selectTelemetry: () => [],
            ...idleTimer,
        });
        scheduler.start();

        await scheduler.flushNow();

        expect(peek).toHaveBeenCalledTimes(10);
        expect(send).not.toHaveBeenCalled();
    });
});
