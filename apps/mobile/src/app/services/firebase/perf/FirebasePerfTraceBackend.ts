import { getPerformance, trace as newFirebaseTrace } from '@react-native-firebase/perf';

import { firebaseResultOf, isKnownPerfTrace, isPipelineOnlyTrace } from '@chatic/perf';

import type { PerfTraceBackend, PerfTraceResult, PerfTraceStart } from '@chatic/perf';

export interface NativePerfTrace {
    start(): Promise<unknown>;
    stop(): Promise<unknown>;
    putAttribute(key: string, value: string): void;
    putMetric(key: string, value: number): void;
}

const createFirebaseTrace = (name: string): NativePerfTrace => newFirebaseTrace(getPerformance(), name);

const FIREBASE_MAX_ATTRIBUTES = 5;

const withFirebaseCap = (result: PerfTraceResult): PerfTraceResult => ({
    ...result,
    attributes: Object.fromEntries(Object.entries(result.attributes).slice(0, FIREBASE_MAX_ATTRIBUTES)),
});

export class FirebasePerfTraceBackend implements PerfTraceBackend {
    public static readonly OPEN_TTL_MS = 120_000;

    private readonly open = new Map<string, { trace: NativePerfTrace; startedAt: number }>();

    constructor(
        private readonly createTrace: (name: string) => NativePerfTrace = createFirebaseTrace,
        private readonly now: () => number = Date.now
    ) {}

    public start({ id, name }: PerfTraceStart): void {
        if (isPipelineOnlyTrace(name)) return;
        this.dropExpired();
        if (this.open.has(id)) return;

        const trace = this.createTrace(name);
        this.open.set(id, { trace, startedAt: this.now() });
        trace.start().catch(() => undefined);
    }

    public stop(result: PerfTraceResult): void {
        const { id } = result;
        const entry = this.open.get(id);
        if (!entry) return;
        this.open.delete(id);
        if (this.now() - entry.startedAt > FirebasePerfTraceBackend.OPEN_TTL_MS) return;

        const forFirebase = isKnownPerfTrace(result.name) ? firebaseResultOf(result) : withFirebaseCap(result);
        if (!forFirebase) return;
        const { attributes, metrics } = forFirebase;

        try {
            for (const [key, value] of Object.entries(attributes)) entry.trace.putAttribute(key, value);
            for (const [key, value] of Object.entries(metrics)) entry.trace.putMetric(key, value);
        } catch {
            // The SDK throws on a value outside its limits. `@chatic/perf` enforces them at the
            // source, so this is a sender that did not; the trace still stops, without the values.
        }
        entry.trace.stop().catch(() => undefined);
    }

    public openCount(): number {
        return this.open.size;
    }

    private dropExpired(): void {
        const cutoff = this.now() - FirebasePerfTraceBackend.OPEN_TTL_MS;
        for (const [id, entry] of this.open) {
            if (entry.startedAt < cutoff) this.open.delete(id);
        }
    }
}
