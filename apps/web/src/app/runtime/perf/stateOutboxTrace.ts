import { hashRunId, isPageHidden, PERF_SAMPLE_PERCENT, recordPerfSample } from '@chatic/perf';

import type { runtime } from '@chatic/app-runtime';

type StateOutboxSample = runtime.data.StateOutboxSample;

/**
 * The run-hash buckets whose runs record `state_outbox`: 20 up to (not including) 50, three runs in ten.
 *
 * Kept apart from `bridge_request` (0–9) and `socket_request` (10–19) so no run stacks two of these
 * capped traces on its share of the budget. Wider than theirs because a state write is rare where a
 * request is not: one sample per write that lands, values folded per key. A tenth of runs gave
 * `socket_request` about ten `chat.read` samples in a week — too few to tell a p90 apart before and
 * after a change — and a wider bucket costs no run more of its budget, since the caps below are per
 * run. 50–99 stays free for the next trace that needs its own runs. The start follows the request
 * traces' end, so raising their share narrows this one instead of overlapping it.
 */
export const STATE_OUTBOX_RUN_BUCKETS = { from: PERF_SAMPLE_PERCENT * 2, to: 50 } as const;

/**
 * At most this many `state_outbox` samples per minute, across every op.
 *
 * Every trace a device records shares one Firebase Performance budget (300 per ten minutes in the
 * foreground, thirty a minute on average). Every run already risks thirty a minute at the caps of
 * `chat_send`, `chat_send_media` and `socket_verify`, and a run sampled for `bridge_request` or
 * `socket_request` adds ten to that. A run in this trace's buckets records neither, so six here keeps
 * its worst minute at thirty-six — below the forty those runs already allow, so adding this trace
 * does not raise the highest worst minute of any run. A real session stays far under it: a read cursor only moves when a
 * room is read, and a burst of reads folds into one write per room.
 */
export const STATE_OUTBOX_SAMPLES_PER_MINUTE = 6;

/**
 * At most this many samples per minute of any one op, so a burst of read cursors (`join.read`) cannot
 * spend the minute a rare notification or name change (`join.notify`, `join.nick`) would be kept in.
 */
export const STATE_OUTBOX_SAMPLES_PER_OP_PER_MINUTE = 4;

/** At most this many samples while traces are still held for the WebAppReady report (see `bridgeRequestTrace`). */
export const STATE_OUTBOX_SAMPLES_WHILE_HELD = 3;

const MINUTE_MS = 60_000;

/** Whether this run's state writes are sampled — the runs in {@link STATE_OUTBOX_RUN_BUCKETS}. */
export const isStateOutboxSampledRun = (runId: string | undefined): boolean => {
    if (!runId) return false;
    const bucket = hashRunId(runId) % 100;
    return bucket >= STATE_OUTBOX_RUN_BUCKETS.from && bucket < STATE_OUTBOX_RUN_BUCKETS.to;
};

interface ObserveStateOutboxOptions {
    /** `runtime.data.setStateOutboxObserver`; overridable for tests. */
    setObserver: (observer: ((sample: StateOutboxSample) => void) | undefined) => void;
    runId: string | undefined;
    /** Overridable for tests; production records through the process-wide perf slot. */
    record?: typeof recordPerfSample;
    now?: () => number;
    isHidden?: () => boolean;
    /** Whether traces are still held for the WebAppReady report (`configureWebPerfTraces().isHeld`). */
    isHeld?: () => boolean;
}

/**
 * Records the state writes of a sampled run as `state_outbox` samples: how long a read cursor, a
 * notification setting or a room name took to reach the server after the screen already showed it.
 * One sample per key's wait — the set that made it wait to the answer that ended it — broken down by
 * `op`, `outcome` (`accepted` / `refused` / `account_changed`) and `kind` (relay / cloud), with
 * `delivery_ms`, `wait_socket_ms` (the part the cloud's socket was down) and `attempts`.
 *
 * Nothing a person waited on is in it — the screen moved at the local write. It answers whether
 * writes land, and how long they spend waiting for a socket or a retry on the way. A write from a
 * hidden page is not recorded, and the runtime hands over no wait the page was hidden during.
 *
 * @returns Stops observing.
 */
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
