import { isSampledRun, recordPerfSample } from '@chatic/perf';

import type { BridgeRequestSample, IWebBridgeClient } from '@chatic/bridges';

export const BRIDGE_REQUEST_SAMPLES_PER_MINUTE = 10;

export const BRIDGE_REQUEST_SAMPLES_PER_TYPE_PER_MINUTE = 3;

export const BRIDGE_REQUEST_SAMPLES_WHILE_HELD = 3;

const MINUTE_MS = 60_000;

interface ObserveBridgeRequestsOptions {
    client: Pick<IWebBridgeClient, 'setRequestObserver'>;
    runId: string | undefined;
    record?: typeof recordPerfSample;
    now?: () => number;
    isHidden?: () => boolean;
    isHeld?: () => boolean;
}

export const observeBridgeRequests = ({
    client,
    runId,
    record = recordPerfSample,
    now = Date.now,
    isHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
    isHeld = () => false,
}: ObserveBridgeRequestsOptions): (() => void) => {
    if (!isSampledRun(runId)) return () => undefined;

    let windowStart = Number.NEGATIVE_INFINITY;
    let recordedInWindow = 0;
    let recordedByType = new Map<string, number>();
    let recordedWhileHeld = 0;

    client.setRequestObserver((sample: BridgeRequestSample) => {
        if (isHidden()) return;
        const at = now();
        if (at - windowStart >= MINUTE_MS) {
            windowStart = at;
            recordedInWindow = 0;
            recordedByType = new Map();
        }
        const ofType = recordedByType.get(sample.type) ?? 0;
        if (recordedInWindow >= BRIDGE_REQUEST_SAMPLES_PER_MINUTE) return;
        if (ofType >= BRIDGE_REQUEST_SAMPLES_PER_TYPE_PER_MINUTE) return;
        if (isHeld()) {
            if (recordedWhileHeld >= BRIDGE_REQUEST_SAMPLES_WHILE_HELD) return;
            recordedWhileHeld += 1;
        }
        recordedInWindow += 1;
        recordedByType.set(sample.type, ofType + 1);
        record('bridge_request', toPerfSample(sample));
    });

    return () => client.setRequestObserver(undefined);
};

export const toPerfSample = (sample: BridgeRequestSample) => ({
    attributes: { type: sample.type, outcome: sample.outcome },
    metrics: {
        rtt_ms: sample.roundTripMs,
        ...(sample.queuedMs === undefined ? {} : { queue_ms: sample.queuedMs }),
        in_flight: sample.inFlightAtDispatch,
        ...(sample.requestLength === undefined ? {} : { req_chars: sample.requestLength }),
        ...(sample.responseLength === undefined ? {} : { res_chars: sample.responseLength }),
    },
});
