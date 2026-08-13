import { logger } from '@chatic/bridges';
import type { CacheType } from '@chatic/app-messages';

/**
 * 네이티브 캐시 읽기/쓰기 계측.
 *
 * 네이티브 저장소는 호출마다 브릿지 왕복(직렬화 → postMessage → SQLite → 역방향)을 태우는데, 그
 * 비용이 실사용에서 얼마인지 재본 적이 없습니다. "느릴 것"이라는 가정만으로 캐시 계층을 다시
 * 설계하지 않기 위해, 먼저 숫자를 남깁니다.
 *
 * 두 가지를 따로 봅니다 — **한 번이 느린 것**과 **횟수가 많은 것**은 처방이 다릅니다. 전자는
 * 저장소 문제라 캐시 계층에서 풀어야 하고, 후자는 옵저버가 emit마다 저장소를 다시 읽는
 * 구조(`BaseLocalDataSourceV2`의 `callback(await query())`) 문제라 그쪽을 고쳐야 합니다.
 */
export type NativeCacheOperation = 'save' | 'saveAll' | 'load' | 'loadAll' | 'delete' | 'deleteAll' | 'clearAll';

/** 이 시간을 넘긴 단일 호출만 로그로 남깁니다. 전수 로깅은 링버퍼(500)를 금방 밀어냅니다. */
const SLOW_OPERATION_MS = 50;

/** 이 횟수마다 누적 요약을 한 줄 남깁니다 — 느린 호출이 하나도 없어도 빈도는 보이게. */
const SUMMARY_EVERY_OPS = 100;

export interface NativeCacheOperationStat {
    count: number;
    totalMs: number;
    maxMs: number;
}

const stats = new Map<string, NativeCacheOperationStat>();
let totalOps = 0;

const keyOf = (operation: NativeCacheOperation, type: CacheType): string => `${operation}:${type}`;

/**
 * 한 번의 네이티브 캐시 호출을 기록합니다. 실패한 호출도 기록합니다 — 타임아웃이야말로 가장 느린
 * 호출이고, 그걸 빼면 분포가 실제보다 좋아 보입니다.
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
        logger.warn('CACHE', `[nativeCache] slow ${operation} ${type} ${elapsedMs}ms`, {
            data: { operation, type, elapsedMs, count: stat.count, avgMs: Math.round(stat.totalMs / stat.count) },
        });
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

/** 부팅 이후 누적 통계. 디버그 화면·테스트에서 읽습니다. */
export const getNativeCacheMetrics = (): {
    totalOps: number;
    operations: Record<string, { count: number; avgMs: number; maxMs: number }>;
} => ({ totalOps, operations: snapshot() });

/** 테스트 seam. */
export const resetNativeCacheMetrics = (): void => {
    stats.clear();
    totalOps = 0;
};
