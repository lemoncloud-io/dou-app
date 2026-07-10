import type { DataRepositoriesV2 } from '@chatic/data';

import { getDataManager } from '../data/runtime';
import type { IDataManager } from '../data/types';
import { getSocketManager } from '../socket/runtime';
import type { ISocketManager } from '../socket';
import type { RuntimeBinding } from './useRuntimeBinding';

export interface IRuntimeManager {
    ensure(binding: RuntimeBinding): void;
    getRepositories(): DataRepositoriesV2;
}

export class RuntimeManager implements IRuntimeManager {
    constructor(
        private readonly dataManager: IDataManager = getDataManager(),
        private readonly socketManager: ISocketManager = getSocketManager()
    ) {}

    public ensure(binding: RuntimeBinding): void {
        this.dataManager.ensure(binding.context);

        if (!binding.socket) {
            this.socketManager.destroy();
            return;
        }

        this.socketManager.ensure(binding.socket.config);
    }

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
