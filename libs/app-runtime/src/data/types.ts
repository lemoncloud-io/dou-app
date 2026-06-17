import type { DataContext, DataRepositories } from '@chatic/data';

export const DEFAULT_CONTEXT: DataContext = {
    cid: 'default',
};

export interface IDataManager {
    ensure(context: DataContext): DataRepositories;
    getRepositories(): DataRepositories;
    getContext(): DataContext;
    destroy(): void;
}
