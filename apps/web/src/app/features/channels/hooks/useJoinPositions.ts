import { useCallback, useEffect, useMemo } from 'react';

import { getSyncManager, useSocketState } from '@chatic/app-runtime';
import type { DomainJoin } from '@chatic/data';

interface ReadCount {
    readCount: number;
    unreadCount: number;
}

/**
 * Per-message read positions for a channel. Reads from the live join rows the caller
 * already observes (`initialJoins`, from useChannelMembers) and registers a join
 * (read-state) sync per member — keyed `${channelId}@${userId}` — so every member's
 * `readNo` stays current, not just my own (mirrors testbed ChatRoomPage's per-member
 * `registerJoin`). registerJoin refcounts by key, so it dedups with any other
 * useJoinSync registration for the same join.
 *
 * `getReadCount(chatNo)` returns how many active members have read up to `chatNo`
 * (`readNo >= chatNo`) vs. not yet. A message's own sender has necessarily read it
 * (sending auto-advances their readNo), so they never inflate the unread count.
 */
export const useJoinPositions = (channelId: string | null, initialJoins: DomainJoin[]) => {
    const { isVerified } = useSocketState();

    // Active members with a resolvable user id — the source of read cursors (readNo).
    const activeJoins = useMemo(() => initialJoins.filter(join => join.joined !== 0 && join.userId), [initialJoins]);

    // Join into a stable dependency so the registration effect only re-runs on a real
    // membership change, not on every render's new array identity.
    const memberKey = activeJoins.map(join => join.userId).join(',');

    // Register a join sync per member (gated on isVerified — runs against the current
    // session and auto-retries after re-auth).
    useEffect(() => {
        if (!channelId || !isVerified) return;
        const sync = getSyncManager();
        const disposers = activeJoins.map(join => sync.registerJoin(`${channelId}@${join.userId}`));
        return () => disposers.forEach(dispose => dispose());
        // memberKey captures the membership set; activeJoins is read once per key.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [channelId, isVerified, memberKey]);

    const isReady = activeJoins.length > 0;

    const getReadCount = useCallback(
        (chatNo: number): ReadCount => {
            const readCount = activeJoins.filter(join => (join.readNo ?? 0) >= chatNo).length;
            return { readCount, unreadCount: Math.max(0, activeJoins.length - readCount) };
        },
        [activeJoins]
    );

    return { getReadCount, isReady };
};
