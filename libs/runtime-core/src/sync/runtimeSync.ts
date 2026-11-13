import type { SyncTargetDescriptor } from '@lemoncloud/chatic-sockets-lib';

import type { ChatRefreshResult } from '@chatic/data';
import {
    fetchRoomFeed,
    getSyncManager,
    isChannelRefused,
    prefetchRoomFeed,
    refreshBackgroundClouds,
    subscribeBackgroundDeltas,
    subscribeRefusedChannels,
} from '@chatic/sync';
import type { BackgroundDelta, SyncRegisterOptions, SyncTargetListing } from '@chatic/sync';

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

    /** Asks the background clouds — or one of them — for what changed, now: a foreground kick. */
    refreshBackgroundClouds(cid?: string): Promise<void>;
    /** Hears each background cloud's delta as it lands. */
    onBackgroundDelta(listener: (delta: BackgroundDelta) => void): () => void;
    /** Whether the server has refused to sync this room in this session. */
    isChannelRefused(channelId: string): boolean;
    /** Hears every change to the refused rooms; the listener reads again. */
    subscribeRefusedChannels(listener: () => void): () => void;
    /**
     * A room's latest page, fetched once per entry: a caller that finds one in flight, or one that
     * just finished, gets that one. `fresh` sends a new request regardless.
     */
    fetchRoomFeed(
        cid: string,
        channelId: string,
        options?: { cache?: 'hit' | 'miss'; fresh?: boolean }
    ): Promise<ChatRefreshResult>;
    /** Starts a room's fetch at the tap that opens it. Never rejects. */
    prefetchRoomFeed(cid: string, channelId: string): Promise<void>;
}

/** The core runtime's sync: this process's sync manager. */
export const createCoreRuntimeSync = (): RuntimeSync => ({
    registerTarget: (target, options) => getSyncManager().register(target, options ?? undefined),
    updateLocalSnapshot: (target, snapshot, options) =>
        getSyncManager().updateLocalSnapshot(target, snapshot, options ?? undefined),
    listTargets: async () => getSyncManager().listTargets(),

    refreshBackgroundClouds: async cid => refreshBackgroundClouds(cid ?? undefined),
    onBackgroundDelta: listener => subscribeBackgroundDeltas(listener),
    isChannelRefused: channelId => isChannelRefused(channelId),
    subscribeRefusedChannels: listener => subscribeRefusedChannels(listener),
    fetchRoomFeed: (cid, channelId, options) => fetchRoomFeed(cid, channelId, options ?? undefined),
    prefetchRoomFeed: (cid, channelId) => prefetchRoomFeed(cid, channelId),
});
