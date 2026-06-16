import type { ISocketClient } from '@chatic/data';

import { SocketClientAdapter } from './SocketClientAdapter';
import { SocketManager } from './SocketManager';

let socketManagerSingleton: SocketManager | null = null;
let socketClientAdapterSingleton: SocketClientAdapter | null = null;

export const getSocketManager = (): SocketManager => {
    if (!socketManagerSingleton) {
        socketManagerSingleton = new SocketManager();
    }
    return socketManagerSingleton;
};

export const getSocketClientAdapter = (): ISocketClient => {
    if (!socketClientAdapterSingleton) {
        socketClientAdapterSingleton = new SocketClientAdapter(getSocketManager());
    }
    return socketClientAdapterSingleton;
};
