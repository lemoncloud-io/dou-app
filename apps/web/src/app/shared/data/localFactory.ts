import { useMemo } from 'react';

import type { CacheType } from '@chatic/app-messages';
import {
    type CacheStorage,
    type CacheStorageFactory,
    createCacheStorages,
    createLocalDataSources,
    type DataContextProvider,
    type LocalDataSources,
    type PolicyResolver,
    type EvictionStrategy,
    type CapacityPolicy,
    type CacheErrorReporter,
} from '@chatic/data';
import { webBridge } from '../bridges';
import {
    type CacheStorageStrategy,
    IndexedDbOnlyCacheStorageStrategy,
    HotColdCacheStorageStrategy,
    AppPolicyResolver,
} from './cacheStorageStrategies';

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

    return new HotColdCacheStorageStrategy(webBridge, {
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
export const useLocalDataSourcesFactory = ({
    contextProvider, // 주입 파라미터 변경
    cacheStorageFactory = getCacheStorage,
}: {
    contextProvider: DataContextProvider;
    cacheStorageFactory?: CacheStorageFactory;
}): { localDataSources: LocalDataSources } => {
    const localDataSources = useMemo(() => {
        // 스토리지 생성 시 Provider 주입
        const storages = createCacheStorages(contextProvider, cacheStorageFactory);

        // LocalDataSource 팩터리에도 Provider 주입
        return createLocalDataSources(contextProvider, storages);
    }, [contextProvider, cacheStorageFactory]);

    return { localDataSources };
};
