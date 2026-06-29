import type { DataContext, DataRepositoriesV2 } from '@chatic/data';
import { DataManager } from './DataManager';
import type { IDataManager } from './types';

export interface DataRuntime {
    manager: IDataManager;
    repositories: DataRepositoriesV2;
}

let dataRuntimeSingleton: DataRuntime | null = null;

export const createDataRuntime = (initialContext?: DataContext): DataRuntime => {
    const manager = new DataManager(initialContext);

    return {
        manager,
        repositories: manager.getRepositories(),
    };
};

export const getDataRuntime = (): DataRuntime => {
    if (!dataRuntimeSingleton) {
        dataRuntimeSingleton = createDataRuntime();
    }
    return dataRuntimeSingleton;
};

export const getDataManager = (): IDataManager => {
    return getDataRuntime().manager;
};

export const getRepositories = (): DataRepositoriesV2 => {
    return getDataRuntime().repositories;
};
