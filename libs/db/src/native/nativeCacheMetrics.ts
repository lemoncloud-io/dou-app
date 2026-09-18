import { logger } from '@chatic/bridges';
import type { CacheType } from '@chatic/app-messages';
import type { CacheMetricsSnapshot, ICacheMetricsSource } from '@chatic/data';

/**
 * Native cache read/write instrumentation.
 *
 * Native storage burns a bridge round trip per call (serialize → postMessage → SQLite → back
 * again), and we've never measured what that costs in actual use. Rather than redesigning the
 * cache layer on the assumption alone that "it must be slow", this leaves numbers behind first.
 *
 * Two things are tracked separately — **a single slow call** and **a high call count** call for
 * different remedies. The former is a storage problem to be solved in the cache layer; the
 * latter is a structural problem where an observer re-reads storage on every emit
 * (`BaseLocalDataSource`'s `callback(await query())`), which needs to be fixed on that side.
 */
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
    | 'clearByChannel';

/** Only a single call over this duration gets logged. Logging every call would quickly push the ring buffer (500) out. */
const SLOW_OPERATION_MS = 50;

/**
 * Leaves a slow-call warning for the same (operation, type) only this often.
 *
 * A threshold alone isn't enough — since native logs are delivered over the bridge, one warning
 * is one round trip, and once congestion starts, **every** call crosses the threshold. Then every
 * cache request would carry an extra log round trip, and the instrumentation would inflate the
 * very congestion it was meant to measure. One line every few seconds is enough to notice the
 * problem, and the exact distribution is recorded in full anyway in the cumulative stats
 * (`getNativeCacheMetrics`).
 */
const SLOW_LOG_THROTTLE_MS = 3000;

/** Leaves a cumulative summary line every this many calls — so frequency stays visible even with zero slow calls. */
const SUMMARY_EVERY_OPS = 100;

export interface NativeCacheOperationStat {
    count: number;
    totalMs: number;
    maxMs: number;
}

const stats = new Map<string, NativeCacheOperationStat>();
/** The time of the last slow-call warning per (operation:type). Used only for throttle decisions. */
const lastSlowLogAt = new Map<string, number>();
let totalOps = 0;

const keyOf = (operation: NativeCacheOperation, type: CacheType): string => `${operation}:${type}`;

/**
 * Records a single native cache call. Failed calls are recorded too — a timeout is the slowest
 * call of all, and excluding it would make the distribution look better than it actually is.
 */
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
        // A key that has never been logged is logged unconditionally. Defaulting to `?? 0` would
        // mean "already logged at time 0", which would swallow the first warning in an
        // environment whose clock is smaller than the throttle interval (a fixed test time).
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

/** Cumulative stats since boot. Read by the debug screen and tests. */
export const getNativeCacheMetrics = (): {
    totalOps: number;
    operations: Record<string, { count: number; avgMs: number; maxMs: number }>;
} => ({ totalOps, operations: snapshot() });

/** Test seam. */
export const resetNativeCacheMetrics = (): void => {
    stats.clear();
    lastSlowLogAt.clear();
    totalOps = 0;
};

/** The `ICacheMetricsSource` (`@chatic/data`) implementation — a thin facade over module state.
 * Creating several instances still sees the same cumulative stats; `reset()`'s global effect is
 * also identical to `resetNativeCacheMetrics`. */
export class NativeCacheMetricsSource implements ICacheMetricsSource {
    read(): CacheMetricsSnapshot {
        return getNativeCacheMetrics();
    }

    reset(): void {
        resetNativeCacheMetrics();
    }
}
