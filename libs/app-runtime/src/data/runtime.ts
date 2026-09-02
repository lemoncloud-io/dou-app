import { logger } from '@chatic/bridges';

import type { DataRepositoriesV2, DataRepositoriesV2Options } from '@chatic/data';
import { DataManager } from './DataManager';
import type { CacheAssemblyOptions } from './factories/localFactory';
import type { IDataManager } from './types';

export interface DataRuntime {
    manager: IDataManager;
    repositories: DataRepositoriesV2;
}

let dataRuntimeSingleton: DataRuntime | null = null;
let pendingRepositoryOptions: DataRepositoriesV2Options | undefined;
let pendingCacheOptions: CacheAssemblyOptions | undefined;

export const createDataRuntime = (
    repositoryOptions?: DataRepositoriesV2Options,
    cacheOptions?: CacheAssemblyOptions
): DataRuntime => {
    const manager = new DataManager(repositoryOptions, cacheOptions);

    return {
        manager,
        repositories: manager.getRepositories(),
    };
};

export interface DataRuntimeConfig {
    /** Repository policies, e.g. apps/web's relay-only embedded-$site persistence (ADR-0045). */
    repositories?: DataRepositoriesV2Options;
    /** Cache assembly policies, e.g. desktop-web's per-channel chat cap. */
    cache?: CacheAssemblyOptions;
}

/**
 * Registers app-level policies for the lazily created runtime singleton. Must run before the first
 * getDataRuntime() access — repositories and cache storages are built once in the DataManager
 * constructor, so a late call cannot apply and is ignored with a warning instead of silently
 * rebuilding shared state.
 *
 * Calls merge, so an app may register the two policy kinds separately.
 */
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

export const getRepositories = (): DataRepositoriesV2 => {
    return getDataRuntime().repositories;
};
