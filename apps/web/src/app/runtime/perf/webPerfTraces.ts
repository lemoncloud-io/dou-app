import {
    DeferredPerfTraceBackend,
    FanOutPerfTraceBackend,
    FirebaseDimensionsPerfTraceBackend,
    PipelinePerfTraceBackend,
    configurePerfTraces,
} from '@chatic/perf';

import { appBridge } from '../../bridge/appBridge';

import type { OnWebAppReadyPayload } from '@chatic/app-messages';
import type { Logger } from '@chatic/logger';
import type { PerfTelemetryRecorder, PerfTraceBackend } from '@chatic/perf';

/**
 * Forwards traces to the native shell, where Firebase Performance records them.
 *
 * Each end is posted the moment it happens because Firebase times a trace itself. No logging on
 * this path: it is a bridge send, and a log line here would ride the same bridge back out.
 */
export const bridgePerfTraceBackend: PerfTraceBackend = {
    start: ({ id, name }) => appBridge.startPerfTrace({ id, name }),
    stop: ({ id, name, attributes, metrics }) => appBridge.stopPerfTrace({ id, name, attributes, metrics }),
};

/**
 * Whether the installed app records traces for the web.
 *
 * Asked, not assumed: the web deploys ahead of the app, so an app build without the handlers is
 * the common case for a while. Both messages are required — a start with nowhere to stop would
 * leave traces open until the native side expires them.
 */
export const supportsNativePerfTraces = (report: OnWebAppReadyPayload | null): boolean => {
    const supported = report?.supportedWebMessages ?? [];
    return supported.includes('StartPerfTrace') && supported.includes('StopPerfTrace');
};

/**
 * The log pipeline's recorder for traces, set by the telemetry runtime once it has the run's
 * sampling policy. Until then — and in every build where nobody sets it — the pipeline branch
 * records nothing, which is the "statistics off" default.
 */
let pipelineRecorder: PerfTelemetryRecorder | undefined;

export const setPerfTelemetryRecorder = (recorder: PerfTelemetryRecorder | undefined): void => {
    pipelineRecorder = recorder;
};

/** The pipeline branch every host gets. Reads the recorder on each stop, so it can arrive late. */
export const pipelinePerfTraceBackend: PerfTraceBackend = new PipelinePerfTraceBackend(() => pipelineRecorder);

/**
 * Turns tracing on for this WebView, before its destination is known.
 *
 * Returns the one decision left: once the WebAppReady report arrives, `resolveWith` points every
 * trace — the ones already held and all later ones — at the destinations this host has:
 *
 * - an app that records traces: Firebase over the bridge (cut down to exactly what Firebase has
 *   always received) **and** the log pipeline, side by side;
 * - an app that cannot, or a plain browser tab (`null` report): the log pipeline alone.
 *
 * The deferring buffer wraps the whole fan-out, so held calls reach both branches in one order.
 *
 * `logger` and `runId` are no longer read — the old log fallback that used them is gone, and the
 * pipeline's sampling follows the server's policy instead of a constant — and are kept only so the
 * boot code calling this need not change in the same step.
 */
export const configureWebPerfTraces = (_options: { logger?: Logger; runId?: string } = {}) => {
    const deferred = new DeferredPerfTraceBackend();
    configurePerfTraces(deferred);
    let resolved = false;

    return {
        /** Whether traces still wait in the hold for `resolveWith`, which caps how many it keeps. */
        isHeld: (): boolean => !resolved,
        resolveWith(report: OnWebAppReadyPayload | null): void {
            resolved = true;
            deferred.resolve(
                supportsNativePerfTraces(report)
                    ? new FanOutPerfTraceBackend([
                          new FirebaseDimensionsPerfTraceBackend(bridgePerfTraceBackend),
                          pipelinePerfTraceBackend,
                      ])
                    : pipelinePerfTraceBackend
            );
        },
    };
};
