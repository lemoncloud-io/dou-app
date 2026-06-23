import { SocketManager } from './SocketManager';
import { SocketSessionController } from './SocketSessionController';
import { ManagedSocketClientProxy } from './ManagedSocketClientProxy';
import { AppSyncRuntime } from './sync/AppSyncRuntime';
import type { ISocketManager } from './types';

export interface SocketRuntime {
    manager: ISocketManager;
    controller: SocketSessionController;
    proxy: ManagedSocketClientProxy;
    sync: AppSyncRuntime;
}

let socketRuntimeSingleton: SocketRuntime | null = null;

/**
 * Creates a fresh socket runtime assembly.
 */
export const createSocketRuntime = (): SocketRuntime => {
    const manager = new SocketManager();
    const controller = new SocketSessionController(manager);
    const proxy = new ManagedSocketClientProxy(manager, controller);
    const sync = new AppSyncRuntime(manager);

    return {
        manager,
        controller,
        proxy,
        sync,
    };
};

/**
 * Returns the singleton socket runtime assembly.
 */
export const getSocketRuntime = (): SocketRuntime => {
    if (!socketRuntimeSingleton) {
        socketRuntimeSingleton = createSocketRuntime();
    }
    return socketRuntimeSingleton;
};

/**
 * Returns the singleton instance of SocketManager.
 */
export const getSocketManager = (): ISocketManager => {
    return getSocketRuntime().manager;
};

export const getAppSyncRuntime = (): AppSyncRuntime => {
    return getSocketRuntime().sync;
};
