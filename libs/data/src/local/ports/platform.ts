import type { CacheType } from '@chatic/bridge-messages';
import type { DataContextProvider } from '../../repositories/types';
import type { CacheStorage } from './cacheStorage';
import type { ICacheMetricsSource } from './metrics';
import type { IGlobalCacheSearchSource } from './search';

/** How the runtime is asked to assemble its caches — an app's own policy, not the platform's. */
export interface CacheAssemblyOptions {
    /**
     * Caps how many chat rows the web cache keeps per channel. Unset = unbounded, which is what
     * every client did before and still does unless it opts in. Only meaningful where chat is
     * served from web storage — a plain browser (`apps/web`, `apps/admin`, desktop-web); inside
     * the native WebView chat always routes to native SQLite.
     */
    maxChatsPerChannel?: number;
}

/** Where one cache domain was put for this session, as the platform named it. */
export interface CacheRoute {
    type: CacheType;
    route: string;
}

/**
 * Where the cache's rows live, filled by the platform the runtime runs on.
 *
 * A page keeps them in IndexedDB, in the tab's storage, or — inside the phone app — in the shell's
 * SQLite across the WebView bridge, and which one a domain gets depends on what the installed shell
 * can hold. A native process keeps them in its own database with no bridge at all. So both the choice
 * and the storages are the platform's; what is cached, how it is keyed and how the sync cursors are
 * judged against the choice stay with the runtime's assembly.
 */
export interface LocalCachePorts {
    /**
     * Where `type`'s rows live this session, as a short name (`web`, `native`, `session` in a page).
     * The assembly asks once per domain and keeps the answer for the session, and the answers together
     * key the sync cursors: a cursor written under other routes no longer describes these stores.
     */
    route(type: CacheType): string;
    /** The storage for `type` on the `route` it was given. */
    storage<TType extends CacheType>(
        type: TType,
        route: string,
        contextProvider: DataContextProvider,
        options: CacheAssemblyOptions | undefined
    ): CacheStorage<TType>;
    /**
     * The routes the assembly chose, once, after it built the storages — for the platform to report
     * what is news (a domain that fell back from the shell's database, say).
     */
    routed(routes: readonly CacheRoute[]): void;
    /** The search over every cached cloud. */
    globalSearch(): IGlobalCacheSearchSource;
    /** The cache's metrics, for a debug screen. */
    metrics(): ICacheMetricsSource;
}
