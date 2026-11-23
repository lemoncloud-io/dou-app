import { SocketManager } from './SocketManager';

import type { ISocketManager } from './types';

let socketManagerSingleton: ISocketManager | null = null;

export const getSocketManager = (): ISocketManager => {
    if (!socketManagerSingleton) {
        socketManagerSingleton = new SocketManager();
    }
    return socketManagerSingleton;
};
