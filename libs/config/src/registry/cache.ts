import type { ConfigRegistryModule } from '../types';

/**
 * Cache TTLs, declared so one can change as a value rather than as a code change, a build and a
 * deploy. Nothing reads them yet: the caches still take their TTLs from `libs/data`'s cache policy,
 * and the two TTL defaults here mirror it — 30 minutes for general caches and for the sync cursor.
 */
export const cacheModule: ConfigRegistryModule = {
    'cache.ttl.defaultMs': {
        title: 'Default cache TTL',
        description: 'How long general caches such as channels and profiles stay valid.',
        type: 'number',
        defaultValue: 1_800_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
    'cache.ttl.metaMs': {
        title: 'Sync cursor TTL',
        description: 'A full resync replaces a delta sync once idle past this time. Shorter values raise server load.',
        type: 'number',
        defaultValue: 1_800_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
    'cache.retiredGroupTtlMs': {
        title: 'Retired cache group TTL',
        description: 'How long a no-longer-used cache group is kept before it is fully cleared.',
        type: 'number',
        defaultValue: 60_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
};
