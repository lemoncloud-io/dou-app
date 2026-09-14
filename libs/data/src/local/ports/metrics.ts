/**
 * `@chatic/db`가 구현하는 네이티브 캐시 계측의 읽기·리셋 표면(ADR-0070 결정 5). 기록(record)은
 * `NativeDBAdapter`와 같은 모듈 안의 내부 호출이라 포트에 없다 — 계측을 남기는 쪽은 엔진 내부
 * 구현 디테일이고, 소비자(디버그 화면)가 필요한 것은 읽기와 리셋뿐이다.
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
