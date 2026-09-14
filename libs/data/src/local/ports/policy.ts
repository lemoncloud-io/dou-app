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
    // Invite expiry is judged from the server's `state`/`expiredAt`, never from cache TTL — a TTL
    // eviction here would undo the whole point of this cache (instant render on cold boot).
    invite: 100 * 12 * 30 * DAY_MS, // 100 years; permanent cache
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
    //
    // TEMPORARY (migration): held at 5 minutes while data is migrating. A delta replayed across a
    // migration can describe a shape the client no longer has, and a full re-sync is the cheap way
    // out — so the cursor is expired aggressively to lean on since=0 instead of trusting deltas.
    // Cost: every user returning from an inactivity gap over 5 minutes pays a full re-sync, which is
    // real server load. Restore to `30 * MINUTE_MS` once the migration is done.
    meta: 5 * MINUTE_MS,
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
        lastAccessedAt: now,
    };
};

/**
 * 현재 컨텍스트를 기본 스코프로 정규화합니다. 세션이 없으면 `null` — 스코프가 없다는 뜻입니다.
 *
 * **cid와 uid의 폴백은 대칭이 아닙니다.** `cid`의 `'default'`는 실재하는 파티션입니다(릴레이).
 * `uid`에는 그런 게 없습니다 — 로그인하지 않은 사용자의 캐시라는 건 없으니, 빈 uid는 폴백할
 * 값이 아니라 쓰지 말아야 할 상태입니다.
 *
 * 예전에는 여기서 `context.uid || 'default'`로 채웠습니다. 그래서 릴레이 로그아웃이 uid를
 * null로 만드는 순간(`clearRelaySession`) 모든 읽기·쓰기가 `type:cid:default:id`라는
 * 유령 파티션으로 조용히 갈아탔고, 다음 로그인은 진짜 uid 파티션으로 돌아왔습니다. 그 사이에
 * 쓴 행과 sync 커서는 아무도 다시 읽지 않는 곳에 남았습니다 — 채널 목록이 빈 채로 굳고
 * `channel.sync`는 델타만 받아오는 증상의 출처가 이 한 줄이었습니다.
 */
export const resolveBaseScope = (contextProvider: DataContextProvider): AdapterScope | null => {
    const context = contextProvider.getContext();
    if (!context.uid) return null;
    return {
        cid: context.cid || 'default',
        uid: context.uid,
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
export const resolveScopedContext = (type: CacheType, contextProvider: DataContextProvider): AdapterScope | null => {
    // invitecloud는 세션 이전의 도메인입니다(초대 링크를 열어본 사람은 아직 로그인 전일 수 있습니다).
    // 그래서 uid 검사보다 먼저 답합니다 — 고정 파티션이라 세션이 없어도 갈 곳이 분명합니다.
    if (type === 'invitecloud') {
        return { cid: GLOBAL_CID, uid: GLOBAL_UID };
    }
    return resolveBaseScope(contextProvider);
};

/** 캐시 저장 시 TTL 메타를 모델에 주입합니다. */
export const withCacheMeta = <K extends CacheType>(type: K, item: CacheModelMap[K]): CacheModelMap[K] => {
    return {
        ...(item as any),
        __cacheMeta: createTtlMeta(type),
    } as CacheModelMap[K];
};
