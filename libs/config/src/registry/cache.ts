import type { ConfigRegistryModule } from '../types';

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
