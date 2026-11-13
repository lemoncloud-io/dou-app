import type { SyncTargetDescriptor } from '@lemoncloud/chatic-sockets-lib';

import { getSyncManager } from '@chatic/sync';
import type { SyncRegisterOptions, SyncTargetListing } from '@chatic/sync';

/**
 * What the React surface asks of the sync engine — never the sync manager itself. On the phone the
 * engine may live in another process, so a target and a snapshot are plain data, and a registration is
 * a standing request the runtime keeps until it is dropped.
 */
export interface RuntimeSync {
    /**
     * Keeps `target` in sync until the returned function drops it. The target belongs to `options.cid`,
     * or to the cloud the session has selected now when none is named — name it whenever it is known.
     */
    registerTarget(target: SyncTargetDescriptor, options?: SyncRegisterOptions): () => void;
    /**
     * Tells the sync engine the baseline the page's cache already holds for `target`, so the next pass
     * asks only for what is newer (chat `{ lastNo }`, others `{ updatedAt }` or `{ tick }`).
     */
    updateLocalSnapshot(target: SyncTargetDescriptor, snapshot: unknown, options?: SyncRegisterOptions): void;
    /** Every registered target, with its cloud — for a debug surface. */
    listTargets(): Promise<SyncTargetListing[]>;
}

/** The core runtime's sync: this process's sync manager. */
export const createCoreRuntimeSync = (): RuntimeSync => ({
    registerTarget: (target, options) => getSyncManager().register(target, options ?? undefined),
    updateLocalSnapshot: (target, snapshot, options) =>
        getSyncManager().updateLocalSnapshot(target, snapshot, options ?? undefined),
    listTargets: async () => getSyncManager().listTargets(),
});
