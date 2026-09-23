import type { CacheType } from '@chatic/app-messages';
import type { CacheStorage, DataContextProvider, ICacheMetricsSource, IGlobalCacheSearchSource } from '@chatic/data';
import {
    type CacheStorageFactory,
    createCacheStorages,
    createLocalDataSources as createDataLocalDataSources,
    type LocalDataSources,
} from '@chatic/data';
import {
    ChatQueryExecutor,
    IndexedDBAdapter,
    IndexedDBDatabase,
    IndexedDbGlobalSearchSource,
    NativeCacheMetricsSource,
    NativeDBAdapter,
    NativeGlobalSearchSource,
} from '@chatic/db';
import { logger, webClient } from '@chatic/bridges';
import { type CacheBackend, resolveCacheBackend } from '../cacheStorageRouting';
import { isNativeApp } from '../../utils/isNativeApp';
import { isNativeCacheTypeUsable } from '../nativeCacheSupport';

import type { CacheAssemblyOptions } from '../types';

// ─── Shared IndexedDB instance ─────────────────────────────────────────
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

// Takes a DataContextProvider as a dependency instead of a DataContext snapshot.
export const getCacheStorage = <TType extends CacheType>(
    type: TType,
    contextProvider: DataContextProvider,
    cache?: CacheAssemblyOptions,
    backend: CacheBackend = resolveCacheBackend(type)
): CacheStorage<TType> =>
    // Where the type lands is decided in ONE place (see resolveCacheBackend); this factory only
    // materializes that decision as an adapter. The chat cap rides along unconditionally because
    // it only ever matters on the web backend — the adapter ignores it for non-chat types.
    backend === 'web'
        ? createIndexedDBAdapter(type, contextProvider, cache?.maxChatsPerChannel)
        : new NativeDBAdapter(webClient, type, contextProvider);

// Global cache search source, regardless of cloud (cid). The implementation differs per
// environment (IndexedDB range scan vs. native bridge), but the expected behavior must be the same
// (ADR-0088). On native, SQLite is the source of truth, so search targets it too — web storage is
// only a derived cache holding pin/skew exceptions, so it isn't a search target.
export const getGlobalCacheSearchSource = (): IGlobalCacheSearchSource =>
    isNativeApp() ? new NativeGlobalSearchSource(webClient) : new IndexedDbGlobalSearchSource(getSharedDatabase());

/** The read/reset surface for native cache metrics (ADR-0070 Decision 5). The debug screen doesn't
 * import `@chatic/db` directly — it only takes this port instance. See apps/web CacheMetricsScreen.tsx. */
export const getCacheMetricsSource = (): ICacheMetricsSource => new NativeCacheMetricsSource();

/**
 * A hook that resolves the right storage for the environment and assembles the LocalDataSource bundle.
 */
/**
 * Records the cache domains a native shell could not hold, so they went to web storage instead.
 *
 * The consequence is a cold cache for those domains — reads miss until the data is re-fetched — and
 * it happens when the installed shell predates the domain's storage edition. Diagnosing "why is
 * this app re-downloading everything" from the client side is otherwise guesswork (ADR-0099).
 *
 * One entry per boot with the domain list, not one per domain: routing is decided per storage as
 * they are built, and a dozen lines would bury the boot log. And nothing at all on a plain browser —
 * there every domain is web storage by definition, so it is not a fallback.
 */
const reportNativeCacheFallback = (routed: string[]): void => {
    if (!isNativeApp() || routed.length === 0) return;

    const fellBack = routed
        .filter(entry => entry.endsWith(':web'))
        .map(entry => entry.split(':')[0])
        // Web-pinned domains are meant to live there; only a capability shortfall is news.
        .filter(type => !isNativeCacheTypeUsable(type as CacheType));
    if (fellBack.length === 0) return;

    logger.info('CACHE', `${fellBack.length} cache domain(s) fell back to web storage`, {
        data: { domains: fellBack.sort() },
    });
};

export const createLocalDataSources = ({
    contextProvider, // injected-parameter change
    cacheStorageFactory,
    cache,
}: {
    contextProvider: DataContextProvider;
    cacheStorageFactory?: CacheStorageFactory;
    cache?: CacheAssemblyOptions;
}): LocalDataSources => {
    // Sync cursors describe data in OTHER domains' stores, so a cursor outlives the routing it was
    // written under and would claim "already synced" over a store the data no longer lives in
    // (ADR-0053). Recording each decision as the storages are actually built keeps the fingerprint
    // honest and drift-proof — a cache type added later shows up here without anyone remembering to
    // list it. An injected factory (tests) leaves it empty, which disables the check.
    //
    // One decision per type, made the first time the type is built and reused for the rest of the
    // session. `@chatic/data` builds a storage per (cid, uid) partition on first use, so this factory
    // runs again after assembly whenever the session reaches a new account or cloud — and by then the
    // shell's capability handshake may have landed, which changes `resolveCacheBackend`'s answer for
    // `invite`. Deciding again there would split one domain across two stores inside one session: a
    // partition first reached after the handshake writes its local-only rows (invite dismissals) to
    // SQLite, and the next boot, assembling before the handshake, reads IndexedDB. It would also let
    // the rows drift away from the fingerprint below, which describes the assembly-time decision.
    const backends = new Map<CacheType, CacheBackend>();
    const routed: string[] = [];
    const factory: CacheStorageFactory =
        cacheStorageFactory ??
        ((type, provider) => {
            let backend = backends.get(type);
            if (!backend) {
                backend = resolveCacheBackend(type);
                backends.set(type, backend);
                routed.push(`${type}:${backend}`);
            }
            return getCacheStorage(type, provider, cache, backend);
        });
    const storages = createCacheStorages(contextProvider, factory);
    const routingFingerprint = routed.length > 0 ? routed.sort().join(',') : undefined;
    reportNativeCacheFallback(routed);

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
