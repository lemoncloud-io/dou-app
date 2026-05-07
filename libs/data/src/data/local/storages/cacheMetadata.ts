import type { CacheType } from '@chatic/app-messages';

export interface CacheTtlMeta {
    lastSyncedAt: number;
    expiresAt: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const CACHE_TTL_MS: Record<CacheType, number> = {
    channel: 7 * DAY_MS,
    chat: 3 * DAY_MS,
    invitecloud: 100 * 12 * 30 * DAY_MS, //100 years; Permanent
    join: 7 * DAY_MS,
    site: 7 * DAY_MS,
    user: 5 * MINUTE_MS,
};

export const resolveTtlMs = (type: CacheType): number => CACHE_TTL_MS[type];

export const createTtlMeta = (type: CacheType, now = Date.now()): CacheTtlMeta => {
    const lastSyncedAt = now;
    return {
        lastSyncedAt,
        expiresAt: lastSyncedAt + resolveTtlMs(type),
    };
};

export const isExpired = (meta: CacheTtlMeta, now = Date.now()): boolean => {
    return meta.expiresAt <= now;
};
