import type { CacheModelMap, CacheType } from '@chatic/app-messages';
import type { DataContextProvider } from '../../repositories-v2/types';

const GLOBAL_CID = 'global';
const GLOBAL_UID = 'global';
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const CACHE_TTL_MS: Record<CacheType, number> = {
    channel: 30 * MINUTE_MS,
    chat: 100 * 12 * 30 * DAY_MS, // no expiration
    invitecloud: 100 * 12 * 30 * DAY_MS, // 100 years; permanent cache
    join: 30 * MINUTE_MS,
    profile: 30 * MINUTE_MS,
    site: 30 * MINUTE_MS,
    user: 30 * MINUTE_MS,
    // Sync-cursor TTL. A watermark idle beyond the server's delta-history window points past the
    // range channel.sync/profile.sync can replay, so its delta comes back incomplete and the list
    // freezes stale until the cursor expires. On the cold (native) cache the cursor survives app
    // restarts, so a 1-day TTL kept reopened-after-idle lists stale for up to a day. An expired
    // cursor forces a full re-sync (since=0). Active use rarely hits this: each 60s poll re-saves the
    // cursor and refreshes its TTL, so it only expires across an inactivity gap longer than the TTL.
    meta: 30 * MINUTE_MS,
};

/** 어댑터 공통 스코프 표현입니다. */
export interface AdapterScope {
    cid: string;
    uid: string;
}

/**
 * 브라우저가 저장 용량 때문에 쓰기를 거부했는가.
 *
 * 한 군데에 둡니다 — 이 술어는 시간이 지나며 자라기 마련이고(Safari 레거시 `QUOTA_EXCEEDED_ERR`,
 * `code === 22`, 래핑된 에러), 복사본이 있으면 한쪽만 자라고 다른 쪽은 조용히 좁은 채로 남습니다.
 */
export const isQuotaExceededError = (error: unknown): boolean =>
    error instanceof DOMException && error.name === 'QuotaExceededError';

/** 도메인별 TTL(ms) 정책을 계산합니다. */
export const resolveTtlMs = (type: CacheType): number => CACHE_TTL_MS[type];

/** 현재 시각 기준 TTL 메타를 생성합니다. */
export const createTtlMeta = (type: CacheType, now = Date.now()) => {
    const lastSyncedAt = now;
    return {
        lastSyncedAt,
        expiresAt: lastSyncedAt + resolveTtlMs(type),
        lastAccessedAt: now,
    };
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
 * invitecloud는 cloud/사용자 구분 없이 글로벌 CID·UID를 강제합니다.
 *
 * NOTE: invitecloud의 cid도 'global'로 고정하여 IndexedDB 어댑터가 자동으로
 * 올바른 파티션을 사용합니다. 기존에는 InviteCloudLocalDataSource.runWithGlobalContext가
 * 공유 DataContextHolder를 임시로 변경했으나, 비동기 작업 중 다른 DataSource가 오염된
 * context(cid='global')를 읽어 cross-cloud 데이터 오염이 발생했습니다.
 */
export const resolveScopedContext = (type: CacheType, contextProvider: DataContextProvider): AdapterScope => {
    const base = resolveBaseScope(contextProvider);
    if (type === 'invitecloud') {
        return { cid: GLOBAL_CID, uid: GLOBAL_UID };
    }
    return {
        cid: base.cid,
        uid: base.uid,
    };
};

/** 캐시 저장 시 TTL 메타를 모델에 주입합니다. */
export const withCacheMeta = <K extends CacheType>(type: K, item: CacheModelMap[K]): CacheModelMap[K] => {
    return {
        ...(item as any),
        __cacheMeta: createTtlMeta(type),
    } as CacheModelMap[K];
};
