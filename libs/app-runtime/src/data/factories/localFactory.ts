import type { CacheType } from '@chatic/app-messages';
import type { DataContextProvider, IGlobalCacheSearchSource } from '@chatic/data';
import {
    type CacheStorage,
    type CacheStorageFactory,
    ChatQueryExecutor,
    createCacheStorages,
    createLocalDataSourcesV2 as createDataLocalDataSources,
    IndexedDBAdapter,
    IndexedDBDatabase,
    IndexedDbGlobalSearchSource,
    type LocalDataSourcesV2,
    NativeDBAdapter,
    NativeGlobalSearchSource,
} from '@chatic/data';
import { webClient } from '@chatic/bridges';
import { isNativeApp, resolveCacheBackend } from '../cacheStorageRouting';

/**
 * App-level cache assembly policy, injected when the data runtime is built (runtime.ts passes it
 * into the DataManager constructor). This is the APP's policy, not the engine's — a default baked
 * in here would silently apply to every client that assembles a data runtime.
 */
export interface CacheAssemblyOptions {
    /**
     * Caps how many chat rows the web cache keeps per channel. Unset = unbounded, which is what
     * every client did before and still does unless it opts in. Only meaningful where chat is
     * served from web storage — a plain browser (`apps/web`, `apps/admin-v2`, desktop-web); inside
     * the native WebView chat always routes to native SQLite.
     */
    maxChatsPerChannel?: number;
}

// ─── 공유 IndexedDB 인스턴스 ─────────────────────────────────────────
// The ONLY module state in this factory: one physical IndexedDB connection shared by every
// web-backed adapter. Everything else here is assembled per call from its inputs.

let sharedDatabase: IndexedDBDatabase | null = null;
const getSharedDatabase = (): IndexedDBDatabase => {
    if (!sharedDatabase) {
        sharedDatabase = new IndexedDBDatabase();
    }
    return sharedDatabase;
};

const createIndexedDBAdapter = <TType extends CacheType>(
    type: TType,
    contextProvider: DataContextProvider,
    maxChatsPerChannel?: number
): IndexedDBAdapter<TType> => {
    const db = getSharedDatabase();
    if (type === 'chat') {
        return new IndexedDBAdapter(db, 'chat', contextProvider, {
            executor: new ChatQueryExecutor(),
            maxChatsPerChannel,
        }) as unknown as IndexedDBAdapter<TType>;
    }
    return new IndexedDBAdapter(db, type, contextProvider);
};

// DataContext 스냅샷 대신 DataContextProvider를 주입받습니다.
export const getCacheStorage = <TType extends CacheType>(
    type: TType,
    contextProvider: DataContextProvider,
    cache?: CacheAssemblyOptions
): CacheStorage<TType> =>
    // Where the type lands is decided in ONE place (see resolveCacheBackend); this factory only
    // materializes that decision as an adapter. The chat cap rides along unconditionally because
    // it only ever matters on the web backend — the adapter ignores it for non-chat types.
    resolveCacheBackend(type) === 'web'
        ? createIndexedDBAdapter(type, contextProvider, cache?.maxChatsPerChannel)
        : new NativeDBAdapter(webClient, type, contextProvider);

// Cloud(cid) 불문 전역 캐시 검색 소스. 환경별 구현체는 다르지만(IndexedDB 범위 스캔 vs 네이티브
// 브리지) 기대 동작은 동일해야 합니다(ADR-0033). 네이티브에서는 SQLite가 source of truth이므로
// 검색도 그쪽을 향한다 — 웹 저장소는 핀/스큐 예외만 담는 파생 캐시라 검색 대상이 아니다.
export const getGlobalCacheSearchSource = (): IGlobalCacheSearchSource =>
    isNativeApp() ? new NativeGlobalSearchSource(webClient) : new IndexedDbGlobalSearchSource(getSharedDatabase());

/**
 * 환경에 맞는 스토리지를 판별하고 LocalDataSource 묶음을 조립하여 반환하는 훅입니다.
 */
export const createLocalDataSources = ({
    contextProvider, // 주입 파라미터 변경
    cacheStorageFactory,
    cache,
}: {
    contextProvider: DataContextProvider;
    cacheStorageFactory?: CacheStorageFactory;
    cache?: CacheAssemblyOptions;
}): LocalDataSourcesV2 => {
    // Sync cursors describe data in OTHER domains' stores, so a cursor outlives the routing it was
    // written under and would claim "already synced" over a store the data no longer lives in
    // (ADR-0053). Recording each decision as the storages are actually built keeps the fingerprint
    // honest and drift-proof — a cache type added later shows up here without anyone remembering to
    // list it. An injected factory (tests) leaves it empty, which disables the check.
    const routed: string[] = [];
    const factory: CacheStorageFactory =
        cacheStorageFactory ??
        ((type, provider) => {
            routed.push(`${type}:${resolveCacheBackend(type)}`);
            return getCacheStorage(type, provider, cache);
        });
    const storages = createCacheStorages(contextProvider, factory);
    const routingFingerprint = routed.length > 0 ? routed.sort().join(',') : undefined;

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
        { routingFingerprint }
    );
};
