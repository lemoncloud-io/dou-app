import type { CacheType } from '@chatic/bridge-messages';
import type { DataContextProvider } from '@chatic/data-model';
import type { DbTable } from './cacheStorage';
import type { DbMetricsSource } from './metrics';
import type { DbSearchSource } from './search';

export interface CacheAssemblyOptions {
    maxChatsPerChannel?: number;
}

export interface CacheRoute {
    type: CacheType;
    route: string;
}

export interface DbPort {
    route(type: CacheType): string;
    storage<TType extends CacheType>(
        type: TType,
        route: string,
        contextProvider: DataContextProvider,
        options: CacheAssemblyOptions | undefined
    ): DbTable<TType>;
    routed(routes: readonly CacheRoute[]): void;
    globalSearch(): DbSearchSource;
    metrics(): DbMetricsSource;
}

export type LocalCachePorts = DbPort;
