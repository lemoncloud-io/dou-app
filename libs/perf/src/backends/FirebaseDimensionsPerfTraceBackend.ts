import { firebaseResultOf, isFirebaseTrace, PERF_TRACE_CATALOG } from '../catalog';

import type { PerfTraceCatalog } from '../catalog';
import type { PerfTraceBackend } from '../PerfTrace';
import type { PerfTraceResult, PerfTraceStart } from '../types';

export class FirebaseDimensionsPerfTraceBackend implements PerfTraceBackend {
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
