import {
    MAX_PERF_ATTRIBUTES,
    MAX_PERF_METRICS,
    isValidPerfAttributeKey,
    isValidPerfMetricName,
    normalizePerfAttributeValue,
    normalizePerfMetricValue,
} from './limits';

import type { PerfTraceName, PerfTraceResult, PerfTraceStart } from './types';

export interface PerfTraceBackend {
    start(trace: PerfTraceStart): void;
    stop(result: PerfTraceResult): void;
}

export const NOOP_PERF_TRACE_BACKEND: PerfTraceBackend = Object.freeze({
    start: () => undefined,
    stop: () => undefined,
});

export interface PerfTrace {
    readonly id: string;
    readonly name: PerfTraceName;
    putAttribute(key: string, value: string): void;
    putMetric(key: string, value: number): void;
    mark(key: string): void;
    hasMetric(key: string): boolean;
    getMetric(key: string): number | undefined;
    stop(): void;
}

export interface CreatePerfTraceOptions {
    backend: PerfTraceBackend;
    id: string;
    name: PerfTraceName;
    elapsed: () => number;
    announce: boolean;
    sample?: boolean;
    now?: () => number;
}

class Trace implements PerfTrace {
    private readonly attributes: Record<string, string> = {};
    private readonly metrics: Record<string, number> = {};
    private stopped = false;

    constructor(
        private readonly backend: PerfTraceBackend,
        public readonly id: string,
        public readonly name: PerfTraceName,
        private readonly elapsed: () => number,
        private readonly sample: boolean,
        private readonly now: () => number
    ) {}

    public putAttribute(key: string, value: string): void {
        if (this.stopped || !isValidPerfAttributeKey(key)) return;
        const normalized = normalizePerfAttributeValue(value);
        if (normalized == null) return;
        if (!(key in this.attributes) && Object.keys(this.attributes).length >= MAX_PERF_ATTRIBUTES) return;
        this.attributes[key] = normalized;
    }

    public putMetric(key: string, value: number): void {
        if (this.stopped || !isValidPerfMetricName(key)) return;
        const normalized = normalizePerfMetricValue(value);
        if (normalized == null) return;
        if (!(key in this.metrics) && Object.keys(this.metrics).length >= MAX_PERF_METRICS) return;
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
            ...(this.sample ? { sample: true } : {}),
            endedAt: this.now(),
        });
    }
}

export const createPerfTrace = ({
    backend,
    id,
    name,
    elapsed,
    announce,
    sample = false,
    now = Date.now,
}: CreatePerfTraceOptions): PerfTrace => {
    if (announce) backend.start({ id, name });
    return new Trace(backend, id, name, elapsed, sample, now);
};
