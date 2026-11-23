import type { CacheType } from '@chatic/bridge-messages';
import type { BridgeChannel } from '@chatic/bridges';
import type {
    CacheAssemblyOptions,
    CacheRoute,
    CacheStorage,
    DataContextProvider,
    ICacheMetricsSource,
    LocalCachePorts,
} from '@chatic/data';
import { NativeCacheMetricsSource } from '@chatic/db';
import { logger } from '@chatic/logger';

import type { SearchableWebCacheStore, WebCacheStore } from './cacheStore';
import { isCacheTypeUsableBy } from './nativeCacheSupport';
import type { NativeCacheSupport } from './nativeCacheSupport';
import { type CacheBackend, isPhoneAppBridge, resolveCacheBackendFor } from './routing';

export interface RoutedCachePortsOptions {
    bridge: BridgeChannel | null;
    support: () => NativeCacheSupport | null;
    indexedDb: SearchableWebCacheStore;
    shellSqlite?: SearchableWebCacheStore;
    webStorage?: WebCacheStore;
    metrics?: () => ICacheMetricsSource;
}

const reportPhoneCacheFallback = (
    routes: readonly CacheRoute[],
    bridge: BridgeChannel | null,
    support: NativeCacheSupport | null
): void => {
    if (!isPhoneAppBridge(bridge) || routes.length === 0) return;

    const fellBack = routes
        .filter(({ route }) => route === 'web')
        .map(({ type }) => type)
        .filter(type => !isCacheTypeUsableBy(support, type));
    if (fellBack.length === 0) return;

    logger.info('CACHE', `${fellBack.length} cache domain(s) fell back to web storage`, {
        data: { domains: [...fellBack].sort() },
    });
};

export const routedCachePorts = ({
    bridge,
    support,
    indexedDb,
    shellSqlite,
    webStorage,
    metrics = () => new NativeCacheMetricsSource(),
}: RoutedCachePortsOptions): LocalCachePorts => ({
    route: type => {
        const backend = resolveCacheBackendFor(type, { bridge, support: support() });
        if (backend === 'native' && !shellSqlite) return 'web';
        if (backend === 'session' && !webStorage) return 'web';
        return backend;
    },
    storage: <TType extends CacheType>(
        type: TType,
        route: string,
        contextProvider: DataContextProvider,
        options: CacheAssemblyOptions | undefined
    ): CacheStorage<TType> => {
        switch (route as CacheBackend) {
            case 'native':
                if (shellSqlite) return shellSqlite.storage(type, contextProvider, options);
                break;
            case 'session':
                if (webStorage) return webStorage.storage(type, contextProvider, options);
                break;
            case 'web':
                return indexedDb.storage(type, contextProvider, options);
        }
        throw new Error(`[runtime-web] unknown cache route '${route}' for '${type}'`);
    },
    routed: routes => reportPhoneCacheFallback(routes, bridge, support()),
    globalSearch: () =>
        isPhoneAppBridge(bridge) && shellSqlite ? shellSqlite.globalSearch() : indexedDb.globalSearch(),
    metrics,
});
