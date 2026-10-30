import { getSocketManager } from '@chatic/transport';
import { BackgroundReceiver } from './BackgroundReceiver';
import { SyncManager } from './SyncManager';

import type { ISyncManager } from './types';

/**
 * The sync engine's creation point — its own file, not the transport's `socket/runtime.ts`.
 *
 * **Why it is separate.** The socket runtime once built both managers in one assembly, so the socket
 * imported sync; sync's plans imported the data runtime to write frames; and data bound its sources
 * to the socket. Those edges closed a ring: socket runtime → `SyncManager` → `plans` → data runtime →
 * `DataManager` → `socketFactory` → socket runtime. Two things keep it open now: the socket manager
 * is `@chatic/transport`, a package below this one, and `plans` reads the graph through
 * `syncDataGraph`, which app-runtime hands down at boot. app-runtime's data layer does import this
 * package, which is the direction the package graph allows.
 *
 * Each engine owns ONE creation point (app-runtime README, design principle 2), and this is
 * `SyncManager`'s.
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
 * socket wake kick: timers froze while the app was suspended and pushes may have been missed. Given
 * `cid`, asks that one cloud only — for a push that named it, since its socket is not sent the
 * message itself. A no-op while no receiver is running, and for a cloud that is on screen or whose
 * socket is not verified: the first has the app's own sync, and the second asks on its own the
 * moment it verifies.
 */
export const refreshBackgroundClouds = (cid?: string): void => {
    backgroundReceiver?.receiveNow(cid);
};
