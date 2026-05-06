import type { CacheType } from '@chatic/app-messages';
import type { CacheStorage } from './cacheStorage';
import type { DataContextProvider } from '../../repositories';

export * from './cacheStorage';
export * from './indexedDBAdapter';
export * from './nativeDBAdapter';

export type CacheStorageFactory = <TType extends CacheType>(
    type: TType,
    contextProvider: DataContextProvider
) => CacheStorage<TType>;

export interface LocalCacheStorages {
    channel: CacheStorage<'channel'>;
    chat: CacheStorage<'chat'>;
    inviteCloud: CacheStorage<'invitecloud'>;
    join: CacheStorage<'join'>;
    site: CacheStorage<'site'>;
    user: CacheStorage<'user'>;
}

export const createCacheStorages = (
    contextProvider: DataContextProvider,
    storageFactory: CacheStorageFactory
): LocalCacheStorages => ({
    channel: storageFactory('channel', contextProvider),
    chat: storageFactory('chat', contextProvider),
    inviteCloud: storageFactory('invitecloud', contextProvider),
    join: storageFactory('join', contextProvider),
    site: storageFactory('site', contextProvider),
    user: storageFactory('user', contextProvider),
});
