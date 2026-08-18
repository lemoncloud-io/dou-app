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
export type NativeCacheOperation =
    | 'save'
    | 'saveAll'
    | 'load'
    | 'loadMany'
    | 'loadAll'
    | 'loadLast'
    | 'delete'
    | 'deleteAll'
    | 'clearAll';

/** 이 시간을 넘긴 단일 호출만 로그로 남깁니다. 전수 로깅은 링버퍼(500)를 금방 밀어냅니다. */
const SLOW_OPERATION_MS = 50;

/**
 * 같은 (연산, 타입)의 느린 호출 경고를 이 간격으로만 남깁니다.
 *
 * 임계값만으로는 부족합니다 — 네이티브 로그는 브릿지로 전달되므로 경고 한 건이 곧 왕복 한 건인데,
 * 정체가 시작되면 **모든** 호출이 임계값을 넘습니다. 그러면 캐시 요청마다 로그 왕복이 하나씩 붙어
 * 계측이 자기가 재려던 정체를 키웁니다. 문제를 알아차리는 데는 몇 초에 한 줄로 충분하고, 정확한
 * 분포는 어차피 누적 통계(`getNativeCacheMetrics`)에 전수로 남습니다.
 */
const SLOW_LOG_THROTTLE_MS = 3000;

/** 이 횟수마다 누적 요약을 한 줄 남깁니다 — 느린 호출이 하나도 없어도 빈도는 보이게. */
const SUMMARY_EVERY_OPS = 100;

export interface NativeCacheOperationStat {
    count: number;
    totalMs: number;
    maxMs: number;
}

const stats = new Map<string, NativeCacheOperationStat>();
/** (연산:타입)별 마지막 느린-호출 경고 시각. 스로틀 판단에만 씁니다. */
const lastSlowLogAt = new Map<string, number>();
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
        const now = Date.now();
        // 아직 한 번도 안 남긴 키는 무조건 남깁니다. `?? 0`으로 두면 "0에 남겼다"는 뜻이 되어,
        // 시계가 스로틀 간격보다 작은 환경(테스트의 고정 시각)에서 첫 경고가 삼켜집니다.
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

/** 부팅 이후 누적 통계. 디버그 화면·테스트에서 읽습니다. */
export const getNativeCacheMetrics = (): {
    totalOps: number;
    operations: Record<string, { count: number; avgMs: number; maxMs: number }>;
} => ({ totalOps, operations: snapshot() });

/** 테스트 seam. */
export const resetNativeCacheMetrics = (): void => {
    stats.clear();
    lastSlowLogAt.clear();
    totalOps = 0;
};
