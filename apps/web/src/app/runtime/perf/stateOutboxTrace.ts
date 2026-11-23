import { hashRunId, isPageHidden, PERF_SAMPLE_PERCENT, recordPerfSample } from '@chatic/perf';

import type { runtime } from '@chatic/runtime';

type StateOutboxSample = runtime.data.StateOutboxSample;

export const STATE_OUTBOX_RUN_BUCKETS = { from: PERF_SAMPLE_PERCENT * 2, to: 50 } as const;

export const STATE_OUTBOX_SAMPLES_PER_MINUTE = 6;

export const STATE_OUTBOX_SAMPLES_PER_OP_PER_MINUTE = 4;

export const STATE_OUTBOX_SAMPLES_WHILE_HELD = 3;

const MINUTE_MS = 60_000;

export const isStateOutboxSampledRun = (runId: string | undefined): boolean => {
    if (!runId) return false;
    const bucket = hashRunId(runId) % 100;
    return bucket >= STATE_OUTBOX_RUN_BUCKETS.from && bucket < STATE_OUTBOX_RUN_BUCKETS.to;
};

interface ObserveStateOutboxOptions {
    setObserver: (observer: ((sample: StateOutboxSample) => void) | undefined) => void;
    runId: string | undefined;
    record?: typeof recordPerfSample;
    now?: () => number;
    isHidden?: () => boolean;
    isHeld?: () => boolean;
}

export const observeStateOutbox = ({
    setObserver,
    runId,
    record = recordPerfSample,
    now = Date.now,
    isHidden = isPageHidden,
    isHeld = () => false,
}: ObserveStateOutboxOptions): (() => void) => {
    if (!isStateOutboxSampledRun(runId)) return () => undefined;

    let windowStart = Number.NEGATIVE_INFINITY;
    let recordedInWindow = 0;
    let recordedByOp = new Map<string, number>();
    let recordedWhileHeld = 0;

    setObserver(sample => {
        if (isHidden()) return;
        const at = now();
        if (at - windowStart >= MINUTE_MS) {
            windowStart = at;
            recordedInWindow = 0;
            recordedByOp = new Map();
        }
        const ofOp = recordedByOp.get(sample.op) ?? 0;
        if (recordedInWindow >= STATE_OUTBOX_SAMPLES_PER_MINUTE) return;
        if (ofOp >= STATE_OUTBOX_SAMPLES_PER_OP_PER_MINUTE) return;
        if (isHeld()) {
            if (recordedWhileHeld >= STATE_OUTBOX_SAMPLES_WHILE_HELD) return;
            recordedWhileHeld += 1;
        }
        recordedInWindow += 1;
        recordedByOp.set(sample.op, ofOp + 1);
        record('state_outbox', {
            attributes: { op: sample.op, outcome: sample.outcome, kind: sample.kind },
            metrics: {
                delivery_ms: sample.deliveryMs,
                wait_socket_ms: sample.waitSocketMs,
                attempts: sample.attempts,
            },
        });
    });

    return () => setObserver(undefined);
};
