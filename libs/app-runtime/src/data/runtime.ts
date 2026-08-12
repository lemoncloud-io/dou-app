import { logger } from '@chatic/bridges';

import type { DataContext, DataRepositoriesV2, DataRepositoriesV2Options } from '@chatic/data';
import { DataManager } from './DataManager';
import type { IDataManager } from './types';

export interface DataRuntime {
    manager: IDataManager;
    repositories: DataRepositoriesV2;
}

let dataRuntimeSingleton: DataRuntime | null = null;
let pendingRepositoryOptions: DataRepositoriesV2Options | undefined;

export const createDataRuntime = (
    initialContext?: DataContext,
    repositoryOptions?: DataRepositoriesV2Options
): DataRuntime => {
    const manager = new DataManager(initialContext, repositoryOptions);

    return {
        manager,
        repositories: manager.getRepositories(),
    };
};

/**
 * Registers app-level repository policies (e.g. apps/web's relay-only embedded-$site persistence,
 * ADR-0045) for the lazily created singleton. Must run before the first getDataRuntime() access —
 * repositories are built once in the DataManager constructor, so a late call cannot apply and is
 * ignored with a warning instead of silently rebuilding shared state.
 */
export const configureDataRuntime = (repositoryOptions: DataRepositoriesV2Options): void => {
    if (dataRuntimeSingleton) {
        logger.warn('CACHE', '[data-runtime] configureDataRuntime called after the runtime was created; ignored');
        return;
    }
    pendingRepositoryOptions = repositoryOptions;
};

export const getDataRuntime = (): DataRuntime => {
    if (!dataRuntimeSingleton) {
        dataRuntimeSingleton = createDataRuntime(undefined, pendingRepositoryOptions);
    }
    return dataRuntimeSingleton;
};

export const getDataManager = (): IDataManager => {
    return getDataRuntime().manager;
};

export const getRepositories = (): DataRepositoriesV2 => {
    return getDataRuntime().repositories;
};
