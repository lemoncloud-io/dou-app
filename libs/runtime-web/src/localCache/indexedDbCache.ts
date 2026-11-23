import type { CacheType } from '@chatic/bridge-messages';
import type { CacheAssemblyOptions, DataContextProvider } from '@chatic/data';
import { ChatQueryExecutor, IndexedDBAdapter, IndexedDBDatabase, IndexedDbGlobalSearchSource } from '@chatic/db';

import type { SearchableWebCacheStore } from './cacheStore';

let sharedDatabase: IndexedDBDatabase | null = null;

export const sharedIndexedDbDatabase = (): IndexedDBDatabase => {
    sharedDatabase ??= new IndexedDBDatabase();
    return sharedDatabase;
};

export interface IndexedDbCacheOptions {
    database?: () => IndexedDBDatabase;
}

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
            return new IndexedDBAdapter(db, 'chat', contextProvider, {
                executor: new ChatQueryExecutor(),
                maxChatsPerChannel: options?.maxChatsPerChannel,
            }) as unknown as IndexedDBAdapter<TType>;
        }
        return new IndexedDBAdapter(db, type, contextProvider);
    },
    globalSearch: () => new IndexedDbGlobalSearchSource(database()),
});
