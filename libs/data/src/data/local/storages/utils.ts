import type { CacheModelMap, CacheType } from '@chatic/app-messages';
import type { DataContextProvider } from '../../repositories';

const GLOBAL_UID = 'global';
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const CACHE_TTL_MS: Record<CacheType, number> = {
    channel: 30 * MINUTE_MS,
    chat: 100 * 12 * 30 * DAY_MS, // no expiration
    invitecloud: 100 * 12 * 30 * DAY_MS, // 100 years; permanent cache
    join: 30 * MINUTE_MS,
    site: 30 * MINUTE_MS,
    user: 30 * MINUTE_MS,
};

/** 어댑터 공통 스코프 표현입니다. */
export interface AdapterScope {
    cid: string;
    uid: string;
}

/** 도메인별 TTL(ms) 정책을 계산합니다. */
export const resolveTtlMs = (type: CacheType): number => CACHE_TTL_MS[type];

/** 현재 시각 기준 TTL 메타를 생성합니다. */
export const createTtlMeta = (type: CacheType, now = Date.now()) => {
    const lastSyncedAt = now;
    return {
        lastSyncedAt,
        expiresAt: lastSyncedAt + resolveTtlMs(type),
    };
};

/** TTL 메타 기준 만료 여부를 판단합니다. */
export const isExpired = (meta: { expiresAt: number }, now = Date.now()): boolean => {
    return meta.expiresAt <= now;
};

/** 현재 컨텍스트를 기본 스코프(default fallback 포함)로 정규화합니다. */
export const resolveBaseScope = (contextProvider: DataContextProvider): AdapterScope => {
    const context = contextProvider.getContext();
    return {
        cid: context.cid || 'default',
        uid: context.uid || 'default',
    };
};

/**
 * 타입별 scope 정책을 적용한 최종 스코프를 계산합니다.
 * invitecloud는 사용자별 분리 없이 글로벌 UID를 강제합니다
 */
export const resolveScopedContext = (type: CacheType, contextProvider: DataContextProvider): AdapterScope => {
    const base = resolveBaseScope(contextProvider);
    return {
        cid: base.cid,
        uid: type === 'invitecloud' ? GLOBAL_UID : base.uid,
    };
};

/** 캐시 저장 시 TTL 메타를 모델에 주입합니다. */
export const withCacheMeta = <K extends CacheType>(type: K, item: CacheModelMap[K]): CacheModelMap[K] => {
    return {
        ...(item as object),
        __cacheMeta: createTtlMeta(type),
    } as CacheModelMap[K];
};

/** 모델에 달린 TTL 메타 기준 만료 여부를 판별합니다. */
export const isModelExpired = <K extends CacheType>(item: CacheModelMap[K]): boolean => {
    return !!item.__cacheMeta && isExpired(item.__cacheMeta);
};
