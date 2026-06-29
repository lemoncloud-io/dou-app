import type { CacheType } from '@chatic/app-messages';
import {
    type CacheErrorReporter,
    type CacheStorage,
    type CacheStorageFactory,
    type CapacityPolicy,
    createCacheStorages,
    type DataContextProvider,
    type EvictionStrategy,
    createLocalDataSourcesV2 as createDataLocalDataSources,
    type LocalDataSourcesV2,
    type PolicyResolver,
} from '@chatic/data';
import { type CacheStorageStrategy, IndexedDbOnlyCacheStorageStrategy } from '../cacheStorageStrategies';

export const isNativeApp = (): boolean => {
    return typeof window !== 'undefined' && !!(window as any).ReactNativeWebView;
};

export interface CacheFactoryOptions {
    policyResolver?: PolicyResolver;
    evictionStrategy?: EvictionStrategy;
    capacityPolicy?: CapacityPolicy;
    reporter?: CacheErrorReporter;
}

const selectStrategy = (_options?: CacheFactoryOptions): CacheStorageStrategy => {
    // TODO: Re-enable the Hot(IndexedDB)+Cold(NativeDB) strategy once the native
    // caching domains are registered on the bridge. Until then the NativeDB cold
    // tier would conflict with unregistered cache types, so we run IndexedDB-only
    // in every environment (including the native WebView).
    return new IndexedDbOnlyCacheStorageStrategy();
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
