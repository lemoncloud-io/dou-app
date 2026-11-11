import { useCallback, useEffect, useState } from 'react';

import type { SyncTargetDescriptor } from '@lemoncloud/chatic-sockets-lib';

import { RELAY_CLOUD_ID } from '@chatic/data';

import { getSyncManager } from '@chatic/sync';
import { useSlotVerified } from '../../../connection/hooks/useSlotVerified';
import { useSessionSelection } from '../../../session/hooks/session/readers/useSessionSelection';
import { useUidInCloud } from '../../../session/hooks/session/readers/useUidInCloud';
import { runtimeEngine } from '../../../init';
import { slotKeyOf } from '@chatic/transport';

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
 * Primes the room for its first render — the engine's `primeChatRoom`, which aligns the chat plan's
 * baseline to the cache and fetches a first page only when the cache is cold. This hook decides when:
 * once `cid`'s slot is verified, and again after that slot's auth or reconnect, whichever slot is
 * active. A warm room's sync is `useForegroundChatRefresh`'s in the web, which marks the same trace
 * phases.
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
        void runtimeEngine()
            .primeChatRoom(cid, channelId, { cancelled: () => cancelled })
            .then(outcome => {
                if (!cancelled && outcome !== 'cancelled') {
                    setSettled({ scope: `${cid}:${channelId}`, status: outcome });
                }
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
