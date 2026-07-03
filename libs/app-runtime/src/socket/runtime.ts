import { SocketManager } from './SocketManager';
import { SocketSessionController } from './SocketSessionController';
import { SyncManager } from './sync/SyncManager';
import type { ISocketManager } from './types';
import type { SyncRuntimeOptions } from './sync/types';

export interface SocketRuntime {
    socketManager: ISocketManager;
    sessionController: SocketSessionController;
    syncManager: SyncManager;
}

let socketRuntimeSingleton: SocketRuntime | null = null;

/**
 * Default createDeviceRuntime tuning. Empty for now so the engine keeps its own
 * defaults (behavior-preserving). The injection point exists so external config
 * (connectionDraft-style) can override these later without touching SyncManager.
 */
const DEFAULT_SYNC_RUNTIME_OPTIONS: SyncRuntimeOptions = { gateSyncOnAuth: false };

/**
 * Creates a fresh socket runtime assembly. Composition root only: wires objects and
 * injects cross-cutting policy (401 recovery, sync runtime options); holds no logic.
 */
export const createSocketRuntime = (): SocketRuntime => {
    const socketManager = new SocketManager();
    const sessionController = new SocketSessionController(socketManager);
    // The request facade lives in SocketManager but the recovery policy lives in the
    // session controller — wire them here to avoid a hard manager→controller dependency.
    socketManager.setRecoveryHandler(() => sessionController.handle401Recovery());
    const syncManager = new SyncManager(socketManager, { runtimeOptions: DEFAULT_SYNC_RUNTIME_OPTIONS });

    return {
        socketManager,
        sessionController,
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
