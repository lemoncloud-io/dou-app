import type { CacheType } from '@chatic/bridge-messages';
import type { CacheAssemblyOptions, CacheStorage, DataContextProvider, IGlobalCacheSearchSource } from '@chatic/data';

export interface WebCacheStore {
    storage<TType extends CacheType>(
        type: TType,
        contextProvider: DataContextProvider,
        options?: CacheAssemblyOptions
    ): CacheStorage<TType>;
}

export interface SearchableWebCacheStore extends WebCacheStore {
    globalSearch(): IGlobalCacheSearchSource;
}
