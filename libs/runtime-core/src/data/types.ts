import type { DataContext, DataRepositories } from '@chatic/data';

export interface IDataManager {
    getRepositories(): DataRepositories;
    getContext(): DataContext;
    getScopedRepositories(cid: string): DataRepositories;
    getScopedContext(cid: string): DataContext;
}

export type { CacheAssemblyOptions } from '@chatic/data';
