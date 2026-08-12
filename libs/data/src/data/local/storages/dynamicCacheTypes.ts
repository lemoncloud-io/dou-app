import type { CacheModelOf, CacheType } from '@chatic/app-messages';
import type { CacheStorage } from './types';

// ─── Read Policy ──────────────────────────────────────────────────────

export type CacheReadPolicy = 'hot-first' | 'cold-first';

// ─── PolicyResolver ───────────────────────────────────────────────────

/** type별 readPolicy/loadAllPolicy를 결정하는 주입 인터페이스 */
export interface PolicyResolver {
    resolveReadPolicy(type: CacheType): CacheReadPolicy;
    resolveLoadAllPolicy(type: CacheType): CacheReadPolicy;
}

// ─── EvictionStrategy ─────────────────────────────────────────────────

/** Hot(IndexedDB) quota 보호를 위한 eviction 정책 3-훅 인터페이스 */
export interface EvictionStrategy {
    /** Startup TTL sweep 등. DCS 생성 직후 1회 호출 */
    onStartup(hot: CacheStorage<any>): Promise<void>;

    /** per-type cap 검사. Hot.save 완료 후 chain 호출 */
    onAfterWrite<T extends CacheType>(type: T, items: CacheModelOf<T>[], hot: CacheStorage<T>): Promise<void>;

    /** 비상 cleanup. Hot 에러가 QuotaExceededError류일 때 호출 */
    onQuotaExceeded(type: CacheType, hot: CacheStorage<any>): Promise<void>;
}

// ─── CapacityPolicy ───────────────────────────────────────────────────

/** EvictionStrategy 구현체가 내부에서 사용하는 type별 cap + grouping 인터페이스 */
export interface CapacityPolicy {
    /** 해당 type의 최대 항목 수. null이면 cap 없음 */
    getLimit(type: CacheType, groupKey?: string): number | null;

    /** item을 그룹 키로 매핑. undefined면 전체 LRU */
    getGroupKey<T extends CacheType>(type: T, item: CacheModelOf<T>): string | undefined;
}

// ─── CacheErrorReporter ───────────────────────────────────────────────

export type CacheErrorTier = 'hot' | 'cold' | 'eviction' | 'stampede';

export type CacheErrorOperation =
    | 'load'
    | 'loadAll'
    | 'save'
    | 'saveAll'
    | 'delete'
    | 'deleteAll'
    | 'clearAll'
    | 'clearByChannelId'
    | 'eviction'
    | 'stampede-timeout';

export interface CacheErrorContext {
    tier: CacheErrorTier;
    operation: CacheErrorOperation;
    type?: CacheType;
}

/** hot/cold/eviction/stampede 4-tier 에러를 단일 인터페이스로 통합 */
export type CacheErrorReporter = (error: unknown, context: CacheErrorContext) => void;

// ─── StampedeTimeoutError ─────────────────────────────────────────────

/** Stampede 가드의 timeout을 caller가 식별할 수 있는 Error 클래스 */
export class StampedeTimeoutError extends Error {
    override readonly name = 'StampedeTimeoutError';
    constructor(
        public readonly queryKey: string,
        public readonly elapsedMs: number
    ) {
        super(`Stampede timeout: ${queryKey} (${elapsedMs}ms)`);
    }
}

// ─── DynamicCacheStorage Options ──────────────────────────────────────

export interface DynamicCacheStorageOptions<TType extends CacheType> {
    /** 도메인 타입 (에러 context에 포함) */
    type?: TType;
    /** load() 메서드의 읽기 정책 — PolicyResolver 미주입 시 fallback */
    readPolicy?: CacheReadPolicy;
    /** loadAll() 메서드의 읽기 정책 — PolicyResolver 미주입 시 fallback */
    loadAllPolicy?: CacheReadPolicy;
    /** warm-up 시 chunk 크기 (향후 확장용) */
    warmupChunkSize?: number;
    /** type별 readPolicy/loadAllPolicy 주입 (미주입 + prod = throw) */
    policyResolver?: PolicyResolver;
    /** Hot eviction 3-훅 (미주입 = no-op) */
    evictionStrategy?: EvictionStrategy;
    /** type별 cap + grouping (미주입 = 무한) */
    capacityPolicy?: CapacityPolicy;
    /** hot/cold/eviction/stampede 통합 에러 리포터 (미주입 시 app-runtime 기본 구현 = `logger.warn`) */
    reporter?: CacheErrorReporter;
}

/** Stampede 가드 기본 timeout (ms) */
export const STAMPEDE_TIMEOUT_MS = 5_000;
