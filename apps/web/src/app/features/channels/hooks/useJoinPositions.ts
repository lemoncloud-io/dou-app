import { useCallback, useEffect, useMemo, useState } from 'react';

import { getSyncManager, useRuntimeRepositories, useSocketState } from '@chatic/app-runtime';
import type { DomainJoin } from '@chatic/data';

interface ReadCount {
    readCount: number;
    unreadCount: number;
}

/**
 * Per-message read positions for a channel. Kept entirely in this hook so the shared
 * data/cache layers stay untouched.
 *
 * `activeMemberIds` is the active-membership set (join rows with `joined !== 0`), derived
 * upstream in useChannelMembers. It drives both the per-member join sync registration and
 * the unread denominator — keeping the two consistent so unread converges to 0.
 *
 * Registers a join (read-state) sync per active member — keyed `${channelId}@${userId}` —
 * so each active member's read cursor stays current (mirrors testbed ChatRoomPage's
 * per-member `registerJoin`). registerJoin refcounts by key, so it dedups with any other
 * join registration for the same id. Read counts come from observing the join cache directly.
 *
 * Read cursor: the API join model stores the last-read number in `chatNo`, with our own
 * join also carrying an explicit `readNo` from readChat's optimistic patch, so a member's
 * position is `max(readNo, chatNo)` — taken directly from the latest observed join row
 * (testbed's approach; no high-water mark).
 *
 * `getReadCount(chatNo)` returns how many active members have read up to `chatNo` vs. not
 * yet; a member whose join row hasn't synced yet counts as unread until it lands. A
 * message's own sender has necessarily read it (sending auto-advances their cursor), so
 * they never inflate the unread count.
 */
export const useJoinPositions = (channelId: string | null, activeMemberIds: string[]) => {
    const { join: joinRepository } = useRuntimeRepositories();
    const { isVerified } = useSocketState();

    const [joins, setJoins] = useState<DomainJoin[]>([]);

    // Observe the join cache directly so read cursors stay live for every member.
    useEffect(() => {
        if (!channelId) {
            setJoins([]);
            return;
        }
        return joinRepository.observeList({ channelId }, result => setJoins(result?.list ?? []));
    }, [joinRepository, channelId]);

    // Join into a stable dependency so the registration effect only re-runs on a real
    // membership change, not on every render's new array identity.
    const memberKey = activeMemberIds.join(',');

    // Register a join sync for every active member (gated on isVerified — runs against the
    // current session and auto-retries after re-auth).
    useEffect(() => {
        if (!channelId || !isVerified) return;
        const sync = getSyncManager();
        const disposers = activeMemberIds.map(userId => sync.registerJoin(`${channelId}@${userId}`));
        return () => disposers.forEach(dispose => dispose());
        // memberKey captures the membership set; activeMemberIds is read once per key.
    }, [channelId, isVerified, memberKey]);

    // Per-user read cursor straight from the latest observed join rows: max(readNo, chatNo).
    const cursorByUser = useMemo(() => {
        const map = new Map<string, number>();
        for (const join of joins) {
            if (!join.userId) continue;
            map.set(join.userId, Math.max(join.readNo ?? 0, join.chatNo ?? 0));
        }
        return map;
    }, [joins]);

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
