import type { PerfTraceBackend } from '../PerfTrace';
import type { PerfTraceName, PerfTraceResult } from '../types';

/** What the log pipeline backend needs from `@chatic/logger`'s `TelemetryRecorder`. */
export interface PerfTelemetryRecorder {
    record(
        kind: 'trace' | 'sample',
        name: PerfTraceName,
        fields: {
            durationMs?: number;
            attrs?: Record<string, string>;
            metrics?: Record<string, number>;
            timestamp?: number;
        }
    ): unknown;
}

/**
 * Records traces on the log pipeline as statistics entries — `kind: 'trace'` with `durationMs`, or
 * `kind: 'sample'` for a value that arrived finished — with attributes and metrics as structured
 * fields the server can aggregate.
 *
 * It replaces the old log fallback, which wrote a sentence (`'<name> <ms>ms'`) with the numbers inside
 * a capped string, sampled one run in ten by a constant. Whether a record is kept is now the
 * recorder's decision, taken from the server's sampling policy, and with no policy it keeps nothing.
 *
 * The recorder is read on every stop through `getRecorder`, not captured, because the host builds it
 * later than the first traces: it needs the sampling policy, which arrives after boot. Until there is
 * one, a stop records nothing. There is nothing to do on a start — the pipeline only records a
 * finished trace.
 */
export class PipelinePerfTraceBackend implements PerfTraceBackend {
    constructor(private readonly getRecorder: () => PerfTelemetryRecorder | undefined) {}

    public start(): void {
        // Nothing until the trace finishes.
    }

    public stop(result: PerfTraceResult): void {
        try {
            const recorder = this.getRecorder();
            if (!recorder) return;

            recorder.record(result.sample ? 'sample' : 'trace', result.name, {
                ...(result.sample ? {} : { durationMs: result.durationMs }),
                attrs: result.attributes,
                metrics: result.metrics,
                ...(result.endedAt !== undefined ? { timestamp: result.endedAt } : {}),
            });
        } catch {
            // This backend also runs on its own (a standalone tab, an app without the bridge
            // messages), where nothing above it would catch: a measurement must never become the
            // call site's exception.
        }
    }
}
