import type { CacheType } from '@chatic/bridge-messages';
import type { CacheAssemblyOptions, DataContextProvider } from '@chatic/data';
import { ChatQueryExecutor, IndexedDBAdapter, IndexedDBDatabase, IndexedDbGlobalSearchSource } from '@chatic/db';

import type { SearchableWebCacheStore } from './cacheStore';

// One physical IndexedDB connection, shared by every IndexedDB cache store in the page — the only
// module state here. Opened on first use, not at import.
let sharedDatabase: IndexedDBDatabase | null = null;

/**
 * The page's one IndexedDB connection. Every store that is not handed a database of its own shares
 * it, so the tab store's one-time import and the domains routed to IndexedDB read the same rows
 * through the same connection.
 */
export const sharedIndexedDbDatabase = (): IndexedDBDatabase => {
    sharedDatabase ??= new IndexedDBDatabase();
    return sharedDatabase;
};

export interface IndexedDbCacheOptions {
    /** The connection the store opens its adapters on; read at each use. The page's shared one by default. */
    database?: () => IndexedDBDatabase;
}

/**
 * The page's IndexedDB as a cache store (`cache.indexeddb`): one adapter per domain on the given
 * connection, the chat domain with its query executor and the app's per-channel cap, and the global
 * search over the same database.
 */
export const indexedDbCache = ({
    database = sharedIndexedDbDatabase,
}: IndexedDbCacheOptions = {}): SearchableWebCacheStore => ({
    storage: <TType extends CacheType>(
        type: TType,
        contextProvider: DataContextProvider,
        options?: CacheAssemblyOptions
    ): IndexedDBAdapter<TType> => {
        const db = database();
        if (type === 'chat') {
            // The chat cap rides along unconditionally: the adapter ignores it for non-chat types.
            return new IndexedDBAdapter(db, 'chat', contextProvider, {
                executor: new ChatQueryExecutor(),
                maxChatsPerChannel: options?.maxChatsPerChannel,
            }) as unknown as IndexedDBAdapter<TType>;
        }
        return new IndexedDBAdapter(db, type, contextProvider);
    },
    globalSearch: () => new IndexedDbGlobalSearchSource(database()),
});
