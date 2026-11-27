import { hostProfile, webClient } from '@chatic/bridges';
import type { LocalCachePorts } from '@chatic/data';
import { indexedDbCache, webStorageCache } from '@chatic/runtime-web';
import type { KeyValueStore } from '@chatic/storage';

import { getNativeCacheSupport } from './nativeCacheSupport';
import { routedCachePorts } from './routedCachePorts';
import { shellSqliteCache } from './shellSqliteCache';

export { setNativeCacheSupport, readNativeCacheSupport } from './nativeCacheSupport';
export type { NativeCacheReport, NativeCacheSupport } from './nativeCacheSupport';
export { shellSqliteCache } from './shellSqliteCache';
export type { ShellSqliteCacheOptions } from './shellSqliteCache';
export { routedCachePorts } from './routedCachePorts';
export type { RoutedCachePortsOptions } from './routedCachePorts';
export { CACHE_DOMAIN_CANDIDATES, chooseCacheBackendFor } from './routing';
export type { CacheBackend, CacheBackendCandidate, CacheDomainContext } from './routing';

export const webLocalCachePorts = (tab: KeyValueStore): LocalCachePorts => {
    const indexedDb = indexedDbCache();
    return routedCachePorts({
        bridge: hostProfile().bridge,
        support: getNativeCacheSupport,
        indexedDb,
        shellSqlite: shellSqliteCache({ support: getNativeCacheSupport, client: webClient }),
        webStorage: webStorageCache({ tab, importFrom: indexedDb }),
    });
};
