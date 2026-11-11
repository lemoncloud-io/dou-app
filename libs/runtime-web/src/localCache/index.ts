import type { CacheType } from '@chatic/bridge-messages';
import type {
    CacheAssemblyOptions,
    CacheRoute,
    CacheStorage,
    DataContextProvider,
    LocalCachePorts,
} from '@chatic/data';
import {
    ChatQueryExecutor,
    IndexedDBAdapter,
    IndexedDBDatabase,
    IndexedDbGlobalSearchSource,
    NativeCacheMetricsSource,
    NativeDBAdapter,
    NativeGlobalSearchSource,
    WebStorageAdapter,
} from '@chatic/db';
import { webClient } from '@chatic/bridges';
import { logger } from '@chatic/logger';
import { getRecordedCloudIds, identityStore } from '@chatic/session';
import { asDomStorage } from '@chatic/storage';

import type { KeyValueStore } from '@chatic/storage';
import { InvitedCloudImportStorage } from './invitedCloudImport';
import { isNativeCacheTypeUsable } from './nativeCacheSupport';
import { type CacheBackend, isInPhoneApp, resolveCacheBackend } from './routing';

export { setNativeCacheSupport } from './nativeCacheSupport';
export type { NativeCacheSupport } from './nativeCacheSupport';

// One physical IndexedDB connection, shared by every web-backed adapter in the page — the only module
// state here. Opened on first use, not at import.
let sharedDatabase: IndexedDBDatabase | null = null;
const getSharedDatabase = (): IndexedDBDatabase => {
    sharedDatabase ??= new IndexedDBDatabase();
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

/**
 * The tab-lifetime store. Invited clouds — its only domain — were kept in IndexedDB before, so their
 * store also carries the rows this tab entered there across, once per tab.
 */
const createTabStorageAdapter = <TType extends CacheType>(
    type: TType,
    contextProvider: DataContextProvider,
    tabStore: KeyValueStore
): CacheStorage<TType> => {
    // The runtime's `tab` store, seen as the DOM `Storage` the engine takes: the domain ends with the tab.
    const tab = asDomStorage(tabStore);
    const store = new WebStorageAdapter(tab, type, contextProvider);
    if (type !== 'invitecloud') return store;
    return new InvitedCloudImportStorage(
        store as unknown as CacheStorage<'invitecloud'>,
        () => createIndexedDBAdapter('invitecloud', contextProvider),
        { marker: tab, getDelegatorId: () => identityStore.getDelegatorId(), getRecordedCloudIds }
    ) as unknown as CacheStorage<TType>;
};

/**
 * Records the cache domains a phone shell could not hold, so they went to web storage instead.
 *
 * The consequence is a cold cache for those domains — reads miss until the data is re-fetched — and
 * it happens when the installed shell predates the domain's storage edition. Diagnosing "why is this
 * app re-downloading everything" from the client side is otherwise guesswork. One entry per boot with
 * the domain list, and nothing at all in a plain browser, where every domain is web storage by
 * definition and so not a fallback.
 */
const reportPhoneCacheFallback = (routes: readonly CacheRoute[]): void => {
    if (!isInPhoneApp() || routes.length === 0) return;

    const fellBack = routes
        .filter(({ route }) => route === 'web')
        .map(({ type }) => type)
        // Web-pinned domains are meant to live there; only a capability shortfall is news.
        .filter(type => !isNativeCacheTypeUsable(type));
    if (fellBack.length === 0) return;

    logger.info('CACHE', `${fellBack.length} cache domain(s) fell back to web storage`, {
        data: { domains: [...fellBack].sort() },
    });
};

/**
 * The cache's ports for a web page.
 *
 * Each domain goes to one of three places (`resolveCacheBackend` decides, in `routing.ts`): the page's
 * IndexedDB (`web`); the phone shell's SQLite across the WebView bridge (`native`), for the domains the
 * installed shell can hold; or the tab's own store (`session`), for a plain tab's invited clouds.
 * `tab` is the store the runtime keeps per-tab state in — the same one the entry point passes as
 * `storage.tab`.
 *
 * Search follows the source of truth: the shell's SQLite inside the phone app, IndexedDB elsewhere.
 */
export const webLocalCachePorts = (tab: KeyValueStore): LocalCachePorts => ({
    route: type => resolveCacheBackend(type),
    storage: <TType extends CacheType>(
        type: TType,
        route: string,
        contextProvider: DataContextProvider,
        options: CacheAssemblyOptions | undefined
    ): CacheStorage<TType> => {
        switch (route as CacheBackend) {
            case 'native':
                return new NativeDBAdapter(webClient, type, contextProvider);
            case 'session':
                return createTabStorageAdapter(type, contextProvider, tab);
            case 'web':
                // The chat cap rides along unconditionally: the adapter ignores it for non-chat types.
                return createIndexedDBAdapter(type, contextProvider, options?.maxChatsPerChannel);
            default:
                // Only `route()` makes routes, and it makes these three. Anything else is a bug to
                // hear about, not a domain to put quietly on IndexedDB.
                throw new Error(`[runtime-web] unknown cache route '${route}' for '${type}'`);
        }
    },
    routed: reportPhoneCacheFallback,
    globalSearch: () =>
        isInPhoneApp() ? new NativeGlobalSearchSource(webClient) : new IndexedDbGlobalSearchSource(getSharedDatabase()),
    metrics: () => new NativeCacheMetricsSource(),
});
