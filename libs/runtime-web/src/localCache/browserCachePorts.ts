import type { CacheType } from '@chatic/bridge-messages';
import type {
    CacheAssemblyOptions,
    CacheStorage,
    DataContextProvider,
    ICacheMetricsSource,
    DbPort,
} from '@chatic/data';
import { NativeCacheMetricsSource } from '@chatic/db';

import type { SearchableWebCacheStore, WebCacheStore } from './cacheStore';

export type BrowserCacheRoute = 'web' | 'session';

export interface BrowserCachePortsOptions {
    indexedDb: SearchableWebCacheStore;
    webStorage?: WebCacheStore;
    metrics?: () => ICacheMetricsSource;
}

export const browserCacheRouteFor = (type: CacheType, hasWebStorage: boolean): BrowserCacheRoute =>
    type === 'invitecloud' && hasWebStorage ? 'session' : 'web';

export const browserCachePorts = ({
    indexedDb,
    webStorage,
    metrics = () => new NativeCacheMetricsSource(),
}: BrowserCachePortsOptions): DbPort => ({
    route: type => browserCacheRouteFor(type, webStorage !== undefined),
    storage: <TType extends CacheType>(
        type: TType,
        route: string,
        contextProvider: DataContextProvider,
        options: CacheAssemblyOptions | undefined
    ): CacheStorage<TType> => {
        if (route === 'web') return indexedDb.storage(type, contextProvider, options);
        if (route === 'session' && webStorage) return webStorage.storage(type, contextProvider, options);
        throw new Error(`[runtime-web] unknown cache route '${route}' for '${type}'`);
    },
    routed: () => undefined,
    globalSearch: () => indexedDb.globalSearch(),
    metrics,
});
