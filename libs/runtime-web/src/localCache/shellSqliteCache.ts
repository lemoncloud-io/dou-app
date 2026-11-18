import type { CacheType } from '@chatic/bridge-messages';
import type { DataContextProvider } from '@chatic/data';
import { NativeDBAdapter, NativeGlobalSearchSource } from '@chatic/db';
import type { CacheBridgeClient } from '@chatic/db';
import { webClient } from '@chatic/bridges';

import type { SearchableWebCacheStore } from './cacheStore';
import { isCacheMessageHandledBy } from './nativeCacheSupport';
import type { NativeCacheSupport } from './nativeCacheSupport';

export interface ShellSqliteCacheOptions {
    /**
     * The shell's cache report, or `null` until its handshake reply lands. A reader, asked on every
     * room media read rather than once: the reply is asynchronous and a storage can be built before it.
     */
    support: () => NativeCacheSupport | null;
    /** The bridge the cache requests go over; the page's own by default. */
    client?: CacheBridgeClient;
}

/**
 * The phone shell's SQLite as a cache store (`cache.shell-sqlite`), reached across the page's bridge:
 * one bridge adapter per domain, and the global search the shell answers.
 *
 * Which domains the shell can hold is the routing's question, not this store's; this store only asks
 * the report whether the shell answers the room media index requests.
 */
export const shellSqliteCache = ({
    support,
    client = webClient,
}: ShellSqliteCacheOptions): SearchableWebCacheStore => ({
    storage: <TType extends CacheType>(type: TType, contextProvider: DataContextProvider): NativeDBAdapter<TType> =>
        new NativeDBAdapter(client, type, contextProvider, {
            handlesMessage: message => isCacheMessageHandledBy(support(), message),
        }),
    globalSearch: () => new NativeGlobalSearchSource(client),
});
