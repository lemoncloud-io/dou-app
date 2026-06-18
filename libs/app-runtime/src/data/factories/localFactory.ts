import type { CacheType } from '@chatic/app-messages';
import {
    type CacheErrorReporter,
    type CacheStorage,
    type CacheStorageFactory,
    type CapacityPolicy,
    createCacheStorages,
    createLocalDataSources as createDataLocalDataSources,
    type DataContextProvider,
    type EvictionStrategy,
    type LocalDataSources,
    type PolicyResolver,
} from '@chatic/data';
import {
    AppPolicyResolver,
    type CacheStorageStrategy,
    HotColdCacheStorageStrategy,
    IndexedDbOnlyCacheStorageStrategy,
} from '../cacheStorageStrategies';
import { webClient } from '@chatic/bridges';

export const isNativeApp = (): boolean => {
    return typeof window !== 'undefined' && !!(window as any).ReactNativeWebView;
};

export interface CacheFactoryOptions {
    policyResolver?: PolicyResolver;
    evictionStrategy?: EvictionStrategy;
    capacityPolicy?: CapacityPolicy;
    reporter?: CacheErrorReporter;
}

const appPolicyResolver = new AppPolicyResolver();

const selectStrategy = (options?: CacheFactoryOptions): CacheStorageStrategy => {
    if (!isNativeApp()) {
        return new IndexedDbOnlyCacheStorageStrategy();
    }

    return new HotColdCacheStorageStrategy(webClient, {
        policyResolver: options?.policyResolver ?? appPolicyResolver,
        evictionStrategy: options?.evictionStrategy,
        capacityPolicy: options?.capacityPolicy,
        reporter: options?.reporter,
    });
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
}): LocalDataSources => {
    const storages = createCacheStorages(contextProvider, cacheStorageFactory);

    return createDataLocalDataSources(contextProvider, storages);
};
