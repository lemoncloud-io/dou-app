import { SocketManager } from './SocketManager';
import { SyncManager } from './sync/SyncManager';
import type { ISocketManager } from './types';
import type { SyncRuntimeOptions } from './sync/types';

export interface SocketRuntime {
    socketManager: ISocketManager;
    syncManager: SyncManager;
}

let socketRuntimeSingleton: SocketRuntime | null = null;

/**
 * Sync runtime tuning. `gateSyncOnAuth: false` is a TRANSITIONAL override that disables the SDK's
 * built-in auth gate (user-scope sync only after `authenticated`). It stays until the ClientSocketAuth
 * migration makes each client's `auth.state` authoritative — then remove it to restore the SDK
 * default (`true`). See multi-socket-design.md §10 (마무리 제거 대상) and §2f.
 */
const DEFAULT_SYNC_RUNTIME_OPTIONS: SyncRuntimeOptions = { gateSyncOnAuth: false };

/**
 * Creates a fresh socket runtime assembly. Composition root only: wires objects. Auth is owned by
 * the SDK AuthController (attached per-client in SocketManager, driven by bootstrapSocketConnection),
 * so there is no session controller or recovery/reconnect policy to inject here.
 */
export const createSocketRuntime = (): SocketRuntime => {
    const socketManager = new SocketManager();
    const syncManager = new SyncManager(socketManager, { runtimeOptions: DEFAULT_SYNC_RUNTIME_OPTIONS });

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
