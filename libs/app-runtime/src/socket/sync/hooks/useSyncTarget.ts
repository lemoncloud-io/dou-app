import { useEffect } from 'react';

import type { SyncTargetDescriptor } from '@lemoncloud/chatic-sockets-lib';

import { logger } from '@chatic/bridges';

import { getSyncManager } from '../../runtime';
import { useRuntimeSocketState } from '../../../runtime/useRuntimeSocketState';
import { getRepositories } from '../../../data/runtime';

const buildKey = (target: SyncTargetDescriptor | null): string | null =>
    target ? `${target.type}:${target.id ?? ''}:${target.intervalMs ?? ''}` : null;

/**
 * Registers a sync target for the component lifetime and unregisters on cleanup.
 * `register` returns its own dispose fn, so the effect cleanup maps onto it directly.
 * Re-runs only when the target key changes (type/id/interval).
 */
export const useSyncTarget = (target: SyncTargetDescriptor | null): void => {
    const key = buildKey(target);

    useEffect(() => {
        if (!target) return;
        return getSyncManager().register(target);
        // key captures every field we re-register on; target is read once per key.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
};

/**
 * Chat plans have a no-op `run`, so registering a chat target loads nothing on its own. Prime the
 * room: align the plan baseline to the durable cache's max chatNo (its cursor) via
 * updateLocalSnapshot, then fetch a first page only when the cache is cold. The plan never
 * backfills past history, so a cold room needs this explicit first page to render anything.
 *
 * Gated on isVerified so it (re)runs after auth/reconnect — this replaces the SyncManager replay
 * path that used to re-prime on a client swap.
 */
const usePrimeChat = (channelId?: string): void => {
    const { isVerified } = useRuntimeSocketState();

    useEffect(() => {
        if (!isVerified || !channelId) return;
        let cancelled = false;

        void (async () => {
            const repos = getRepositories();
            const cached = await repos.chat.cacheReadList({ channelId });
            if (cancelled) return;
            const lastNo = (cached?.list ?? []).reduce((max, chat) => (chat.chatNo > max ? chat.chatNo : max), 0);

            // Tell the plan our newest chatNo so the next onConnected/push doesn't catch up from 0.
            getSyncManager().updateLocalSnapshot(
                { type: 'chat', id: channelId },
                { id: channelId, lastNo, minNo: 0, messages: [] }
            );

            // Cold cache: only here do we fetch — a warm room reads from cache and streams via push.
            if (lastNo === 0) {
                await repos.chat.refreshList({ channelId });
            }
        })().catch(error => {
            logger.warn('SOCKET', '[useChatSync] Failed to prime chat target', {
                error,
                data: { channelId },
            });
        });

        return () => {
            cancelled = true;
        };
    }, [isVerified, channelId]);
};

// Register the chat target (live push + reconnect catch-up) and prime it (baseline + cold fetch).
// useSyncTarget's effect runs first, so startSync precedes the prime's updateLocalSnapshot.
export const useChatSync = (channelId?: string, intervalMs?: number): void => {
    useSyncTarget(channelId ? { type: 'chat', id: channelId, ...(intervalMs ? { intervalMs } : {}) } : null);
    usePrimeChat(channelId);
};

export const useChannelSync = (channelId?: string, intervalMs?: number): void =>
    useSyncTarget(channelId ? { type: 'channel', id: channelId, ...(intervalMs ? { intervalMs } : {}) } : null);

export const usePlaceSync = (placeId?: string, intervalMs?: number): void =>
    useSyncTarget(placeId ? { type: 'place', id: placeId, ...(intervalMs ? { intervalMs } : {}) } : null);

export const useProfileSync = (profileId?: string, intervalMs?: number): void =>
    useSyncTarget(profileId ? { type: 'profile', id: profileId, ...(intervalMs ? { intervalMs } : {}) } : null);
