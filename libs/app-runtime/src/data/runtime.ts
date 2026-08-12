import { logger } from '@chatic/bridges';

import type { DataContext, DataRepositoriesV2, DataRepositoriesV2Options } from '@chatic/data';
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
    initialContext?: DataContext,
    repositoryOptions?: DataRepositoriesV2Options,
    cacheOptions?: CacheAssemblyOptions
): DataRuntime => {
    const manager = new DataManager(initialContext, repositoryOptions, cacheOptions);

    return {
        manager,
        repositories: manager.getRepositories(),
    };
};

/**
 * Registers app-level repository policies (e.g. apps/web's relay-only embedded-$site persistence,
 * ADR-0045) and cache assembly policies (e.g. desktop-web's chat cap) for the lazily created
 * singleton. Must run before the first getDataRuntime() access — repositories and cache storages
 * are built once in the DataManager constructor, so a late call cannot apply and is ignored with a
 * warning instead of silently rebuilding shared state.
 */
export const configureDataRuntime = (
    repositoryOptions: DataRepositoriesV2Options,
    cacheOptions?: CacheAssemblyOptions
): void => {
    if (dataRuntimeSingleton) {
        logger.warn('CACHE', '[data-runtime] configureDataRuntime called after the runtime was created; ignored');
        return;
    }
    pendingRepositoryOptions = repositoryOptions;
    if (cacheOptions) {
        pendingCacheOptions = { ...pendingCacheOptions, ...cacheOptions };
    }
};

/**
 * Caps how many chat rows the web cache keeps per channel (see CacheAssemblyOptions).
 *
 * @deprecated Pass `{ maxChatsPerChannel }` as the cache options of `configureDataRuntime`
 * instead — this is the same pre-boot registration, kept only because `apps/desktop-web` still
 * calls it. Remove once desktop-web moves to configureDataRuntime.
 */
export const setChatCacheLimit = (maxChatsPerChannel: number): void => {
    if (dataRuntimeSingleton) {
        logger.warn('CACHE', '[data-runtime] setChatCacheLimit called after the runtime was created; ignored');
        return;
    }
    pendingCacheOptions = { ...pendingCacheOptions, maxChatsPerChannel };
};

export const getDataRuntime = (): DataRuntime => {
    if (!dataRuntimeSingleton) {
        dataRuntimeSingleton = createDataRuntime(undefined, pendingRepositoryOptions, pendingCacheOptions);
    }
    return dataRuntimeSingleton;
};

export const getDataManager = (): IDataManager => {
    return getDataRuntime().manager;
};

export const getRepositories = (): DataRepositoriesV2 => {
    return getDataRuntime().repositories;
};
