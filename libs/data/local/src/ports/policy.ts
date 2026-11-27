import type { CacheModelMap, CacheType } from '@chatic/bridge-messages';
import type { DataContextProvider } from '@chatic/data-model';

const GLOBAL_CID = 'global';
const GLOBAL_UID = 'global';
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const CACHE_TTL_MS: Record<CacheType, number> = {
    channel: 30 * MINUTE_MS,
    chat: 100 * 12 * 30 * DAY_MS,
    invitecloud: 100 * 12 * 30 * DAY_MS,
    invite: 100 * 12 * 30 * DAY_MS,
    join: 30 * MINUTE_MS,
    profile: 30 * MINUTE_MS,
    site: 30 * MINUTE_MS,
    user: 30 * MINUTE_MS,
    meta: 30 * MINUTE_MS,
};

export interface AdapterScope {
    cid: string;
    uid: string;
}

export const resolveTtlMs = (type: CacheType): number => CACHE_TTL_MS[type];

export const createTtlMeta = (type: CacheType, now = Date.now()) => {
    const lastSyncedAt = now;
    return {
        lastSyncedAt,
        expiresAt: lastSyncedAt + resolveTtlMs(type),
        lastAccessedAt: now,
    };
};

export const resolveBaseScope = (contextProvider: DataContextProvider): AdapterScope | null => {
    const context = contextProvider.getContext();
    if (!context.uid) return null;
    return {
        cid: context.cid || 'default',
        uid: context.uid,
    };
};

export const resolveScopedContext = (type: CacheType, contextProvider: DataContextProvider): AdapterScope | null => {
    if (type === 'invitecloud') {
        return { cid: GLOBAL_CID, uid: GLOBAL_UID };
    }
    return resolveBaseScope(contextProvider);
};

export const withCacheMeta = <K extends CacheType>(type: K, item: CacheModelMap[K]): CacheModelMap[K] => {
    return {
        ...(item as any),
        __cacheMeta: createTtlMeta(type),
    } as CacheModelMap[K];
};
