import type { ISocketClient } from '@chatic/data';

import { SocketClientAdapter } from './SocketClientAdapter';
import { SocketManager } from './SocketManager';

// Cached singleton instances of the SocketManager and SocketClientAdapter.
let socketManagerSingleton: SocketManager | null = null;
let socketClientAdapterSingleton: SocketClientAdapter | null = null;

/**
 * Returns the singleton instance of SocketManager.
 * Creates it on the first call.
 */
export const getSocketManager = (): SocketManager => {
    if (!socketManagerSingleton) {
        socketManagerSingleton = new SocketManager();
    }
    return socketManagerSingleton;
};

/**
 * Returns the singleton instance of SocketClientAdapter, which implements the ISocketClient interface.
 * Creates it on the first call using the SocketManager singleton.
 */
export const getSocketClientAdapter = (): ISocketClient => {
    if (!socketClientAdapterSingleton) {
        socketClientAdapterSingleton = new SocketClientAdapter(getSocketManager());
    }
    return socketClientAdapterSingleton;
};
