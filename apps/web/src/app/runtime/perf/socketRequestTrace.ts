import { hashRunId, isPageHidden, PERF_SAMPLE_PERCENT, recordPerfSample } from '@chatic/perf';

import type { runtime } from '@chatic/runtime-react';

type SocketRequestSample = runtime.connection.SocketRequestSample;

export const SOCKET_REQUEST_SAMPLES_PER_MINUTE = 10;

export const SOCKET_REQUEST_SAMPLES_PER_TYPE_PER_MINUTE = 3;

export const SOCKET_REQUEST_SAMPLES_WHILE_HELD = 3;

const MINUTE_MS = 60_000;

export const isSocketRequestSampledRun = (runId: string | undefined): boolean => {
    if (!runId) return false;
    const bucket = hashRunId(runId) % 100;
    return bucket >= PERF_SAMPLE_PERCENT && bucket < PERF_SAMPLE_PERCENT * 2;
};

interface ObserveSocketRequestsOptions {
    observe: (observer: (sample: SocketRequestSample) => void) => () => void;
    runId: string | undefined;
    record?: typeof recordPerfSample;
    now?: () => number;
    isHidden?: () => boolean;
    isHeld?: () => boolean;
}

export const observeSocketRequests = ({
    observe,
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

    return observe((sample: SocketRequestSample) => {
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
        const attributes: Record<string, string> = { type: sample.type, kind: sample.kind, outcome: sample.outcome };
        if (sample.closeReason) attributes.close_reason = sample.closeReason;
        record('socket_request', { attributes, metrics: { rtt_ms: sample.roundTripMs } });
    });
};
