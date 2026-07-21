import { useCallback, useEffect, useMemo, useState } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
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
 * upstream in useChannelMembers. It is the unread denominator (total active members).
 *
 * The room does NOT register its own join (read-state) sync — global join sync is owned by the
 * home surface (useMyJoins). This hook only OBSERVES the join cache, so read cursors reflect
 * whatever that global sync (plus channel sync) has landed.
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

    const [joins, setJoins] = useState<DomainJoin[]>([]);

    // Observe the join cache directly so read cursors stay live for every member.
    useEffect(() => {
        if (!channelId) {
            setJoins([]);
            return;
        }
        return joinRepository.observeList({ channelId }, result => setJoins(result?.list ?? []));
    }, [joinRepository, channelId]);

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
