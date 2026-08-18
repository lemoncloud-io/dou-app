import { useCallback, useEffect } from 'react';

import { getSyncManager, useRuntimeSocketState } from '@chatic/app-runtime';

interface ReadCount {
    readCount: number;
    unreadCount: number;
}

/**
 * Per-message read positions for a channel. Kept entirely in this hook so the shared
 * data/cache layers stay untouched.
 *
 * `activeMemberIds` is the active-membership set (join rows with `joined !== 0`), derived
 * upstream in {@link useChannelJoins}. It is the unread denominator (total active members).
 *
 * `memberIds` is the FULL channel roster (channel.memberIds + me). The room registers a join
 * (read-state) sync for EVERY member off this set so all participants' read cursors stay live
 * while the room is mounted — the home surface (useJoinSyncRegistration) only keeps MY join
 * current, which
 * leaves other members' cursors stale for read receipts. `registerJoin` refcounts by key, so
 * re-registering my own join here dedups with the home registration (no double polling).
 *
 * `cursorByUser` (userId → `max(readNo, chatNo)`) comes from {@link useChannelJoins}, the screen's
 * single join observer — this hook no longer observes the join cache itself. What stays here is the
 * registration above plus the counting below, which is the part nothing else wants.
 *
 * `getReadCount(chatNo)` returns how many active members have read up to `chatNo` vs. not
 * yet; a member whose join row hasn't synced yet counts as unread until it lands. A
 * message's own sender has necessarily read it (sending auto-advances their cursor), so
 * they never inflate the unread count.
 */
export const useJoinPositions = (
    channelId: string | null,
    activeMemberIds: string[],
    memberIds: string[],
    cursorByUser: Map<string, number>
) => {
    const { isVerified } = useRuntimeSocketState();

    // Register a join (read-state) sync for every channel member so all read cursors stay live
    // while the room is mounted. Network-bound, so gated on isVerified (auto-retries on the
    // false→true edge after re-auth/reconnect). memberKey represents the member set so the
    // effect only re-runs when the roster actually changes (memberIds read once per key).
    const memberKey = memberIds.join(',');
    useEffect(() => {
        if (!channelId || !isVerified || memberIds.length === 0) return;
        const sync = getSyncManager();
        const disposers = memberIds.map(userId => sync.registerJoin(`${channelId}@${userId}`));
        return () => disposers.forEach(dispose => dispose());
    }, [channelId, isVerified, memberKey]);

    const memberCount = activeMemberIds.length;
    const isReady = memberCount > 0 && cursorByUser.size > 0;

    const getReadCount = useCallback(
        (chatNo: number): ReadCount => {
            let readCount = 0;
            for (const userId of activeMemberIds) {
                if ((cursorByUser.get(userId) ?? 0) >= chatNo) readCount++;
            }
            return { readCount, unreadCount: Math.max(0, memberCount - readCount) };
        },
        [activeMemberIds, cursorByUser, memberCount]
    );

    return { getReadCount, isReady };
};
