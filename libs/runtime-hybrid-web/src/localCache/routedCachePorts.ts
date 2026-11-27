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
import type { SearchableWebCacheStore, WebCacheStore } from '@chatic/runtime-web';

import { logHybridChoice } from '../candidates';

import { isCacheTypeUsableBy } from './nativeCacheSupport';
import type { NativeCacheSupport } from './nativeCacheSupport';
import { type CacheBackend, chooseCacheBackendFor, isPhoneAppBridge, resolveCacheBackendFor } from './routing';

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

const reasonFor = (
    type: CacheType,
    route: string,
    bridge: BridgeChannel | null,
    support: NativeCacheSupport | null
): string => {
    const choice = chooseCacheBackendFor(type, { bridge, support });
    return choice.chosen.id === route
        ? choice.reason
        : `${choice.chosen.id} chosen, but this cache holds no such store`;
};

const logDomainChoices = (
    routes: readonly CacheRoute[],
    bridge: BridgeChannel | null,
    support: NativeCacheSupport | null
): void => {
    if (routes.length === 0) return;
    const domains = Object.fromEntries(
        [...routes]
            .sort((a, b) => a.type.localeCompare(b.type))
            .map(({ type, route }) => [type, { route, because: reasonFor(type, route, bridge, support) }])
    );
    const summary = Object.entries(domains)
        .map(([type, { route }]) => `${type} → ${route}`)
        .join(', ');
    logHybridChoice('cache domains', summary, bridge === null ? 'no shell' : `bridge ${bridge}`, { domains });
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
        throw new Error(`[runtime-hybrid-web] unknown cache route '${route}' for '${type}'`);
    },
    routed: routes => {
        const reported = support();
        logDomainChoices(routes, bridge, reported);
        reportPhoneCacheFallback(routes, bridge, reported);
    },
    globalSearch: () =>
        isPhoneAppBridge(bridge) && shellSqlite ? shellSqlite.globalSearch() : indexedDb.globalSearch(),
    metrics,
});
