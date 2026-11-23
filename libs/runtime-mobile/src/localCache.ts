import type { CacheType } from '@chatic/bridge-messages';
import type { CacheStorage, DataContextProvider, LocalCachePorts } from '@chatic/data';
import { NativeCacheMetricsSource, NativeDBAdapter, NativeGlobalSearchSource } from '@chatic/db';
import type { CacheBridgeClient } from '@chatic/db';

export const NATIVE_CACHE_ROUTE = 'native';

export const nativeLocalCachePorts = (client: CacheBridgeClient): LocalCachePorts => ({
    route: () => NATIVE_CACHE_ROUTE,
    storage: <TType extends CacheType>(
        type: TType,
        route: string,
        contextProvider: DataContextProvider
    ): CacheStorage<TType> => {
        if (route !== NATIVE_CACHE_ROUTE) {
            throw new Error(`[runtime-mobile] unknown cache route '${route}' for '${type}'`);
        }
        return new NativeDBAdapter(client, type, contextProvider, { handlesMessage: () => true });
    },
    routed: () => undefined,
    globalSearch: () => new NativeGlobalSearchSource(client),
    metrics: () => new NativeCacheMetricsSource(),
});
