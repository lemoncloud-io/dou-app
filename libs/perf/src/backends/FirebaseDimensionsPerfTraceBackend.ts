import { firebaseResultOf, isFirebaseTrace, PERF_TRACE_CATALOG } from '../catalog';

import type { PerfTraceCatalog } from '../catalog';
import type { PerfTraceBackend } from '../PerfTrace';
import type { PerfTraceResult, PerfTraceStart } from '../types';

/**
 * Puts a backend behind Firebase's view of a trace: only the traces Firebase has always received,
 * and on each one only the attributes and metrics it has always received (`catalog.ts`).
 *
 * The handle now collects more than Firebase is sent — up to 16 attributes for the log pipeline —
 * and Firebase has to keep receiving exactly what it did, both because its cap is five attributes
 * and because its numbers are being compared against the pipeline's over the same period. A trace
 * name Firebase never had (`long_tasks`) is not started there at all.
 *
 * **A sample restricted by value waits for its stop.** `web_vitals` reaches Firebase for FCP and LCP
 * only; INP, CLS and TTFB are pipeline-only. Which vital a sample is becomes known at its stop, so
 * for such a name the start is held and released together with the stop — or dropped with it. A
 * sample's start and stop are issued back to back, so holding the start moves nothing in time.
 */
export class FirebaseDimensionsPerfTraceBackend implements PerfTraceBackend {
    /** Bounds the held starts, in case a sample's stop never arrives. */
    public static readonly MAX_HELD = 50;

    private readonly held = new Map<string, PerfTraceStart>();

    constructor(
        private readonly inner: PerfTraceBackend,
        private readonly catalog: PerfTraceCatalog = PERF_TRACE_CATALOG
    ) {}

    public start(trace: PerfTraceStart): void {
        if (!isFirebaseTrace(trace.name, this.catalog)) return;

        if (this.catalog[trace.name]?.firebase?.only) {
            if (this.held.size < FirebaseDimensionsPerfTraceBackend.MAX_HELD) this.held.set(trace.id, trace);
            return;
        }
        this.inner.start(trace);
    }

    public stop(result: PerfTraceResult): void {
        const held = this.held.get(result.id);
        this.held.delete(result.id);

        const forFirebase = firebaseResultOf(result, this.catalog);
        if (!forFirebase) return;

        if (held) this.inner.start(held);
        this.inner.stop(forFirebase);
    }
}
