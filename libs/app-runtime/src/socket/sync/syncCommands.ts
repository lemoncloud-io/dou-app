import type { SyncTargetDescriptor } from '@lemoncloud/chatic-sockets-lib';

import type { RuntimeSync } from '@chatic/runtime-core';
import type { SyncRegisterOptions, SyncTargetListing } from '@chatic/sync';

import { runtimeEngine } from '../../init';

// The sync engine as the app drives it, through the engine it was handed — never the sync manager,
// which on the phone may live in another process.

/** The engine's sync — for the hooks of this package. */
export const runtimeSync = (): RuntimeSync => runtimeEngine().sync;

/**
 * Keeps `target` in sync until the returned function drops it. Name the cloud (`{ cid }`) whenever it
 * is known, so the target cannot land on whichever cloud is selected when the effect happens to run.
 */
export const registerSyncTarget = (target: SyncTargetDescriptor, options?: SyncRegisterOptions): (() => void) =>
    runtimeSync().registerTarget(target, options);

/** Tells the sync engine the baseline the cache already holds for `target`. */
export const updateSyncSnapshot = (
    target: SyncTargetDescriptor,
    snapshot: unknown,
    options?: SyncRegisterOptions
): void => runtimeSync().updateLocalSnapshot(target, snapshot, options);

/** Every registered target, with its cloud — for a debug surface. */
export const listSyncTargets = (): Promise<SyncTargetListing[]> => runtimeSync().listTargets();
