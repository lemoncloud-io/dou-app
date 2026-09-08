import { SocketManager } from './SocketManager';

import type { ISocketManager } from './types';

/**
 * The socket engine's creation point. Composition root only: it wires one object and holds it.
 *
 * Auth is owned by the SDK AuthController (attached per-client in `SocketManager`, driven by
 * `bootstrapSocketConnection`), so there is no session controller or recovery/reconnect policy to
 * inject here.
 *
 * **Sync is NOT built here** — [`sync/runtime.ts`](./sync/runtime.ts) owns that, and the reason is an
 * import ring rather than taste (see its comment). Keeping this file free of `sync/` is what lets
 * `data/**` reach the socket without closing a cycle back through the sync plans, so an import of
 * `./sync/**` from here is a regression that `src/importCycleAbsence.test.ts` will name.
 *
 * The SDK's `gateSyncOnAuth` default (`true`) is kept: user-scope (requiresAuth) sync activates only
 * once the client's `auth.state === 'authenticated'` and pauses otherwise. This is now correct because
 * each client's AuthController drives that state authoritatively; the transitional `false` override
 * from the pre-SDK-auth adoption has been removed (multi-socket-design.md §2f/§10).
 */
let socketManagerSingleton: ISocketManager | null = null;

/**
 * Returns the singleton instance of SocketManager.
 */
export const getSocketManager = (): ISocketManager => {
    if (!socketManagerSingleton) {
        socketManagerSingleton = new SocketManager();
    }
    return socketManagerSingleton;
};
