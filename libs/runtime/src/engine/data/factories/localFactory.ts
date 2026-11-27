import type { CacheType } from '@chatic/bridge-messages';
import type {
    CacheRoute,
    DataContextProvider,
    ICacheMetricsSource,
    IGlobalCacheSearchSource,
    DbPort,
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

export const getGlobalCacheSearchSource = (): IGlobalCacheSearchSource => localCachePlatform.ports().globalSearch();

export const getCacheMetricsSource = (): ICacheMetricsSource => localCachePlatform.ports().metrics();

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
        (ports: DbPort): CacheStorageFactory =>
        (type, provider) => {
            let route = routes.get(type);
            if (route === undefined) {
                route = ports.route(type);
                routes.set(type, route);
                routed.push({ type, route });
            }
            return ports.storage(type, route, provider, cache);
        };
    const factory = cacheStorageFactory ?? fromPlatform(platform as DbPort);
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
