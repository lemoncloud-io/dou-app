import { SocketClientAdapter } from './SocketClientAdapter';
import type { RuntimeSocketClient } from './client-contract';
import { SocketManager } from './SocketManager';

let socketManagerSingleton: SocketManager | null = null;
let socketClientAdapterSingleton: SocketClientAdapter | null = null;

export const getSocketManager = (): SocketManager => {
    if (!socketManagerSingleton) {
        socketManagerSingleton = new SocketManager();
    }
    return socketManagerSingleton;
};

export const getSocketClientAdapter = (): RuntimeSocketClient => {
    if (!socketClientAdapterSingleton) {
        socketClientAdapterSingleton = new SocketClientAdapter(getSocketManager());
    }
    return socketClientAdapterSingleton;
};
