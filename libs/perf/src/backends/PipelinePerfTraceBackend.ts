import { PERF_TRACE_CATALOG } from '../catalog';

import type { PerfTraceCatalog } from '../catalog';
import type { PerfTraceBackend } from '../PerfTrace';
import type { PerfTraceName, PerfTraceResult } from '../types';

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
