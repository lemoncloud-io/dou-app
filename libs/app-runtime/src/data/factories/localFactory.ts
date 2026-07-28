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
let chatCacheLimit: number | undefined;

/**
 * Caps how many chat rows the browser cache keeps per channel. Unset = unbounded, which is what
 * every client did before and still does unless it opts in.
 *
 * This is the APP's policy, not the engine's: the IndexedDB-only strategy serves every client
 * without `window.ReactNativeWebView` — `apps/web` opened in a plain browser and `apps/admin-v2`
 * included — so a limit baked into the engine would silently truncate their scrollback too.
 *
 * Must be called before the runtime mounts (the strategy is memoized on first cache access, which
 * happens when `DataManager` is constructed). An app entry module is the right place.
 */
export const setChatCacheLimit = (maxChatsPerChannel: number): void => {
    chatCacheLimit = maxChatsPerChannel;
};

const selectStrategy = (_options?: CacheFactoryOptions): CacheStorageStrategy => {
    if (!sharedStrategy) {
        // Native WebView: Hot(IndexedDB) + Cold(NativeDB/SQLite) 2-tier. All 8 cache
        // domains are registered on the native bridge (CacheCrudService), so the cold
        // tier no longer conflicts with unregistered types.
        // Web / desktop-web: IndexedDB only (no native cold tier).
        sharedStrategy = isNativeApp()
            ? new HotColdCacheStorageStrategy(webClient, { policyResolver: new AppPolicyResolver() })
            : new IndexedDbOnlyCacheStorageStrategy(chatCacheLimit);
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
