import { SocketManager } from './SocketManager';
import type { ISocketManager } from './types';

export interface SocketRuntime {
    manager: ISocketManager;
}

let socketRuntimeSingleton: SocketRuntime | null = null;

/**
 * Creates a fresh socket runtime assembly.
 */
export const createSocketRuntime = (): SocketRuntime => {
    const manager = new SocketManager();

    return {
        manager,
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
