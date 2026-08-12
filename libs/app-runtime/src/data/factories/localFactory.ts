import type { CacheType } from '@chatic/app-messages';
import type { DataContextProvider, IGlobalCacheSearchSource } from '@chatic/data';
import {
    type CacheStorage,
    type CacheStorageFactory,
    createCacheStorages,
    createLocalDataSourcesV2 as createDataLocalDataSources,
    type LocalDataSourcesV2,
} from '@chatic/data';
import { webClient } from '@chatic/bridges';
import {
    type CacheStorageStrategy,
    IndexedDbOnlyCacheStorageStrategy,
    NativeDbOnlyCacheStorageStrategy,
} from '../cacheStorageStrategies';
import { isNativeCacheTypeUsable } from '../nativeCacheSupport';

export const isNativeApp = (): boolean => {
    return typeof window !== 'undefined' && !!(window as any).ReactNativeWebView;
};

// Cache types pinned to Hot(IndexedDB) regardless of environment, overriding the strategy selected
// below. `profile` is here because the native Cold writer stamps the scope `uid` over the profile
// OWNER's `uid`, collapsing every member of a place onto one canonical `sid@myUid` key so only a
// single profile survives a list read (missing nicks/photos). Hot storage keeps the item verbatim,
// so routing profile here fixes that without waiting on a native app release.
// Trade-off: WebView IndexedDB can be evicted by the OS, which is exactly why the native path is
// otherwise Cold-only. Profiles are server-derived display data and refetch on demand, so an
// eviction costs a refetch rather than data loss.
const HOT_ONLY_CACHE_TYPES = new Set<CacheType>(['profile']);

// Memoized so all cache types share one strategy instance.
let sharedStrategy: CacheStorageStrategy | null = null;
let hotStrategy: CacheStorageStrategy | null = null;
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

// `profile` only (see HOT_ONLY_CACHE_TYPES), so no chat cap belongs here — the cap is applied
// where chat is actually served, in selectStrategy below.
const getHotStrategy = (): CacheStorageStrategy => {
    if (!hotStrategy) {
        hotStrategy = new IndexedDbOnlyCacheStorageStrategy();
    }
    return hotStrategy;
};

const selectStrategy = (): CacheStorageStrategy => {
    if (!sharedStrategy) {
        // Native WebView: Cold(NativeDB/SQLite) only — a single durable store that survives WebView
        // IndexedDB eviction and drops the hot/cold coordination pitfalls of the 2-tier strategy
        // (cold-first write gate, missing cold→hot read fallback).
        // Web / desktop-web: Hot(IndexedDB) only — no native bridge to reach a cold tier.
        sharedStrategy = isNativeApp()
            ? new NativeDbOnlyCacheStorageStrategy(webClient)
            : new IndexedDbOnlyCacheStorageStrategy(chatCacheLimit);
    }
    return sharedStrategy;
};

// DataContext 스냅샷 대신 DataContextProvider를 주입받습니다.
export const getCacheStorage = <TType extends CacheType>(
    type: TType,
    contextProvider: DataContextProvider
): CacheStorage<TType> =>
    // Hot(IndexedDB) when this type is pinned there, or when the native shell running us cannot be
    // trusted to store it: the web deploys ahead of the app, so a type newer than the installed app
    // would otherwise be written into a `default:` arm that answers `null` with `success: true` —
    // a permanently empty cache that looks like a cold miss forever. Types the app does support keep
    // going to the durable native store, so the fallback never costs an existing domain its cache.
    // ...but only inside the app: a browser has no native store to be skewed against, and routing it
    // here would also drop the chat cap that the environment strategy carries.
    HOT_ONLY_CACHE_TYPES.has(type) || (isNativeApp() && !isNativeCacheTypeUsable(type))
        ? getHotStrategy().create(type, contextProvider)
        : selectStrategy().create(type, contextProvider);

export const getGlobalCacheSearchSource = (): IGlobalCacheSearchSource => selectStrategy().createGlobalSearchSource();

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
