import { hashRunId, isSampledRun, PERF_SAMPLE_PERCENT } from '@chatic/perf';

import type { runtime } from '@chatic/app-runtime';

import {
    isStateOutboxSampledRun,
    observeStateOutbox,
    STATE_OUTBOX_RUN_BUCKETS,
    STATE_OUTBOX_SAMPLES_PER_MINUTE,
    STATE_OUTBOX_SAMPLES_PER_OP_PER_MINUTE,
    STATE_OUTBOX_SAMPLES_WHILE_HELD,
} from './stateOutboxTrace';
import { isSocketRequestSampledRun } from './socketRequestTrace';

type Sample = runtime.data.StateOutboxSample;

/** A run id whose hash falls in `[from, to)` of the hundred buckets, found against the real hash. */
const runInBucket = (from: number, to: number): string => {
    for (let i = 0; i < 10_000; i += 1) {
        const id = `run-${i}`;
        const bucket = hashRunId(id) % 100;
        if (bucket >= from && bucket < to) return id;
    }
    throw new Error('no run id found');
};

const SAMPLED_RUN = runInBucket(20, 50);
const BRIDGE_RUN = runInBucket(0, 10);
const SOCKET_RUN = runInBucket(10, 20);
const UNSAMPLED_RUN = runInBucket(50, 100);

const sample = (overrides: Partial<Sample> = {}): Sample => ({
    op: 'join.read',
    kind: 'cloud',
    outcome: 'accepted',
    deliveryMs: 140,
    waitSocketMs: 90,
    attempts: 2,
    ...overrides,
});

const setup = (runId: string | undefined, options: { hidden?: boolean; held?: () => boolean } = {}) => {
    let observer: ((sample: Sample) => void) | undefined;
    const setObserver = jest.fn((next?: (s: Sample) => void) => (observer = next));
    const record = jest.fn();
    let clock = 0;
    const stop = observeStateOutbox({
        setObserver,
        runId,
        record,
        now: () => clock,
        isHidden: () => options.hidden ?? false,
        isHeld: options.held,
    });
    return {
        setObserver,
        record,
        stop,
        emit: (value: Sample = sample()) => observer?.(value),
        advance: (ms: number) => (clock += ms),
    };
};

describe('observeStateOutbox', () => {
    it('samples runs apart from both request traces', () => {
        expect(isStateOutboxSampledRun(SAMPLED_RUN)).toBe(true);
        expect(isSampledRun(SAMPLED_RUN)).toBe(false);
        expect(isSocketRequestSampledRun(SAMPLED_RUN)).toBe(false);
        expect(isStateOutboxSampledRun(BRIDGE_RUN)).toBe(false);
        expect(isStateOutboxSampledRun(SOCKET_RUN)).toBe(false);
        expect(isStateOutboxSampledRun(UNSAMPLED_RUN)).toBe(false);
        expect(isStateOutboxSampledRun(undefined)).toBe(false);
    });

    it('starts where the request traces end, so their buckets never overlap it', () => {
        expect(STATE_OUTBOX_RUN_BUCKETS.from).toBeGreaterThanOrEqual(PERF_SAMPLE_PERCENT * 2);
        expect(STATE_OUTBOX_RUN_BUCKETS.to).toBeGreaterThan(STATE_OUTBOX_RUN_BUCKETS.from);
    });

    it('records a settled write as a state_outbox sample, by op, outcome and kind', () => {
        const { record, emit } = setup(SAMPLED_RUN);

        emit();

        expect(record).toHaveBeenCalledWith('state_outbox', {
            attributes: { op: 'join.read', outcome: 'accepted', kind: 'cloud' },
            metrics: { delivery_ms: 140, wait_socket_ms: 90, attempts: 2 },
        });
    });

    it('does not observe outside its runs', () => {
        const { setObserver } = setup(SOCKET_RUN);

        expect(setObserver).not.toHaveBeenCalled();
    });

    it('records nothing from a hidden page', () => {
        const { record, emit } = setup(SAMPLED_RUN, { hidden: true });

        emit();

        expect(record).not.toHaveBeenCalled();
    });

    it('keeps a minute to its total cap and starts over the next minute', () => {
        const { record, emit, advance } = setup(SAMPLED_RUN);
        const ops: Sample['op'][] = ['join.read', 'join.notify', 'join.nick'];

        for (let i = 0; i < STATE_OUTBOX_SAMPLES_PER_MINUTE + 3; i += 1) emit(sample({ op: ops[i % ops.length] }));
        expect(record).toHaveBeenCalledTimes(STATE_OUTBOX_SAMPLES_PER_MINUTE);

        advance(60_000);
        emit();
        expect(record).toHaveBeenCalledTimes(STATE_OUTBOX_SAMPLES_PER_MINUTE + 1);
    });

    it('leaves room for a rare op after a burst of read cursors', () => {
        const { record, emit } = setup(SAMPLED_RUN);

        for (let i = 0; i < STATE_OUTBOX_SAMPLES_PER_MINUTE; i += 1) emit(sample({ op: 'join.read' }));
        emit(sample({ op: 'join.notify' }));

        const ops = record.mock.calls.map(([, { attributes }]) => attributes.op);
        expect(ops.filter(op => op === 'join.read')).toHaveLength(STATE_OUTBOX_SAMPLES_PER_OP_PER_MINUTE);
        expect(ops).toContain('join.notify');
    });

    it('keeps only a few while traces are held for the report', () => {
        let held = true;
        const { record, emit, advance } = setup(SAMPLED_RUN, { held: () => held });

        for (let i = 0; i < STATE_OUTBOX_SAMPLES_WHILE_HELD + 2; i += 1) emit(sample({ op: 'join.nick' }));
        expect(record).toHaveBeenCalledTimes(STATE_OUTBOX_SAMPLES_WHILE_HELD);

        held = false;
        advance(60_000);
        emit();
        expect(record).toHaveBeenCalledTimes(STATE_OUTBOX_SAMPLES_WHILE_HELD + 1);
    });

    it('stops observing when told to', () => {
        const { setObserver, stop } = setup(SAMPLED_RUN);

        stop();

        expect(setObserver).toHaveBeenLastCalledWith(undefined);
    });
});
