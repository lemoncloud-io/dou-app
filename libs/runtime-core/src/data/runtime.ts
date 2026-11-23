import { logger } from '@chatic/logger';

import type { DataRepositories, DataRepositoriesOptions } from '@chatic/data';
import { DataManager } from './DataManager';
import type { CacheAssemblyOptions, IDataManager } from './types';

export interface DataRuntime {
    manager: IDataManager;
    repositories: DataRepositories;
}

let dataRuntimeSingleton: DataRuntime | null = null;
let pendingRepositoryOptions: DataRepositoriesOptions | undefined;
let pendingCacheOptions: CacheAssemblyOptions | undefined;

const createDataRuntime = (
    repositoryOptions?: DataRepositoriesOptions,
    cacheOptions?: CacheAssemblyOptions
): DataRuntime => {
    const manager = new DataManager(repositoryOptions, cacheOptions);

    return {
        manager,
        repositories: manager.getRepositories(),
    };
};

export interface DataRuntimeConfig {
    repositories?: DataRepositoriesOptions;
    cache?: CacheAssemblyOptions;
}

export const configureDataRuntime = ({ repositories, cache }: DataRuntimeConfig): void => {
    if (dataRuntimeSingleton) {
        logger.warn('CACHE', '[data-runtime] configureDataRuntime called after the runtime was created; ignored');
        return;
    }
    if (repositories) {
        pendingRepositoryOptions = { ...pendingRepositoryOptions, ...repositories };
    }
    if (cache) {
        pendingCacheOptions = { ...pendingCacheOptions, ...cache };
    }
};

export const getDataRuntime = (): DataRuntime => {
    if (!dataRuntimeSingleton) {
        dataRuntimeSingleton = createDataRuntime(pendingRepositoryOptions, pendingCacheOptions);
    }
    return dataRuntimeSingleton;
};

export const getDataManager = (): IDataManager => {
    return getDataRuntime().manager;
};

export const getRepositories = (): DataRepositories => {
    return getDataRuntime().repositories;
};
