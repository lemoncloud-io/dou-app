import { PERF_TRACE_CATALOG } from '../catalog';

import type { PerfTraceCatalog } from '../catalog';
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
 *
 * `ambientAttributes` are dimensions of the run rather than of one trace — which side holds the
 * session, say. Each is added to a trace whose catalog entry lists it and that does not carry it
 * already; the others never see it, so the recorder has nothing to refuse. A value that is
 * `undefined` is left off.
 */
export class PipelinePerfTraceBackend implements PerfTraceBackend {
    constructor(
        private readonly getRecorder: () => PerfTelemetryRecorder | undefined,
        private readonly ambientAttributes?: () => Readonly<Record<string, string | undefined>>,
        private readonly catalog: PerfTraceCatalog = PERF_TRACE_CATALOG
    ) {}

    public start(): void {
        // Nothing until the trace finishes.
    }

    public stop(result: PerfTraceResult): void {
        try {
            const recorder = this.getRecorder();
            if (!recorder) return;

            recorder.record(result.sample ? 'sample' : 'trace', result.name, {
                ...(result.sample ? {} : { durationMs: result.durationMs }),
                attrs: this.attributesOf(result),
                metrics: result.metrics,
                ...(result.endedAt !== undefined ? { timestamp: result.endedAt } : {}),
            });
        } catch {
            // This backend also runs on its own (a standalone tab, an app without the bridge
            // messages), where nothing above it would catch: a measurement must never become the
            // call site's exception.
        }
    }

    private attributesOf(result: PerfTraceResult): Record<string, string> | undefined {
        const ambient = this.ambientAttributes?.();
        const allowed = this.catalog[result.name]?.attributes;
        if (!ambient || !allowed) return result.attributes;
        let attributes = result.attributes;
        for (const [key, value] of Object.entries(ambient)) {
            if (value === undefined || !allowed[key] || attributes?.[key] !== undefined) continue;
            attributes = { ...attributes, [key]: value };
        }
        return attributes;
    }
}
