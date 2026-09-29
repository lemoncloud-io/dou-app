import { getPerformance, trace as newFirebaseTrace } from '@react-native-firebase/perf';

import type { PerfTraceBackend, PerfTraceResult, PerfTraceStart } from '@chatic/perf';

/** The slice of a Firebase trace this backend drives. */
export interface NativePerfTrace {
    start(): Promise<unknown>;
    stop(): Promise<unknown>;
    putAttribute(key: string, value: string): void;
    putMetric(key: string, value: number): void;
}

const createFirebaseTrace = (name: string): NativePerfTrace => newFirebaseTrace(getPerformance(), name);

/**
 * Records `@chatic/perf` traces with Firebase Performance.
 *
 * Firebase times a trace from its start call to its stop call, so this backend holds each open
 * trace by id until its stop arrives. Most starts and stops come from the WebView over the bridge
 * (`StartPerfTrace` / `StopPerfTrace`); the rest are native — boot, and the two room traces
 * (`chat_room_open`, `chat_room_sync`) a notification tap begins here and the WebView ends.
 *
 * The attributes and metrics arrive only with the stop. The SDK sends them with the stop anyway,
 * and batching them there keeps a trace to two bridge messages however many phases it marks.
 */
export class FirebasePerfTraceBackend implements PerfTraceBackend {
    /**
     * A trace that has not been stopped by now never will be — the room it waited for was never
     * reached, or the WebView that owned it reloaded. It is dropped unstopped, which Firebase
     * treats as "never happened": an open-ended wait is not a duration, and stopping it here would
     * invent one.
     *
     * Longer than the slowest path the web still closes on its own — a cold-start tap that waits
     * out the handshake and a switch before the room even mounts, then the room's own timeout — so
     * the slowest samples, the ones the investigation is for, are not the ones expired here.
     */
    public static readonly OPEN_TTL_MS = 120_000;

    private readonly open = new Map<string, { trace: NativePerfTrace; startedAt: number }>();

    constructor(
        private readonly createTrace: (name: string) => NativePerfTrace = createFirebaseTrace,
        private readonly now: () => number = Date.now
    ) {}

    public start({ id, name }: PerfTraceStart): void {
        this.dropExpired();
        // Ids are generated per start, so a repeat is a duplicate delivery of the same start; the
        // trace already running is the one that measures from the real start.
        if (this.open.has(id)) return;

        const trace = this.createTrace(name);
        this.open.set(id, { trace, startedAt: this.now() });
        // Measurement must never surface as an app error; a trace the SDK refused is simply absent.
        trace.start().catch(() => undefined);
    }

    public stop({ id, attributes, metrics }: PerfTraceResult): void {
        const entry = this.open.get(id);
        // Unknown ids are expected: a trace that expired, or a stop from a WebView whose start went
        // to a backend that has since been replaced.
        if (!entry) return;
        this.open.delete(id);
        // Expiry is otherwise swept only on the next start, so a trace that outlived its window —
        // an app that sat in the background, where the web's own timers stop — is refused here too
        // rather than recorded with the time away in its duration.
        if (this.now() - entry.startedAt > FirebasePerfTraceBackend.OPEN_TTL_MS) return;

        try {
            for (const [key, value] of Object.entries(attributes)) entry.trace.putAttribute(key, value);
            for (const [key, value] of Object.entries(metrics)) entry.trace.putMetric(key, value);
        } catch {
            // The SDK throws on a value outside its limits. `@chatic/perf` enforces them at the
            // source, so this is a sender that did not; the trace still stops, without the values.
        }
        entry.trace.stop().catch(() => undefined);
    }

    /** How many traces are waiting for their stop. Diagnostics and tests only. */
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
