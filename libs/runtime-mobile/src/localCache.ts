import type { CacheType } from '@chatic/bridge-messages';
import type { CacheStorage, DataContextProvider, LocalCachePorts } from '@chatic/data';
import { NativeCacheMetricsSource, NativeDBAdapter, NativeGlobalSearchSource } from '@chatic/db';
import type { CacheBridgeClient } from '@chatic/db';

/** The one route a native runtime's cache has: the app's own database. */
export const NATIVE_CACHE_ROUTE = 'native';

/**
 * The cache's ports for a runtime in the app's own process.
 *
 * Every domain lives in the app's database — the one the WebView's pages have been writing through the
 * bridge — and is reached through `client`, which the app builds over the same message handlers the
 * WebView's are. So the rows, the search and the read-sharing are a page's, and a page and this runtime
 * read the same cache. There is no fallback to report: a page falls back when the installed app is too
 * old to hold a domain, and this runtime is the installed app.
 */
export const nativeLocalCachePorts = (client: CacheBridgeClient): LocalCachePorts => ({
    route: () => NATIVE_CACHE_ROUTE,
    storage: <TType extends CacheType>(
        type: TType,
        route: string,
        contextProvider: DataContextProvider
    ): CacheStorage<TType> => {
        // Only `route()` makes routes, and it makes this one. Anything else is a bug to hear about.
        if (route !== NATIVE_CACHE_ROUTE) {
            throw new Error(`[runtime-mobile] unknown cache route '${route}' for '${type}'`);
        }
        return new NativeDBAdapter(client, type, contextProvider);
    },
    routed: () => undefined,
    globalSearch: () => new NativeGlobalSearchSource(client),
    metrics: () => new NativeCacheMetricsSource(),
});
