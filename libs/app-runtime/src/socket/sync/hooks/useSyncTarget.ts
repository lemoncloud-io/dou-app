import { useEffect, useSyncExternalStore } from 'react';

import type { SyncTargetDescriptor } from '@lemoncloud/chatic-sockets-lib';

import { RELAY_CLOUD_ID } from '@chatic/data';
import { logger } from '@chatic/bridges';
import { endActivePerfTrace, getActivePerfTrace } from '@chatic/perf';

import { getSyncManager } from '../runtime';
import { useSlotVerified } from '../../../connection/hooks/useSlotVerified';
import { useSessionSelection } from '../../../session/hooks/session/readers/useSessionSelection';
import { getUidInCloud, subscribeSessionSignal } from '../../../session/store';
import { getDataManager } from '../../../data/runtime';
import { slotKeyOf } from '../../utils/slotKey';

const buildKey = (target: SyncTargetDescriptor | null): string | null =>
    target ? `${target.type}:${target.id ?? ''}:${target.intervalMs ?? ''}` : null;

/**
 * The selected cloud, named the way a slot key and the cache scope name it. An unset or empty
 * selection is the relay — the same normalisation `deriveSelectedContext` applies.
 */
const useSelectedCid = (): string => useSessionSelection().selectedCloudId || RELAY_CLOUD_ID;

/** The uid this account has in `cid`, re-read on every session change. */
const useUidInCloud = (cid: string): string | null =>
    useSyncExternalStore(subscribeSessionSignal, () => getUidInCloud(cid));

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
 */
const usePrimeChat = (channelId: string | undefined, cid: string): void => {
    const isVerified = useSlotVerified(slotKeyOf(cid));

    useEffect(() => {
        if (!isVerified || !channelId) return;
        let cancelled = false;
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
            if (lastNo === 0) {
                // The first fetch for a trace owns it; a later one (a re-verification) would only
                // overwrite what describes the fetch the room actually waited on.
                const active = getActivePerfTrace('chat_room_sync', channelId);
                const trace = active && !active.hasMetric('feed_sent') ? active : undefined;
                trace?.putAttribute('cache', 'miss');
                trace?.mark('feed_sent');
                const result = await repos.chat.refreshList({ channelId });
                trace?.putMetric('fetched', result.fetchedCount);
                trace?.putMetric('latest_no', result.latestNo);
                trace?.mark('feed_done');
                // Nothing written means no list re-emission for the page to wait on: the room is as
                // synced as it will get, so the trace ends here.
                if (trace && result.fetchedCount === 0) endActivePerfTrace('chat_room_sync', channelId, 'synced');
            }
        })().catch(error => {
            endActivePerfTrace('chat_room_sync', channelId, 'error');
            logger.warn('SOCKET', '[useChatSync] Failed to prime chat target', {
                error,
                data: { channelId, cid },
            });
        });

        return () => {
            cancelled = true;
        };
    }, [isVerified, channelId, cid]);
};

// Register the chat target (live push + reconnect catch-up) and prime it (baseline + cold fetch).
// useSyncTarget's effect runs first, so startSync precedes the prime's updateLocalSnapshot.
export const useChatSync = (channelId?: string, intervalMs?: number): void => {
    const cid = useSelectedCid();
    useSyncTarget(channelId ? { type: 'chat', id: channelId, ...(intervalMs ? { intervalMs } : {}) } : null, cid);
    usePrimeChat(channelId, cid);
};

export const useChannelSync = (channelId?: string, intervalMs?: number): void =>
    useSyncTarget(channelId ? { type: 'channel', id: channelId, ...(intervalMs ? { intervalMs } : {}) } : null);

export const usePlaceSync = (placeId?: string, intervalMs?: number): void =>
    useSyncTarget(placeId ? { type: 'place', id: placeId, ...(intervalMs ? { intervalMs } : {}) } : null);
