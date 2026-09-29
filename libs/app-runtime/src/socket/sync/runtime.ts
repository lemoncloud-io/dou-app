import { getSocketManager } from '../runtime';
import { BackgroundReceiver } from './BackgroundReceiver';
import { SyncManager } from './SyncManager';

import type { ISyncManager } from './types';

/**
 * The sync engine's creation point — its own file, not `socket/runtime.ts`'s.
 *
 * **Why it moved out.** `socket/runtime.ts` used to build both managers in one `SocketRuntime`
 * assembly, which made `socket/` import `socket/sync/`, and sync writes frames into repositories
 * (`plans` → `data/runtime`) while data binds its sources to the socket (`socketFactory` →
 * `socket/runtime`). Those four edges closed a ring across both engines:
 * `socket/runtime` → `SyncManager` → `plans` → `data/runtime` → `DataManager` → `socketFactory` →
 * `socket/runtime`. Splitting the two creation points removes the `socket → socket/sync` edge and
 * the ring opens — nothing in `data/**` reaches sync, and `socket/runtime` is now a leaf for it.
 *
 * It also states what the architecture doc already claims: `SocketManager` and `SyncManager` are two
 * of the four engine axes, and each axis owns ONE creation point (design principle 2). One file
 * building two axes was the odd one out.
 *
 * **Creation order still matters, and is no longer accidental.** A `SyncManager` attaches a device
 * runtime per bound slot, and that runtime owns the slot's connect-driven `device.save` — so it must
 * exist before slots bind. It used to get there by luck: whoever touched a repository first built the
 * `DataManager`, which built the socket runtime, which built this. `SocketBinder` now names the
 * requirement in the one place that binds slots.
 */
let syncManagerSingleton: ISyncManager | null = null;

export const getSyncManager = (): ISyncManager => {
    if (!syncManagerSingleton) {
        syncManagerSingleton = new SyncManager(getSocketManager());
    }
    return syncManagerSingleton;
};

let backgroundReceiver: BackgroundReceiver | null = null;

/**
 * Starts receiving for every bound slot that is not the active one, and returns the stop. Owned by the
 * connection host, which starts it once its slots are its own to bind — not lazily on first use like
 * the managers above, because a receiver runs timers and nothing else would ever stop them.
 *
 * Starting again replaces the running receiver, so a remount (StrictMode's double effect among them)
 * never leaves two polling the same clouds.
 */
export const startBackgroundReceive = (): (() => void) => {
    backgroundReceiver?.destroy();
    const receiver = new BackgroundReceiver(getSocketManager());
    backgroundReceiver = receiver;
    return () => {
        receiver.destroy();
        if (backgroundReceiver === receiver) backgroundReceiver = null;
    };
};

/**
 * Asks every background cloud for its delta now. Apps call it on their foreground signal, beside the
 * socket wake kick: timers froze while the app was suspended and pushes may have been missed. A no-op
 * while no receiver is running.
 */
export const refreshBackgroundClouds = (): void => {
    backgroundReceiver?.receiveNow();
};
