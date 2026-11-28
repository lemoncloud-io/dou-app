import type { CacheDomainVersions, CacheType } from '@chatic/bridge-messages';

export interface CacheDomainContract {
    version: number;
    sinceUserVersion: number;
}

export const CACHE_DOMAIN_CONTRACTS: Record<CacheType, CacheDomainContract> = {
    channel: { version: 1, sinceUserVersion: 1 },
    chat: { version: 1, sinceUserVersion: 1 },
    user: { version: 1, sinceUserVersion: 1 },
    join: { version: 1, sinceUserVersion: 1 },
    site: { version: 1, sinceUserVersion: 1 },
    invitecloud: { version: 1, sinceUserVersion: 1 },
    profile: { version: 1, sinceUserVersion: 9 },
    meta: { version: 1, sinceUserVersion: 10 },
    invite: { version: 1, sinceUserVersion: 11 },
};

export const deriveCacheDomainVersions = (userVersion: number): CacheDomainVersions => {
    const versions: CacheDomainVersions = {};
    for (const [type, contract] of Object.entries(CACHE_DOMAIN_CONTRACTS) as [CacheType, CacheDomainContract][]) {
        if (userVersion >= contract.sinceUserVersion) versions[type] = contract.version;
    }
    return versions;
};
