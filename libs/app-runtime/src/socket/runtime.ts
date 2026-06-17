import type { ISocketClient } from '@chatic/data';

import { SocketClientAdapter } from './SocketClientAdapter';
import { SocketManager } from './SocketManager';
import type { ISocketManager } from './types';

export interface SocketRuntime {
    manager: ISocketManager;
    socketClient: ISocketClient;
}

let socketRuntimeSingleton: SocketRuntime | null = null;

/**
 * Creates a fresh socket runtime assembly.
 */
export const createSocketRuntime = (): SocketRuntime => {
    const manager = new SocketManager();
    const socketClient = new SocketClientAdapter(manager);

    return {
        manager,
        socketClient,
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

/**
 * Returns the singleton socket client adapter, which implements the ISocketClient interface.
 */
export const getSocketClientAdapter = (): ISocketClient => {
    return getSocketRuntime().socketClient;
};
