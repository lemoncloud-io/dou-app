import type { CacheType } from '@chatic/bridge-messages';
import type { DataContextProvider } from '../../repositories/types';
import type { CacheStorage } from './cacheStorage';
import type { ICacheMetricsSource } from './metrics';
import type { IGlobalCacheSearchSource } from './search';

export interface CacheAssemblyOptions {
    maxChatsPerChannel?: number;
}

export interface CacheRoute {
    type: CacheType;
    route: string;
}

export interface LocalCachePorts {
    route(type: CacheType): string;
    storage<TType extends CacheType>(
        type: TType,
        route: string,
        contextProvider: DataContextProvider,
        options: CacheAssemblyOptions | undefined
    ): CacheStorage<TType>;
    routed(routes: readonly CacheRoute[]): void;
    globalSearch(): IGlobalCacheSearchSource;
    metrics(): ICacheMetricsSource;
}
