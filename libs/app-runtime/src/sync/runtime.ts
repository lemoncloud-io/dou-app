import { getRepositories } from '../data/runtime';
import { getSocketManager } from '../socket/runtime';
import { ChannelChatSyncController } from './ChannelChatSyncController';
import type { IChannelChatSyncController } from './types';

export interface SyncRuntime {
    controller: IChannelChatSyncController;
}

let syncRuntimeSingleton: SyncRuntime | null = null;

export const createSyncRuntime = (): SyncRuntime => ({
    controller: new ChannelChatSyncController({
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
