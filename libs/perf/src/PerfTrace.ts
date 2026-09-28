import {
    MAX_PERF_ATTRIBUTES,
    isValidPerfAttributeKey,
    isValidPerfMetricName,
    normalizePerfAttributeValue,
    normalizePerfMetricValue,
} from './limits';

import type { PerfTraceName, PerfTraceResult, PerfTraceStart } from './types';

/**
 * Where a trace's start and stop go.
 *
 * The one piece a host decides. The native shell hands out a Firebase-backed implementation,
 * the WebView one that forwards over the bridge, and a shell that has neither the log
 * fallback. Two calls, and no return values: a trace is measurement, and nothing a caller
 * does may wait on — or fail because of — where it is recorded.
 */
export interface PerfTraceBackend {
    start(trace: PerfTraceStart): void;
    stop(result: PerfTraceResult): void;
}

/** The backend of a host that never configured one. Off is a value, not an absence. */
export const NOOP_PERF_TRACE_BACKEND: PerfTraceBackend = Object.freeze({
    start: () => undefined,
    stop: () => undefined,
});

/**
 * One in-flight measurement.
 *
 * Everything is a no-op once `stop` has run, so a caller that stops from two places — a
 * success path and an unmount, say — records the first and cannot corrupt it with the second.
 */
export interface PerfTrace {
    readonly id: string;
    readonly name: PerfTraceName;
    /** A low-cardinality dimension. An id, a user or free text does not belong here. */
    putAttribute(key: string, value: string): void;
    /** An integer value. Last write wins. */
    putMetric(key: string, value: number): void;
    /**
     * Records the ms elapsed since the trace started, under `key`. First write wins, because a
     * phase boundary that fires twice (a re-render, a retry) was reached the first time.
     */
    mark(key: string): void;
    /**
     * Whether a metric (or mark) under `key` has been recorded. For a trace whose end depends on a
     * phase that another module marks: the module that ends it asks rather than being told.
     */
    hasMetric(key: string): boolean;
    /** The value recorded under `key`, if any — for the same kind of hand-off as `hasMetric`. */
    getMetric(key: string): number | undefined;
    stop(): void;
}

export interface CreatePerfTraceOptions {
    backend: PerfTraceBackend;
    id: string;
    name: PerfTraceName;
    /** Ms since the trace began, on whatever clock the start was taken with. */
    elapsed: () => number;
    /**
     * Whether to tell the backend the trace started. False for a trace another runtime already
     * started — it only needs its stop delivered.
     */
    announce: boolean;
}

class Trace implements PerfTrace {
    private readonly attributes: Record<string, string> = {};
    private readonly metrics: Record<string, number> = {};
    private stopped = false;

    constructor(
        private readonly backend: PerfTraceBackend,
        public readonly id: string,
        public readonly name: PerfTraceName,
        private readonly elapsed: () => number
    ) {}

    public putAttribute(key: string, value: string): void {
        if (this.stopped || !isValidPerfAttributeKey(key)) return;
        const normalized = normalizePerfAttributeValue(value);
        if (normalized == null) return;
        // Overwriting an existing key never costs a slot; a new key past the cap is dropped
        // rather than evicting one the caller set earlier and may be relying on.
        if (!(key in this.attributes) && Object.keys(this.attributes).length >= MAX_PERF_ATTRIBUTES) return;
        this.attributes[key] = normalized;
    }

    public putMetric(key: string, value: number): void {
        if (this.stopped || !isValidPerfMetricName(key)) return;
        const normalized = normalizePerfMetricValue(value);
        if (normalized == null) return;
        this.metrics[key] = normalized;
    }

    public mark(key: string): void {
        if (this.stopped || key in this.metrics) return;
        this.putMetric(key, this.elapsed());
    }

    public hasMetric(key: string): boolean {
        return key in this.metrics;
    }

    public getMetric(key: string): number | undefined {
        return this.metrics[key];
    }

    public stop(): void {
        if (this.stopped) return;
        this.stopped = true;
        this.backend.stop({
            id: this.id,
            name: this.name,
            durationMs: Math.max(0, Math.round(this.elapsed())),
            attributes: { ...this.attributes },
            metrics: { ...this.metrics },
        });
    }
}

export const createPerfTrace = ({ backend, id, name, elapsed, announce }: CreatePerfTraceOptions): PerfTrace => {
    if (announce) backend.start({ id, name });
    return new Trace(backend, id, name, elapsed);
};
