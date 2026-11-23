import { logger } from '@chatic/bridges';
import type { CacheType } from '@chatic/bridge-messages';
import type { CacheMetricsSnapshot, ICacheMetricsSource } from '@chatic/data';

export type NativeCacheOperation =
    | 'save'
    | 'saveAll'
    | 'load'
    | 'loadMany'
    | 'loadAll'
    | 'loadLast'
    | 'delete'
    | 'deleteAll'
    | 'clearAll'
    | 'clearByChannel'
    | 'loadMedia'
    | 'countMedia'
    | 'saveMedia';

const SLOW_OPERATION_MS = 50;

const SLOW_LOG_THROTTLE_MS = 3000;

const SUMMARY_EVERY_OPS = 100;

export interface NativeCacheOperationStat {
    count: number;
    totalMs: number;
    maxMs: number;
}

const stats = new Map<string, NativeCacheOperationStat>();
const lastSlowLogAt = new Map<string, number>();
let totalOps = 0;

const keyOf = (operation: NativeCacheOperation, type: CacheType): string => `${operation}:${type}`;

export const recordNativeCacheOperation = (
    operation: NativeCacheOperation,
    type: CacheType,
    elapsedMs: number
): void => {
    const key = keyOf(operation, type);
    const stat = stats.get(key) ?? { count: 0, totalMs: 0, maxMs: 0 };
    stat.count += 1;
    stat.totalMs += elapsedMs;
    stat.maxMs = Math.max(stat.maxMs, elapsedMs);
    stats.set(key, stat);
    totalOps += 1;

    if (elapsedMs >= SLOW_OPERATION_MS) {
        const now = Date.now();
        const lastLoggedAt = lastSlowLogAt.get(key);
        if (lastLoggedAt === undefined || now - lastLoggedAt >= SLOW_LOG_THROTTLE_MS) {
            lastSlowLogAt.set(key, now);
            logger.warn('CACHE', `[nativeCache] slow ${operation} ${type} ${elapsedMs}ms`, {
                data: { operation, type, elapsedMs, count: stat.count, avgMs: Math.round(stat.totalMs / stat.count) },
            });
        }
    }

    if (totalOps % SUMMARY_EVERY_OPS === 0) {
        logger.info('CACHE', `[nativeCache] ${totalOps} ops so far`, { data: { totalOps, breakdown: snapshot() } });
    }
};

const snapshot = (): Record<string, { count: number; avgMs: number; maxMs: number }> => {
    const out: Record<string, { count: number; avgMs: number; maxMs: number }> = {};
    for (const [key, stat] of stats) {
        out[key] = { count: stat.count, avgMs: Math.round(stat.totalMs / stat.count), maxMs: stat.maxMs };
    }
    return out;
};

export const getNativeCacheMetrics = (): {
    totalOps: number;
    operations: Record<string, { count: number; avgMs: number; maxMs: number }>;
} => ({ totalOps, operations: snapshot() });

export const resetNativeCacheMetrics = (): void => {
    stats.clear();
    lastSlowLogAt.clear();
    totalOps = 0;
};

export class NativeCacheMetricsSource implements ICacheMetricsSource {
    read(): CacheMetricsSnapshot {
        return getNativeCacheMetrics();
    }

    reset(): void {
        resetNativeCacheMetrics();
    }
}
