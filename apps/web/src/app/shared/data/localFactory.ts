import { useMemo } from 'react';

import type { CacheType } from '@chatic/app-messages';
import {
    type CacheStorage,
    type CacheStorageFactory,
    createCacheStorages,
    createLocalDataSources,
    type DataContextProvider,
    type LocalDataSources,
    IndexedDBDatabase,
    IndexedDBAdapter,
    NativeDBAdapter,
    ChatQueryExecutor,
} from '@chatic/data';
import { webBridge } from '../bridges';

export const isNativeApp = (): boolean => {
    /**
     * TODO: Replace this
     * typeof window !== 'undefined' && !!(window as any).ReactNativeWebView;
     */
    return typeof window !== 'undefined' && !!(window as any).ReactNativeWebView;
};

// 모듈 수준의 단일 database 인스턴스 (공유 커넥션 보장)
let sharedDatabase: IndexedDBDatabase | null = null;
const getSharedDatabase = (): IndexedDBDatabase => {
    if (!sharedDatabase) {
        sharedDatabase = new IndexedDBDatabase();
    }
    return sharedDatabase;
};

// DataContext 스냅샷 대신 DataContextProvider를 주입받습니다.
export const getCacheStorage = <TType extends CacheType>(
    type: TType,
    contextProvider: DataContextProvider
): CacheStorage<TType> => {
    const isNative = isNativeApp();
    if (isNative) {
        return new NativeDBAdapter(webBridge, type, contextProvider);
    }

    const db = getSharedDatabase();
    if (type === 'chat') {
        return new IndexedDBAdapter(
            db,
            'chat',
            contextProvider,
            new ChatQueryExecutor()
        ) as unknown as CacheStorage<TType>;
    }
    return new IndexedDBAdapter(db, type, contextProvider);
};

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
