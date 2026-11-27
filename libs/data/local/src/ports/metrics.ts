export interface CacheMetricsOperationStat {
    count: number;
    avgMs: number;
    maxMs: number;
}

export interface CacheMetricsSnapshot {
    totalOps: number;
    operations: Record<string, CacheMetricsOperationStat>;
}

export interface DbMetricsSource {
    read(): CacheMetricsSnapshot;
    reset(): void;
}

export type ICacheMetricsSource = DbMetricsSource;
