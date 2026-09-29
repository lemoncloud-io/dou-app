import type { ConfigRegistryModule } from '../types';

/**
 * Cache TTLs. `cache.ttl.metaMs` is the flagship case for this whole registry: the source comment
 * calls it a temporary migration value that costs real server load and says to restore it once the
 * migration is done — today that restoration is a code change, a build and a deploy. As a key it
 * becomes one value change on the day the migration ends.
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
        defaultValue: 300_000,
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
