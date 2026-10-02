import { useCallback, useEffect, useState } from 'react';

import type { SyncTargetDescriptor } from '@lemoncloud/chatic-sockets-lib';

import { RELAY_CLOUD_ID } from '@chatic/data';
import { logger } from '@chatic/bridges';
import { getActivePerfTrace } from '@chatic/perf';

import { getSyncManager } from '../runtime';
import { fetchRoomFeed } from '../roomFeed';
import { useSlotVerified } from '../../../connection/hooks/useSlotVerified';
import { useSessionSelection } from '../../../session/hooks/session/readers/useSessionSelection';
import { useUidInCloud } from '../../../session/hooks/session/readers/useUidInCloud';
import { getDataManager } from '../../../data/runtime';
import { slotKeyOf } from '../../utils/slotKey';

const buildKey = (target: SyncTargetDescriptor | null): string | null =>
    target ? `${target.type}:${target.id ?? ''}:${target.intervalMs ?? ''}` : null;

/**
 * The selected cloud, named the way a slot key and the cache scope name it. An unset or empty
 * selection is the relay — the same normalisation `deriveSelectedContext` applies.
 */
const useSelectedCid = (): string => useSessionSelection().selectedCloudId || RELAY_CLOUD_ID;

/**
 * Registers a sync target for the component lifetime and unregisters on cleanup.
 * `register` returns its own dispose fn, so the effect cleanup maps onto it directly.
 *
 * The target belongs to `cid` — the selected cloud unless the caller names one — and it re-registers
 * when that changes: a component that stays mounted across a cloud switch renders the next cloud's
 * rows, so its target has to become the next cloud's too. The new registration waits for that cloud's
 * slot; the old one leaves through the grace window like any other.
 *
 * **Why uid is a dependency even though it is not in the key.** A target is tagged with the uid it
 * was registered under and only syncs while that still matches (SyncManager.isUidActive), so an
 * account change silently retires this registration. Re-running re-registers it under the new
 * account; without the dependency the target would stay blocked for the rest of the mount, which
 * turns a 403 storm into an equally silent dead sync. It is the uid in THIS cloud, because that is
 * the one the manager compares.
 */
export const useSyncTarget = (target: SyncTargetDescriptor | null, cid?: string): void => {
    const key = buildKey(target);
    const selectedCid = useSelectedCid();
    const targetCid = cid ?? selectedCid;
    const uid = useUidInCloud(targetCid);

    useEffect(() => {
        if (!target) return;
        return getSyncManager().register(target, { cid: targetCid });
        // key captures every field we re-register on; target is read once per key.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, targetCid, uid]);
};

/** Where a room's prime stands — see {@link usePrimeChat}. */
export type ChatPrimeStatus = 'pending' | 'ready' | 'failed';

export interface ChatSyncState {
    prime: ChatPrimeStatus;
    /** Runs the prime again, after a `failed` one. */
    retryPrime: () => void;
}

/**
 * Chat plans have a no-op `run`, so registering a chat target loads nothing on its own. Prime the
 * room: align the plan baseline to the durable cache's max chatNo (its cursor) via
 * updateLocalSnapshot, then fetch a first page only when the cache is cold. The plan never
 * backfills past history, so a cold room needs this explicit first page to render anything.
 *
 * Everything here is about `cid`, the cloud the target was registered for: its slot's verification
 * gates it (so it re-runs after that slot's auth or reconnect, whichever slot is active), its runtime
 * takes the baseline, and its partition is the cache read and the page written.
 *
 * A room being opened has a `chat_room_sync` trace in progress, and a cold room's first page is
 * the sync it waits for, so the phases are marked here: slot verified, page requested, page
 * written. The room page ends the trace when that page reaches the screen. A warm room's sync is
 * `useForegroundChatRefresh`'s in the web, which marks the same phases.
 *
 * The outcome is returned, because a cold room's cache reads empty until the first page lands: a
 * screen that took that empty read at its word would show "no messages yet" over a room that has
 * them, and one whose first page failed would show it for good. `pending` lasts until the cache read
 * finds rows or the first page is written; `failed` means the read or the fetch threw, and
 * `retryPrime` runs the prime again. The status belongs to one room in one cloud, so opening another
 * starts it at `pending` again.
 */
const usePrimeChat = (channelId: string | undefined, cid: string): ChatSyncState => {
    const isVerified = useSlotVerified(slotKeyOf(cid));
    const scope = channelId ? `${cid}:${channelId}` : null;
    const [settled, setSettled] = useState<{ scope: string; status: 'ready' | 'failed' } | null>(null);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        if (!isVerified || !channelId) return;
        let cancelled = false;
        const settle = (status: 'ready' | 'failed') => {
            if (!cancelled) setSettled({ scope: `${cid}:${channelId}`, status });
        };
        getActivePerfTrace('chat_room_sync', channelId)?.mark('verified');

        void (async () => {
            const repos = getDataManager().getScopedRepositories(cid);
            const cached = await repos.chat.cacheReadList({ channelId });
            if (cancelled) return;
            const lastNo = (cached?.list ?? []).reduce((max, chat) => (chat.chatNo > max ? chat.chatNo : max), 0);

            // Tell the plan our newest chatNo so the next onConnected/push doesn't catch up from 0.
            getSyncManager().updateLocalSnapshot(
                { type: 'chat', id: channelId },
                { id: channelId, lastNo, minNo: 0, messages: [] },
                { cid }
            );

            // Cold cache: only here do we fetch — a warm room reads from cache and streams via push.
            // A fetch the tap already started for this room is joined rather than sent again.
            if (lastNo === 0) await fetchRoomFeed(cid, channelId, { cache: 'miss' });
            settle('ready');
        })().catch(error => {
            logger.warn('SOCKET', '[useChatSync] Failed to prime chat target', {
                error,
                data: { channelId, cid },
            });
            settle('failed');
        });

        return () => {
            cancelled = true;
        };
    }, [isVerified, channelId, cid, attempt]);

    const retryPrime = useCallback(() => {
        setSettled(null);
        setAttempt(n => n + 1);
    }, []);

    return { prime: settled && settled.scope === scope ? settled.status : 'pending', retryPrime };
};

// Register the chat target (live push + reconnect catch-up) and prime it (baseline + cold fetch).
// useSyncTarget's effect runs first, so startSync precedes the prime's updateLocalSnapshot.
export const useChatSync = (channelId?: string, intervalMs?: number): ChatSyncState => {
    const cid = useSelectedCid();
    useSyncTarget(channelId ? { type: 'chat', id: channelId, ...(intervalMs ? { intervalMs } : {}) } : null, cid);
    return usePrimeChat(channelId, cid);
};

export const useChannelSync = (channelId?: string, intervalMs?: number): void =>
    useSyncTarget(channelId ? { type: 'channel', id: channelId, ...(intervalMs ? { intervalMs } : {}) } : null);

export const usePlaceSync = (placeId?: string, intervalMs?: number): void =>
    useSyncTarget(placeId ? { type: 'place', id: placeId, ...(intervalMs ? { intervalMs } : {}) } : null);
