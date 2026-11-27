import type { LocalCachePorts } from '@chatic/data';
import type { KeyValueStore } from '@chatic/storage';

import { browserCachePorts } from './browserCachePorts';
import { indexedDbCache } from './indexedDbCache';
import { webStorageCache } from './webStorageCache';

export type { SearchableWebCacheStore, WebCacheStore } from './cacheStore';
export { indexedDbCache, sharedIndexedDbDatabase } from './indexedDbCache';
export type { IndexedDbCacheOptions } from './indexedDbCache';
export { webStorageCache } from './webStorageCache';
export type { WebStorageCacheOptions } from './webStorageCache';
export { browserCachePorts, browserCacheRouteFor } from './browserCachePorts';
export type { BrowserCachePortsOptions, BrowserCacheRoute } from './browserCachePorts';

export const webLocalCachePorts = (tab: KeyValueStore): LocalCachePorts => {
    const indexedDb = indexedDbCache();
    return browserCachePorts({ indexedDb, webStorage: webStorageCache({ tab, importFrom: indexedDb }) });
};
