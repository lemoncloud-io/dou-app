import { isSampledRun, recordPerfSample } from '@chatic/perf';

import type { BridgeRequestSample, IWebBridgeClient } from '@chatic/bridges';

/**
 * At most this many `bridge_request` samples per minute.
 *
 * Firebase Performance shares one rate limit across every trace a device records: 300 per ten
 * minutes in the foreground, 30 in the background (the Android SDK's defaults in firebase-perf
 * 22.0.4; the iOS SDK's were not checked). A busy session
 * makes far more bridge requests than that, so an uncapped sample would starve the traces that
 * already have targets — `chat_room_open` above all. Ten a minute keeps this trace to a third of
 * the budget.
 */
export const BRIDGE_REQUEST_SAMPLES_PER_MINUTE = 10;

/**
 * At most this many samples before the WebAppReady report says where traces go.
 *
 * Until then every trace waits in one shared hold of 100 entries, and each sample takes two (its
 * start and its stop). A late report would otherwise let this trace crowd out the boot-time
 * `web_vitals` and the first `chat_room_open`, and a start kept without its stop stays open on the
 * native side until it expires. Three still shows the front of the boot burst.
 */
export const BRIDGE_REQUEST_SAMPLES_WHILE_HELD = 3;

const MINUTE_MS = 60_000;

interface ObserveBridgeRequestsOptions {
    client: Pick<IWebBridgeClient, 'setRequestObserver'>;
    runId: string | undefined;
    /** Overridable for tests; production records through the process-wide perf slot. */
    record?: typeof recordPerfSample;
    now?: () => number;
    isHidden?: () => boolean;
    /** Whether traces are still held for the WebAppReady report (`configureWebPerfTraces().isHeld`). */
    isHeld?: () => boolean;
}

/**
 * Records each bridge request of a sampled run as a `bridge_request` sample.
 *
 * Sampled by run, like the log fallback: every request of one run in ten rather than one request
 * in ten of every run. Every sample is itself two bridge posts (the trace's start and stop), so
 * measuring every run would add traffic to exactly what is being measured.
 *
 * Within a run the first {@link BRIDGE_REQUEST_SAMPLES_PER_MINUTE} requests of each minute are
 * kept. That leans towards the start of a burst — which is the room-entry burst this trace exists
 * to look at. Nothing is recorded while the page is hidden, where the budget is a tenth, and only
 * {@link BRIDGE_REQUEST_SAMPLES_WHILE_HELD} while traces are still held for the report.
 *
 * @returns Stops observing.
 */
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
    let recordedWhileHeld = 0;

    client.setRequestObserver((sample: BridgeRequestSample) => {
        if (isHidden()) return;
        if (isHeld()) {
            if (recordedWhileHeld >= BRIDGE_REQUEST_SAMPLES_WHILE_HELD) return;
            recordedWhileHeld += 1;
        }
        const at = now();
        if (at - windowStart >= MINUTE_MS) {
            windowStart = at;
            recordedInWindow = 0;
        }
        if (recordedInWindow >= BRIDGE_REQUEST_SAMPLES_PER_MINUTE) return;
        recordedInWindow += 1;
        record('bridge_request', toPerfSample(sample));
    });

    return () => client.setRequestObserver(undefined);
};

/**
 * Lengths are UTF-16 code units, not bytes — what the bridge serializes and copies is a string, so
 * that is the size that costs. A value the client could not measure — a length the adapter did not
 * report, a queue time for a request called before observing began — is left out rather than sent
 * as zero, which would read as a real measurement.
 */
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
