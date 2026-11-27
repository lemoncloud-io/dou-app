import type { SyncTargetDescriptor } from '@lemoncloud/chatic-sockets-lib';

import type { ChatRefreshResult } from '@chatic/data';
import { logger } from '@chatic/logger';
import type { ChatPrimeOutcome, PrimeChatRoomOptions, RuntimeSync } from '../../engine';
import type { BackgroundDelta, SyncRegisterOptions, SyncTargetListing } from '@chatic/sync';

import { runtimeEngine } from '../init';

export const runtimeSync = (): RuntimeSync => runtimeEngine().sync;

export const registerSyncTarget = (target: SyncTargetDescriptor, options?: SyncRegisterOptions): (() => void) =>
    runtimeSync().registerTarget(target, options);

export const updateSyncSnapshot = (
    target: SyncTargetDescriptor,
    snapshot: unknown,
    options?: SyncRegisterOptions
): void => runtimeSync().updateLocalSnapshot(target, snapshot, options);

export const listSyncTargets = (): Promise<SyncTargetListing[]> => runtimeSync().listTargets();

export const refreshBackgroundClouds = (cid?: string): void => {
    runtimeSync()
        .refreshBackgroundClouds(cid)
        .catch(error => logger.warn('SYNC', '[syncCommands] refreshBackgroundClouds failed', { error }));
};

export const subscribeBackgroundDeltas = (listener: (delta: BackgroundDelta) => void): (() => void) =>
    runtimeSync().onBackgroundDelta(listener);

export const isChannelRefused = (channelId: string): boolean => runtimeSync().isChannelRefused(channelId);

export const subscribeRefusedChannels = (listener: () => void): (() => void) =>
    runtimeSync().subscribeRefusedChannels(listener);

export const fetchRoomFeed = (
    cid: string,
    channelId: string,
    options?: { cache?: 'hit' | 'miss'; fresh?: boolean }
): Promise<ChatRefreshResult> => runtimeSync().fetchRoomFeed(cid, channelId, options);

export const prefetchRoomFeed = (cid: string, channelId: string): Promise<ChatRefreshResult | null> =>
    runtimeSync().prefetchRoomFeed(cid, channelId);

export const primeChatRoom = (
    cid: string,
    channelId: string,
    options?: PrimeChatRoomOptions
): Promise<ChatPrimeOutcome> => runtimeSync().primeChatRoom(cid, channelId, options);

export const syncTargetKey = (target: SyncTargetDescriptor | null): string | null =>
    target ? `${target.type}:${target.id ?? ''}:${target.intervalMs ?? ''}` : null;
