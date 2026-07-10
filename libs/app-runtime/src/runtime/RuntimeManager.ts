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

        // Dual sockets: ensure/tear down each slot by kind (mirrors SocketBinder). relay is always-on
        // once its token exists; cloud is present only while a cloud session is active.
        const { relay, cloud } = binding.socket;
        if (relay) {
            this.socketManager.ensure(relay.config, 'relay');
        } else {
            this.socketManager.destroy('relay');
        }
        if (cloud) {
            this.socketManager.ensure(cloud.config, 'cloud');
        } else {
            this.socketManager.destroy('cloud');
        }
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
