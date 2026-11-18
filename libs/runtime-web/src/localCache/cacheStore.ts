import type { CacheType } from '@chatic/bridge-messages';
import type { CacheAssemblyOptions, CacheStorage, DataContextProvider, IGlobalCacheSearchSource } from '@chatic/data';

/**
 * One place a page can keep cache rows — IndexedDB, the phone shell's SQLite, the tab's web storage —
 * as a maker of a domain's storage. Which domain goes to which is not its question: the routing
 * composer (`routedCachePorts`) asks each store only for the domains it routed there.
 */
export interface WebCacheStore {
    storage<TType extends CacheType>(
        type: TType,
        contextProvider: DataContextProvider,
        options?: CacheAssemblyOptions
    ): CacheStorage<TType>;
}

/** A store that can also search every cached cloud — the one that is the page's source of truth. */
export interface SearchableWebCacheStore extends WebCacheStore {
    globalSearch(): IGlobalCacheSearchSource;
}
