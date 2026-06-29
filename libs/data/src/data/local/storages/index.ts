import type { CacheType } from '@chatic/app-messages';
import type { DataContextProvider } from '../../repositories-v2/types';
import type { CacheStorage } from './types';

export * from './types';
export * from './IndexedDBAdapter';
export * from './NativeDBAdapter';
export * from './DynamicCacheStorage';
export * from './dynamicCacheTypes';
export * from './defaultPolicies';
export * from './stableHash';

export type CacheStorageFactory = <TType extends CacheType>(
    type: TType,
    contextProvider: DataContextProvider
) => CacheStorage<TType>;

export interface LocalCacheStorages {
    channel: CacheStorage<'channel'>;
    chat: CacheStorage<'chat'>;
    inviteCloud: CacheStorage<'invitecloud'>;
    join: CacheStorage<'join'>;
    profile: CacheStorage<'profile'>;
    site: CacheStorage<'site'>;
    user: CacheStorage<'user'>;
    meta: CacheStorage<'meta'>;
}

export const createCacheStorages = (
    contextProvider: DataContextProvider,
    storageFactory: CacheStorageFactory
): LocalCacheStorages => ({
    channel: storageFactory('channel', contextProvider),
    chat: storageFactory('chat', contextProvider),
    inviteCloud: storageFactory('invitecloud', contextProvider),
    join: storageFactory('join', contextProvider),
    profile: storageFactory('profile', contextProvider),
    site: storageFactory('site', contextProvider),
    user: storageFactory('user', contextProvider),
    meta: storageFactory('meta', contextProvider),
});
