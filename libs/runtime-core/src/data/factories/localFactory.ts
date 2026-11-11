import type { CacheType } from '@chatic/bridge-messages';
import type {
    CacheRoute,
    DataContextProvider,
    ICacheMetricsSource,
    IGlobalCacheSearchSource,
    LocalCachePorts,
} from '@chatic/data';
import {
    type CacheStorageFactory,
    createCacheStorages,
    createLocalDataSources as createDataLocalDataSources,
    type LocalDataSources,
} from '@chatic/data';
import { localCachePlatform } from '../localCachePlatform';

import type { CacheAssemblyOptions } from '../types';
import { getSyncCursorsValidAfter } from '../syncCursorWatermark';

/**
 * The search over every cached cloud. Where it searches is the platform's: the source of truth for the
 * cache, which inside the phone app is the shell's database, not the page's.
 */
export const getGlobalCacheSearchSource = (): IGlobalCacheSearchSource => localCachePlatform.ports().globalSearch();

/** The read/reset surface for the cache's metrics. The debug screen takes this port instance only. */
export const getCacheMetricsSource = (): ICacheMetricsSource => localCachePlatform.ports().metrics();

/**
 * Assembles the local data sources over the platform's cache.
 *
 * Sync cursors describe data in OTHER domains' stores, so a cursor outlives the routing it was written
 * under and would claim "already synced" over a store the data no longer lives in. Recording each
 * decision as the storages are actually built keeps the fingerprint honest and drift-proof — a cache
 * type added later shows up here without anyone remembering to list it. An injected factory (tests)
 * leaves it empty, which disables the check.
 *
 * One route per type, asked the first time the type is built and reused for the rest of the session.
 * `@chatic/data` builds a storage per (cid, uid) partition on first use, so this factory runs again
 * after assembly whenever the session reaches a new account or cloud — and by then the platform's
 * answer may have changed (inside the phone app, the shell's capability report lands after boot).
 * Asking again would split one domain across two stores inside one session, and let the rows drift
 * away from the fingerprint, which describes the assembly-time decision.
 */
export const createLocalDataSources = ({
    contextProvider,
    cacheStorageFactory,
    cache,
}: {
    contextProvider: DataContextProvider;
    cacheStorageFactory?: CacheStorageFactory;
    cache?: CacheAssemblyOptions;
}): LocalDataSources => {
    const routes = new Map<CacheType, string>();
    const routed: CacheRoute[] = [];
    const platform = cacheStorageFactory ? undefined : localCachePlatform.ports();
    const fromPlatform =
        (ports: LocalCachePorts): CacheStorageFactory =>
        (type, provider) => {
            let route = routes.get(type);
            if (route === undefined) {
                route = ports.route(type);
                routes.set(type, route);
                routed.push({ type, route });
            }
            return ports.storage(type, route, provider, cache);
        };
    const factory = cacheStorageFactory ?? fromPlatform(platform as LocalCachePorts);
    const storages = createCacheStorages(contextProvider, factory);
    const routingFingerprint =
        routed.length > 0
            ? routed
                  .map(({ type, route }) => `${type}:${route}`)
                  .sort()
                  .join(',')
            : undefined;
    platform?.routed(routed);

    return createDataLocalDataSources(
        contextProvider,
        {
            channel: storages.channel,
            chat: storages.chat,
            inviteCloud: storages.inviteCloud,
            invite: storages.invite,
            join: storages.join,
            profile: storages.profile,
            site: storages.site,
            user: storages.user,
            meta: storages.meta,
        },
        { routingFingerprint, cursorsValidAfter: getSyncCursorsValidAfter }
    );
};
