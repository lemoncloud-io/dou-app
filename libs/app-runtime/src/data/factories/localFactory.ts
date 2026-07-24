import type { CacheType } from '@chatic/app-messages';
import type { DataContextProvider } from '@chatic/data';
import {
    type CacheErrorReporter,
    type CacheStorage,
    type CacheStorageFactory,
    type CapacityPolicy,
    createCacheStorages,
    createLocalDataSourcesV2 as createDataLocalDataSources,
    type EvictionStrategy,
    type LocalDataSourcesV2,
    type PolicyResolver,
} from '@chatic/data';
import { webClient } from '@chatic/bridges';
import {
    AppPolicyResolver,
    type CacheStorageStrategy,
    HotColdCacheStorageStrategy,
    IndexedDbOnlyCacheStorageStrategy,
} from '../cacheStorageStrategies';

export const isNativeApp = (): boolean => {
    return typeof window !== 'undefined' && !!(window as any).ReactNativeWebView;
};

export interface CacheFactoryOptions {
    policyResolver?: PolicyResolver;
    evictionStrategy?: EvictionStrategy;
    capacityPolicy?: CapacityPolicy;
    reporter?: CacheErrorReporter;
}

// Memoized so all cache types share one strategy instance (and one AppPolicyResolver).
let sharedStrategy: CacheStorageStrategy | null = null;

const selectStrategy = (_options?: CacheFactoryOptions): CacheStorageStrategy => {
    if (!sharedStrategy) {
        // Native WebView: Hot(IndexedDB) + Cold(NativeDB/SQLite) 2-tier. All 8 cache
        // domains are registered on the native bridge (CacheCrudService), so the cold
        // tier no longer conflicts with unregistered types.
        // Web / desktop-web: IndexedDB only (no native cold tier).
        sharedStrategy = isNativeApp()
            ? new HotColdCacheStorageStrategy(webClient, { policyResolver: new AppPolicyResolver() })
            : new IndexedDbOnlyCacheStorageStrategy();
    }
    return sharedStrategy;
};

// DataContext 스냅샷 대신 DataContextProvider를 주입받습니다.
export const getCacheStorage = <TType extends CacheType>(
    type: TType,
    contextProvider: DataContextProvider
): CacheStorage<TType> => selectStrategy().create(type, contextProvider);

/**
 * 환경에 맞는 스토리지를 판별하고 LocalDataSource 묶음을 조립하여 반환하는 훅입니다.
 */
export const createLocalDataSources = ({
    contextProvider, // 주입 파라미터 변경
    cacheStorageFactory = getCacheStorage,
}: {
    contextProvider: DataContextProvider;
    cacheStorageFactory?: CacheStorageFactory;
}): LocalDataSourcesV2 => {
    const storages = createCacheStorages(contextProvider, cacheStorageFactory);

    return createDataLocalDataSources(contextProvider, {
        channel: storages.channel,
        chat: storages.chat,
        inviteCloud: storages.inviteCloud,
        join: storages.join,
        profile: storages.profile,
        site: storages.site,
        user: storages.user,
        meta: storages.meta,
    });
};
