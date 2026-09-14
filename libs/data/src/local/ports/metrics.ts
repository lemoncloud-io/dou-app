/**
 * The read and reset surface for the native cache instrumentation `@chatic/db` implements (ADR-0070
 * decision 5). Recording is not on the port, because it is an internal call within the same module as
 * `NativeDBAdapter` — writing the instrumentation is an engine implementation detail, and all the
 * consumer (the debug screen) needs is to read and reset.
 */
export interface CacheMetricsOperationStat {
    count: number;
    avgMs: number;
    maxMs: number;
}

export interface CacheMetricsSnapshot {
    totalOps: number;
    operations: Record<string, CacheMetricsOperationStat>; // key: `${operation}:${type}`
}

export interface ICacheMetricsSource {
    read(): CacheMetricsSnapshot;
    reset(): void;
}
