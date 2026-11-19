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
    /** The bridge channel the page found at boot (`hostProfile().bridge`), `null` outside a shell. */
    bridge: BridgeChannel | null;
    /**
     * The phone shell's cache report, or `null` until its handshake reply lands. A reader, asked at
     * each routing decision: the assembly can ask before the reply and must then answer as for a
     * shell that reported nothing.
     */
    support: () => NativeCacheSupport | null;
    /** Where `web` domains go, and the global search outside the phone app. */
    indexedDb: SearchableWebCacheStore;
    /**
     * Where `native` domains go, and the global search inside the phone app. Left out, those domains and
     * that search stay on IndexedDB — a cache declared without the shell's database.
     */
    shellSqlite?: SearchableWebCacheStore;
    /**
     * Where `session` domains go — a plain tab's invited clouds. Left out, they stay on IndexedDB with
     * every other domain.
     */
    webStorage?: WebCacheStore;
    /** The cache's metrics for a debug screen; the shell bridge's request timings by default. */
    metrics?: () => ICacheMetricsSource;
}

/**
 * Records the cache domains a phone shell could not hold, so they went to web storage instead.
 *
 * The consequence is a cold cache for those domains — reads miss until the data is re-fetched — and
 * it happens when the installed shell predates the domain's storage edition. Diagnosing "why is this
 * app re-downloading everything" from the client side is otherwise guesswork. One entry per boot with
 * the domain list, and nothing at all in a plain browser, where every domain is web storage by
 * definition and so not a fallback.
 */
const reportPhoneCacheFallback = (
    routes: readonly CacheRoute[],
    bridge: BridgeChannel | null,
    support: NativeCacheSupport | null
): void => {
    if (!isPhoneAppBridge(bridge) || routes.length === 0) return;

    const fellBack = routes
        .filter(({ route }) => route === 'web')
        .map(({ type }) => type)
        // Web-pinned domains are meant to live there; only a capability shortfall is news.
        .filter(type => !isCacheTypeUsableBy(support, type));
    if (fellBack.length === 0) return;

    logger.info('CACHE', `${fellBack.length} cache domain(s) fell back to web storage`, {
        data: { domains: [...fellBack].sort() },
    });
};

/**
 * The cache's ports for a web page, composed from the three stores a page can keep rows in.
 *
 * Each domain goes to one of them (`resolveCacheBackendFor` decides, in `routing.ts`, from the bridge
 * and the report handed in here): IndexedDB (`web`); the phone shell's SQLite across the bridge
 * (`native`), for the domains the installed shell can hold; or the tab's own store (`session`), for a
 * plain tab's invited clouds. Search follows the source of truth: the shell's SQLite inside the phone
 * app, IndexedDB elsewhere.
 *
 * Nothing here reads the page: the host and the stores are the arguments, so a runtime assembled from
 * its own choices routes by exactly the table `webLocalCachePorts` does.
 */
export const routedCachePorts = ({
    bridge,
    support,
    indexedDb,
    shellSqlite,
    webStorage,
    metrics = () => new NativeCacheMetricsSource(),
}: RoutedCachePortsOptions): LocalCachePorts => ({
    // A route whose store was not handed in lands on IndexedDB, the one store every set has, so a
    // cache with fewer stores routes by the same table and only narrows where the rows can go.
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
        // Only `route()` makes routes, and only to a store it was handed. Anything else is a bug to
        // hear about, not a domain to put quietly on IndexedDB.
        throw new Error(`[runtime-web] unknown cache route '${route}' for '${type}'`);
    },
    routed: routes => reportPhoneCacheFallback(routes, bridge, support()),
    globalSearch: () =>
        isPhoneAppBridge(bridge) && shellSqlite ? shellSqlite.globalSearch() : indexedDb.globalSearch(),
    metrics,
});
