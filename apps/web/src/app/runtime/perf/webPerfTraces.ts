import { DeferredPerfTraceBackend, LogPerfTraceBackend, configurePerfTraces } from '@chatic/perf';

import { appBridge } from '../../bridge/appBridge';

import type { OnWebAppReadyPayload } from '@chatic/app-messages';
import type { Logger } from '@chatic/logger';
import type { PerfTraceBackend } from '@chatic/perf';

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
 * Turns tracing on for this WebView, before its destination is known.
 *
 * Returns the one decision left: once the WebAppReady report arrives, `resolveWith` points every
 * trace — the ones already held and all later ones — at Firebase through the bridge, or at the
 * log pipeline for an app that cannot record them. A `null` report is a plain browser tab; it
 * resolves to the log backend too, which records nothing there because a tab has no injected run
 * id to sample on.
 */
export const configureWebPerfTraces = ({ logger, runId }: { logger: Logger; runId: string | undefined }) => {
    const deferred = new DeferredPerfTraceBackend();
    configurePerfTraces(deferred);

    return {
        resolveWith(report: OnWebAppReadyPayload | null): void {
            deferred.resolve(
                supportsNativePerfTraces(report) ? bridgePerfTraceBackend : new LogPerfTraceBackend({ logger, runId })
            );
        },
    };
};
