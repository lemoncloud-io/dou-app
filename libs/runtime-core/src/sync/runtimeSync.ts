import type { SyncTargetDescriptor } from '@lemoncloud/chatic-sockets-lib';

import type { ChatRefreshResult } from '@chatic/data';
import {
    fetchRoomFeed,
    getSyncManager,
    isChannelRefused,
    listRefusedChannels,
    prefetchRoomFeed,
    refreshBackgroundClouds,
    subscribeBackgroundDeltas,
    subscribeRefusedChannels,
} from '@chatic/sync';
import type { BackgroundDelta, SyncRegisterOptions, SyncTargetListing } from '@chatic/sync';

import { primeChatRoom } from './primeChatRoom';
import type { ChatPrimeOutcome, PrimeChatRoomOptions } from './primeChatRoom';

export interface RuntimeSync {
    registerTarget(target: SyncTargetDescriptor, options?: SyncRegisterOptions): () => void;
    updateLocalSnapshot(target: SyncTargetDescriptor, snapshot: unknown, options?: SyncRegisterOptions): void;
    listTargets(): Promise<SyncTargetListing[]>;

    refreshBackgroundClouds(cid?: string): Promise<void>;
    onBackgroundDelta(listener: (delta: BackgroundDelta) => void): () => void;
    isChannelRefused(channelId: string): boolean;
    subscribeRefusedChannels(listener: () => void): () => void;
    refusedChannels(): string[];
    fetchRoomFeed(
        cid: string,
        channelId: string,
        options?: { cache?: 'hit' | 'miss'; fresh?: boolean }
    ): Promise<ChatRefreshResult>;
    prefetchRoomFeed(cid: string, channelId: string): Promise<ChatRefreshResult | null>;
    primeChatRoom(cid: string, channelId: string, options?: PrimeChatRoomOptions): Promise<ChatPrimeOutcome>;
}

export const createCoreRuntimeSync = (): RuntimeSync => ({
    registerTarget: (target, options) => getSyncManager().register(target, options ?? undefined),
    updateLocalSnapshot: (target, snapshot, options) =>
        getSyncManager().updateLocalSnapshot(target, snapshot, options ?? undefined),
    listTargets: async () => getSyncManager().listTargets(),

    refreshBackgroundClouds: async cid => refreshBackgroundClouds(cid ?? undefined),
    onBackgroundDelta: listener => subscribeBackgroundDeltas(listener),
    isChannelRefused: channelId => isChannelRefused(channelId),
    subscribeRefusedChannels: listener => subscribeRefusedChannels(listener),
    refusedChannels: () => listRefusedChannels(),
    fetchRoomFeed: (cid, channelId, options) => fetchRoomFeed(cid, channelId, options ?? undefined),
    prefetchRoomFeed: (cid, channelId) => prefetchRoomFeed(cid, channelId),
    primeChatRoom: (cid, channelId, options) => primeChatRoom(cid, channelId, options ?? undefined),
});
