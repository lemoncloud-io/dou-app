import { logger } from '@chatic/logger';
import type { CacheDomainVersions, CacheType, WebMessageType } from '@chatic/bridge-messages';

export interface NativeCacheSupport {
    schemaVersion: number | null;
    types: ReadonlySet<CacheType>;
    domainVersions: CacheDomainVersions;
    messages: ReadonlySet<string>;
}

const LEGACY_NATIVE_CACHE_TYPES: ReadonlySet<CacheType> = new Set<CacheType>([
    'channel',
    'chat',
    'user',
    'join',
    'site',
    'invitecloud',
    'profile',
    'meta',
]);

export const LOCAL_AUTHORITY_CACHE_TYPES = ['invitecloud'] as const;
type LocalAuthorityCacheType = (typeof LOCAL_AUTHORITY_CACHE_TYPES)[number];

type GateableCacheType = Exclude<CacheType, LocalAuthorityCacheType>;

export const REQUIRED_DOMAIN_VERSION: Partial<Record<GateableCacheType, number>> = {};

let support: NativeCacheSupport | null = null;

export interface NativeCacheReport {
    cacheSchemaVersion?: number;
    supportedCacheTypes?: string[];
    cacheDomainVersions?: CacheDomainVersions;
    supportedWebMessages?: string[];
}

export const readNativeCacheSupport = (reported: NativeCacheReport): NativeCacheSupport => ({
    schemaVersion: reported.cacheSchemaVersion ?? null,
    types: new Set((reported.supportedCacheTypes ?? []) as CacheType[]),
    domainVersions: reported.cacheDomainVersions ?? {},
    messages: new Set(reported.supportedWebMessages ?? []),
});

export const setNativeCacheSupport = (reported: NativeCacheReport): void => {
    support = readNativeCacheSupport(reported);
    logger.debug('CACHE', '[nativeCacheSupport] native cache capability reported', {
        data: {
            schemaVersion: support.schemaVersion,
            typeCount: support.types.size,
            domainVersions: support.domainVersions,
        },
    });
};

export const resetNativeCacheSupport = (): void => {
    support = null;
};

export const getNativeCacheSupport = (): NativeCacheSupport | null => support;

const legacyVersion = (type: CacheType): number => (LEGACY_NATIVE_CACHE_TYPES.has(type) ? 1 : 0);
const reportedByName = (reported: NativeCacheSupport | null, type: CacheType): number =>
    reported?.types.has(type) ? 1 : 0;
const appVersion = (reported: NativeCacheSupport | null, type: CacheType): number =>
    Math.max(reported?.domainVersions[type] ?? 0, reportedByName(reported, type), legacyVersion(type));

const requiredVersion = (type: CacheType): number => REQUIRED_DOMAIN_VERSION[type as GateableCacheType] ?? 1;

export const isCacheTypeUsableBy = (reported: NativeCacheSupport | null, type: CacheType): boolean =>
    appVersion(reported, type) >= requiredVersion(type);

export const isCacheMessageHandledBy = (reported: NativeCacheSupport | null, type: WebMessageType): boolean =>
    reported?.messages.has(type) ?? false;
