import { hashRunId, isPageHidden, PERF_SAMPLE_PERCENT, recordPerfSample } from '@chatic/perf';

import type { runtime } from '@chatic/app-runtime';

type ISocketManager = runtime.connection.ISocketManager;
type SocketRequestSample = runtime.connection.SocketRequestSample;

/**
 * At most this many `socket_request` samples per minute, across every type.
 *
 * Every trace a device records shares one Firebase Performance budget (300 per ten minutes in the
 * foreground). A busy room makes far more socket requests than that, so an uncapped trace would
 * starve the traces with targets. Ten — a third of the budget, as `bridge_request` takes in its own
 * runs — still holds three or four types a minute at the per-type cap.
 */
export const SOCKET_REQUEST_SAMPLES_PER_MINUTE = 10;

/**
 * At most this many samples per minute of any one type.
 *
 * The total cap alone would be spent on the most frequent types — `chat.feed`, `join.read` — and a
 * rare one such as `chat.send` would hardly ever be kept. Capping each type keeps every type visible
 * in the console's per-`type` breakdown.
 */
export const SOCKET_REQUEST_SAMPLES_PER_TYPE_PER_MINUTE = 3;

/** At most this many samples while traces are still held for the WebAppReady report (see `bridgeRequestTrace`). */
export const SOCKET_REQUEST_SAMPLES_WHILE_HELD = 3;

const MINUTE_MS = 60_000;

/**
 * Whether this run's socket requests are sampled: one run in ten, but a different tenth from the
 * one `bridge_request` samples (`isSampledRun`). The two traces are each capped per minute, and
 * sampling them in the same runs would stack both caps on one run's share of the shared budget.
 */
export const isSocketRequestSampledRun = (runId: string | undefined): boolean => {
    if (!runId) return false;
    const bucket = hashRunId(runId) % 100;
    return bucket >= PERF_SAMPLE_PERCENT && bucket < PERF_SAMPLE_PERCENT * 2;
};

interface ObserveSocketRequestsOptions {
    manager: Pick<ISocketManager, 'setRequestObserver'>;
    runId: string | undefined;
    /** Overridable for tests; production records through the process-wide perf slot. */
    record?: typeof recordPerfSample;
    now?: () => number;
    isHidden?: () => boolean;
    /** Whether traces are still held for the WebAppReady report (`configureWebPerfTraces().isHeld`). */
    isHeld?: () => boolean;
}

/**
 * Records the socket requests of a sampled run as `socket_request` samples: one request's round
 * trip, broken down in the console by `type` (`chat.send`, `chat.feed`…), `kind` (relay / cloud) and
 * `outcome` (`ok`, or the status it was rejected with).
 *
 * It is the server's answer time per request type, which the screen-level traces cannot isolate:
 * `chat_room_sync`'s feed phase includes the cache write, `chat_send` the optimistic row. A request
 * from a hidden page is not recorded — the background budget is a tenth, and a page the OS suspended
 * mid-request would time the suspension.
 *
 * @returns Stops observing.
 */
export const observeSocketRequests = ({
    manager,
    runId,
    record = recordPerfSample,
    now = Date.now,
    isHidden = isPageHidden,
    isHeld = () => false,
}: ObserveSocketRequestsOptions): (() => void) => {
    if (!isSocketRequestSampledRun(runId)) return () => undefined;

    let windowStart = Number.NEGATIVE_INFINITY;
    let recordedInWindow = 0;
    let recordedByType = new Map<string, number>();
    let recordedWhileHeld = 0;

    manager.setRequestObserver((sample: SocketRequestSample) => {
        if (isHidden()) return;
        const at = now();
        if (at - windowStart >= MINUTE_MS) {
            windowStart = at;
            recordedInWindow = 0;
            recordedByType = new Map();
        }
        const ofType = recordedByType.get(sample.type) ?? 0;
        if (recordedInWindow >= SOCKET_REQUEST_SAMPLES_PER_MINUTE) return;
        if (ofType >= SOCKET_REQUEST_SAMPLES_PER_TYPE_PER_MINUTE) return;
        if (isHeld()) {
            if (recordedWhileHeld >= SOCKET_REQUEST_SAMPLES_WHILE_HELD) return;
            recordedWhileHeld += 1;
        }
        recordedInWindow += 1;
        recordedByType.set(sample.type, ofType + 1);
        record('socket_request', {
            attributes: { type: sample.type, kind: sample.kind, outcome: sample.outcome },
            metrics: { rtt_ms: sample.roundTripMs },
        });
    });

    return () => manager.setRequestObserver(undefined);
};
