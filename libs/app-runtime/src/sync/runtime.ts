import { getRepositories } from '../data/runtime';
import { getSocketManager } from '../socket/runtime';
import { RuntimeSyncController } from './RuntimeSyncController';
import type { IRuntimeSyncController } from './types';

export interface SyncRuntime {
    controller: IRuntimeSyncController;
}

let syncRuntimeSingleton: SyncRuntime | null = null;

export const createSyncRuntime = (): SyncRuntime => ({
    controller: new RuntimeSyncController({
        socketManager: getSocketManager(),
        getRepositories,
    }),
});

export const getSyncRuntime = (): SyncRuntime => {
    if (!syncRuntimeSingleton) {
        syncRuntimeSingleton = createSyncRuntime();
    }

    return syncRuntimeSingleton;
};
