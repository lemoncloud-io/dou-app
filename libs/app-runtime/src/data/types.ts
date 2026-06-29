import type { DataContext, DataRepositoriesV2 } from '@chatic/data';

export const DEFAULT_CONTEXT: DataContext = {
    cid: 'default',
};

export interface IDataManager {
    ensure(context: DataContext): DataRepositoriesV2;
    getRepositories(): DataRepositoriesV2;
    getContext(): DataContext;
    destroy(): void;
}
