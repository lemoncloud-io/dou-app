import type { DataContext, DataRepositories } from '@chatic/data';

import { getSocketClientAdapter } from '../socket';
import { DataManager } from './DataManager';
import type { IDataManager } from './types';

export interface DataRuntime {
    manager: IDataManager;
    repositories: DataRepositories;
}

let dataRuntimeSingleton: DataRuntime | null = null;

export const createDataRuntime = (initialContext?: DataContext): DataRuntime => {
    const manager = new DataManager(getSocketClientAdapter(), initialContext);

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

export const getRepositories = (): DataRepositories => {
    return getDataRuntime().repositories;
};
