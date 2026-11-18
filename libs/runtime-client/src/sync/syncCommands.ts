import type { SyncTargetDescriptor } from '@lemoncloud/chatic-sockets-lib';

import type { ChatRefreshResult } from '@chatic/data';
import { logger } from '@chatic/logger';
import type { ChatPrimeOutcome, PrimeChatRoomOptions, RuntimeSync } from '@chatic/runtime-core';
import type { BackgroundDelta, SyncRegisterOptions, SyncTargetListing } from '@chatic/sync';

import { runtimeEngine } from '../init';

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

/** Asks the background clouds — or one of them — for what changed, now: the foreground kick. */
export const refreshBackgroundClouds = (cid?: string): void => {
    runtimeSync()
        .refreshBackgroundClouds(cid)
        .catch(error => logger.warn('SYNC', '[syncCommands] refreshBackgroundClouds failed', { error }));
};

/** Hears each background cloud's delta as it lands. */
export const subscribeBackgroundDeltas = (listener: (delta: BackgroundDelta) => void): (() => void) =>
    runtimeSync().onBackgroundDelta(listener);

/** Whether the server has refused to sync this room in this session. */
export const isChannelRefused = (channelId: string): boolean => runtimeSync().isChannelRefused(channelId);

/** Hears every change to the refused rooms; the listener reads again. */
export const subscribeRefusedChannels = (listener: () => void): (() => void) =>
    runtimeSync().subscribeRefusedChannels(listener);

/** A room's latest page, fetched once per entry; `fresh` sends a new request regardless. */
export const fetchRoomFeed = (
    cid: string,
    channelId: string,
    options?: { cache?: 'hit' | 'miss'; fresh?: boolean }
): Promise<ChatRefreshResult> => runtimeSync().fetchRoomFeed(cid, channelId, options);

/** Starts a room's fetch at the tap that opens it. Never rejects. */
export const prefetchRoomFeed = (cid: string, channelId: string): Promise<ChatRefreshResult | null> =>
    runtimeSync().prefetchRoomFeed(cid, channelId);

/**
 * Primes a room for its first render: aligns the chat plan's baseline to the cache and fetches a
 * first page only when the cache is cold. When — once the room's slot is verified, and again after it
 * re-authenticates — is the caller's.
 */
export const primeChatRoom = (
    cid: string,
    channelId: string,
    options?: PrimeChatRoomOptions
): Promise<ChatPrimeOutcome> => runtimeSync().primeChatRoom(cid, channelId, options);

/**
 * The identity of a sync target as a registration keys it: a target whose type, id and interval are
 * unchanged is the same registration, whichever object describes it. `null` is no target.
 */
export const syncTargetKey = (target: SyncTargetDescriptor | null): string | null =>
    target ? `${target.type}:${target.id ?? ''}:${target.intervalMs ?? ''}` : null;
