import type { DataRepositoriesV2 } from '@chatic/data';

import { getDataManager } from '../data/runtime';
import type { IDataManager } from '../data/types';

export interface IRuntimeManager {
    getRepositories(): DataRepositoriesV2;
}

export class RuntimeManager implements IRuntimeManager {
    constructor(private readonly dataManager: IDataManager = getDataManager()) {}

    public getRepositories(): DataRepositoriesV2 {
        return this.dataManager.getRepositories();
    }
}

let runtimeManagerSingleton: IRuntimeManager | null = null;

export const getRuntimeManager = (): IRuntimeManager => {
    if (!runtimeManagerSingleton) {
        runtimeManagerSingleton = new RuntimeManager();
    }
    return runtimeManagerSingleton;
};
