import { createLogUploadQueue, DEFAULT_QUEUE_CAPACITY, DEFAULT_STAT_QUEUE_CAPACITY } from './LogUploadQueue';

import type { LogEntry, LogLevel, TelemetryKind } from '../core/types';

let seq = 0;
const log = (level: LogLevel = 'info'): LogEntry => {
    seq += 1;
    return { id: `log-${seq}`, level, tag: 'TEST', message: `${level}-${seq}`, timestamp: seq };
};
const stat = (kind: TelemetryKind = 'sample'): LogEntry => {
    seq += 1;
    return { id: `stat-${seq}`, level: 'info', tag: `perf.x`, message: 'x', kind, timestamp: seq, metrics: { v: seq } };
};

beforeEach(() => {
    seq = 0;
});

describe('LogUploadQueue — the log and statistics shares', () => {
    it('keeps the log share whole when statistics fill their own share', () => {
        const onDrop = jest.fn();
        const queue = createLogUploadQueue({ onDrop });
        for (let i = 0; i < DEFAULT_QUEUE_CAPACITY; i += 1) queue.push(log('info'));
        for (let i = 0; i < DEFAULT_STAT_QUEUE_CAPACITY + 50; i += 1) queue.push(stat());

        expect(queue.size() - queue.statSize()).toBe(DEFAULT_QUEUE_CAPACITY);
        expect(queue.droppedCount()).toBe(0);
        expect(onDrop).not.toHaveBeenCalled();
        expect(queue.statSize()).toBe(DEFAULT_STAT_QUEUE_CAPACITY);
        expect(queue.droppedStatCount()).toBe(50);
    });

    it('keeps the statistics share whole when logs overflow theirs', () => {
        const onStatDrop = jest.fn();
        const queue = createLogUploadQueue({ capacity: 3, statCapacity: 3, onStatDrop });
        queue.push(stat());
        queue.push(stat());
        for (let i = 0; i < 10; i += 1) queue.push(log('error'));

        expect(queue.statSize()).toBe(2);
        expect(queue.droppedStatCount()).toBe(0);
        expect(onStatDrop).not.toHaveBeenCalled();
        expect(queue.droppedCount()).toBe(7);
    });

    it('evicts sample, then trace, then event, oldest first within a kind', () => {
        const queue = createLogUploadQueue({ statCapacity: 3 });
        const event = stat('event');
        const trace1 = stat('trace');
        const sample1 = stat('sample');
        const trace2 = stat('trace');
        queue.push(event);
        queue.push(trace1);
        queue.push(sample1);
        queue.push(trace2);

        expect(queue.nextBatch(10).map(e => e.id)).toEqual([event.id, trace1.id, trace2.id]);

        queue.push(stat('event'));
        expect(queue.nextBatch(10).map(e => e.kind)).toEqual(['event', 'trace', 'event']);
    });

    it('caps the statistics share by bytes as well, without touching logs', () => {
        const big = (): LogEntry => ({ ...stat(), attrs: { blob: 'x'.repeat(90) } });
        const queue = createLogUploadQueue({ statMaxBytes: 600 });
        const keptLog = log('warn');
        queue.push(keptLog);
        for (let i = 0; i < 10; i += 1) queue.push(big());

        expect(queue.nextBatch(100)).toContain(keptLog);
        expect(queue.droppedStatCount()).toBeGreaterThan(0);
        expect(queue.droppedCount()).toBe(0);
    });

    it('treats an entry with no kind, or kind log, as a log', () => {
        const queue = createLogUploadQueue({ capacity: 1, statCapacity: 5 });
        queue.push(log());
        queue.push({ ...log(), kind: 'log' });

        expect(queue.statSize()).toBe(0);
        expect(queue.size()).toBe(1);
        expect(queue.droppedCount()).toBe(1);
    });

    it('batches both kinds together, oldest first', () => {
        const queue = createLogUploadQueue();
        const a = log();
        const b = stat();
        const c = log();
        queue.pushAll([a, b, c]);

        expect(queue.nextBatch(10)).toEqual([a, b, c]);
    });

    it('clearStats removes statistics and leaves logs', () => {
        const queue = createLogUploadQueue();
        const kept = log();
        queue.pushAll([stat(), kept, stat('event')]);
        queue.clearStats();

        expect(queue.nextBatch(10)).toEqual([kept]);
        expect(queue.droppedStatCount()).toBe(0);
    });

    it('reports headroom per share', () => {
        const queue = createLogUploadQueue({ capacity: 5, statCapacity: 4 });
        queue.pushAll([log(), stat(), stat()]);

        expect(queue.headroom()).toBe(4);
        expect(queue.statHeadroom()).toBe(2);
    });

    it('applies both shares on restore', () => {
        const queue = createLogUploadQueue({ capacity: 2, statCapacity: 1 });
        queue.restore([log(), stat(), log(), stat(), log()]);

        expect(queue.size() - queue.statSize()).toBe(2);
        expect(queue.statSize()).toBe(1);
    });
});
