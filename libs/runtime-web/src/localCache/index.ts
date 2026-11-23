import { hostProfile, webClient } from '@chatic/bridges';
import type { LocalCachePorts } from '@chatic/data';
import type { KeyValueStore } from '@chatic/storage';

import { indexedDbCache } from './indexedDbCache';
import { getNativeCacheSupport } from './nativeCacheSupport';
import { routedCachePorts } from './routedCachePorts';
import { shellSqliteCache } from './shellSqliteCache';
import { webStorageCache } from './webStorageCache';

export { setNativeCacheSupport, readNativeCacheSupport } from './nativeCacheSupport';
export type { NativeCacheReport, NativeCacheSupport } from './nativeCacheSupport';
export type { SearchableWebCacheStore, WebCacheStore } from './cacheStore';
export { indexedDbCache, sharedIndexedDbDatabase } from './indexedDbCache';
export type { IndexedDbCacheOptions } from './indexedDbCache';
export { shellSqliteCache } from './shellSqliteCache';
export type { ShellSqliteCacheOptions } from './shellSqliteCache';
export { webStorageCache } from './webStorageCache';
export type { WebStorageCacheOptions } from './webStorageCache';
export { routedCachePorts } from './routedCachePorts';
export type { RoutedCachePortsOptions } from './routedCachePorts';

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
