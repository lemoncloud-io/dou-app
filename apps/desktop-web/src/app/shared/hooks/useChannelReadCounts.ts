import { useCallback, useEffect, useMemo, useState } from 'react';

import { RELAY_CLOUD_ID } from '@chatic/data';
import type { DomainChannel, DomainJoin } from '@chatic/data';
import { runtime } from '@chatic/app-runtime';

import { channelKind } from '../utils';

/** How many of the room's active members have read up to a message, and how many have not yet. */
export interface ReadCount {
    read: number;
    unread: number;
}

/**
 * Per-message read counts for the open room, off every member's join row — the same numbers the
 * mobile app prints, so a message reads the same on both.
 *
 * A member's read cursor is `max(readNo, chatNo)`: the server keeps the last-read number in
 * `chatNo`, and my own row also carries the optimistic `readNo` that `readChat` writes before the
 * server answers. A member who left (`joined === 0`) keeps a row but counts in neither number, and
 * so does a member whose row has not synced yet — the count grows as rows land, the way the mobile
 * app's does, rather than guessing at the roster. The sender's own cursor
 * moves when they send, so they count as having read their message.
 *
 * Desktop only kept MY join current (`useChannelReadCursors`), which leaves everybody else's cursor
 * stale, so while a room is open a join sync is registered for each member. The server refuses a
 * member's join to anyone outside the room, so nothing is registered until I am known to be in it,
 * and nothing before the room's own cloud is verified — `registerJoin` refcounts by key, so my own
 * join dedups with the sidebar's.
 *
 * Returns `readCountOf(chatNo)`, or null from it where the room shows no count: my notes-to-self
 * channel, a room of fewer than two members, and before any join row has arrived.
 */
export const useChannelReadCounts = (channel: DomainChannel | undefined): ((chatNo: number) => ReadCount | null) => {
    const { join: joinRepository } = runtime.data.useRuntimeRepositories();
    const channelId = channel?.id ?? null;
    const cid = channel ? channel.cid || RELAY_CLOUD_ID : '';
    const userId = runtime.session.useUidInCloud(cid);
    const isVerified = runtime.connection.useCloudVerified(cid);

    // Tagged with the room they were read for, so after a switch the last room's rows are not counted
    // against the new room's messages while its own rows are on their way.
    const [observed, setObserved] = useState<{ channelId: string | null; joins: DomainJoin[] }>({
        channelId: null,
        joins: [],
    });
    const joins = observed.channelId === channelId ? observed.joins : [];

    useEffect(() => {
        if (!channelId) return;
        // Every row, departed members included — the same query the mobile room observes; the counting
        // below drops the departed ones.
        return joinRepository.observeList({ channelId, activeOnly: false }, result =>
            setObserved({ channelId, joins: result?.list ?? [] })
        );
    }, [joinRepository, channelId]);

    const { activeMemberIds, cursorByUser } = useMemo(() => {
        const active = new Set<string>();
        const cursors = new Map<string, number>();
        for (const join of joins) {
            if (!join.userId) continue;
            if (join.joined !== 0) active.add(join.userId);
            cursors.set(join.userId, Math.max(join.readNo ?? 0, join.chatNo ?? 0));
        }
        return { activeMemberIds: [...active], cursorByUser: cursors };
    }, [joins]);

    const isMember =
        !!userId &&
        (!!channel?.memberIds?.includes(userId) || joins.some(join => join.userId === userId && join.joined !== 0));
    const memberIds = useMemo(() => {
        const ids = new Set(channel?.memberIds ?? []);
        if (userId) ids.add(userId);
        return [...ids];
    }, [channel?.memberIds, userId]);
    // Re-registers only when the roster itself changes, not on every new array.
    const memberKey = memberIds.join(',');

    useEffect(() => {
        if (!channelId || !isVerified || !isMember) return;
        const sync = runtime.sync.getSyncManager();
        const disposers = memberIds.map(memberId => sync.registerJoin(`${channelId}@${memberId}`, undefined, { cid }));
        return () => disposers.forEach(dispose => dispose());
        // userId is the uid in this cloud: a target only runs while it matches, so a change re-registers.
    }, [cid, channelId, isVerified, isMember, memberKey, userId]);

    const showsCounts = !!channel && channelKind(channel) !== 'self' && activeMemberIds.length >= 2;

    return useCallback(
        (chatNo: number): ReadCount | null => {
            if (!showsCounts) return null;
            let read = 0;
            for (const memberId of activeMemberIds) {
                if ((cursorByUser.get(memberId) ?? 0) >= chatNo) read++;
            }
            return { read, unread: activeMemberIds.length - read };
        },
        [showsCounts, activeMemberIds, cursorByUser]
    );
};
