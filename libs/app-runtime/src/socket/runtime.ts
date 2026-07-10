import { SocketManager } from './SocketManager';
import { SyncManager } from './sync/SyncManager';
import type { ISocketManager } from './types';

export interface SocketRuntime {
    socketManager: ISocketManager;
    syncManager: SyncManager;
}

let socketRuntimeSingleton: SocketRuntime | null = null;

/**
 * Creates a fresh socket runtime assembly. Composition root only: wires objects. Auth is owned by
 * the SDK AuthController (attached per-client in SocketManager, driven by bootstrapSocketConnection),
 * so there is no session controller or recovery/reconnect policy to inject here.
 *
 * The SDK's `gateSyncOnAuth` default (`true`) is kept: user-scope (requiresAuth) sync activates only
 * once the client's `auth.state === 'authenticated'` and pauses otherwise. This is now correct because
 * each client's AuthController drives that state authoritatively; the transitional `false` override
 * from the pre-SDK-auth adoption has been removed (multi-socket-design.md §2f/§10).
 */
export const createSocketRuntime = (): SocketRuntime => {
    const socketManager = new SocketManager();
    const syncManager = new SyncManager(socketManager);

    return {
        socketManager,
        syncManager,
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
    return getSocketRuntime().socketManager;
};

export const getSyncManager = (): SyncManager => {
    return getSocketRuntime().syncManager;
};
