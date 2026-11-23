export interface CacheMetricsOperationStat {
    count: number;
    avgMs: number;
    maxMs: number;
}

export interface CacheMetricsSnapshot {
    totalOps: number;
    operations: Record<string, CacheMetricsOperationStat>;
}

export interface ICacheMetricsSource {
    read(): CacheMetricsSnapshot;
    reset(): void;
}
