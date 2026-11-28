export type CacheType = 'channel' | 'chat' | 'user' | 'join' | 'site' | 'invitecloud' | 'profile' | 'meta' | 'invite';

export type CacheDomainVersions = Partial<Record<CacheType, number>>;

export type PagingMeta = {
    page?: number;
    cursorNo?: number;
    limit?: number;
    total?: number;
    readNo?: number;
    took?: number;
};

export type CacheTtlMeta = {
    lastSyncedAt: number;
    expiresAt: number;
};

export type CacheViewBase = {
    __cacheMeta?: CacheTtlMeta;
};
