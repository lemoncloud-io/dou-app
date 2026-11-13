import { useCallback, useEffect, useMemo, useState } from 'react';

import { isInJoinWindow, RELAY_CLOUD_ID } from '@chatic/data';
import type { DomainChannel, DomainJoin } from '@chatic/data';
import { runtime } from '@chatic/app-runtime';

import { channelKind } from '../utils';

/** Which of the members a message is meant for have read up to it, and which have not yet, in roster order. */
export interface ReadCount {
    readIds: string[];
    unreadIds: string[];
}

/** One member's read position: the highest message number they have reached. */
export interface MemberReadCursor {
    userId: string;
    cursor: number;
    /**
     * The room's latest number when they joined, if the row has one. Joining also writes that number
     * into the cursor, so without it a late joiner reads as having reached everything before them.
     */
    joinedNo?: number;
}

export interface ChannelReadCounts {
    /** Who has and has not read one message, its author left out; null where the room shows no count. */
    readCountOf: (chatNo: number, authorId: string) => ReadCount | null;
    /**
     * Where every other active member has read up to — me left out — in roster order. Empty wherever
     * `readCountOf` shows nothing, and until my own id is known, so I cannot appear as someone else.
     */
    cursors: MemberReadCursor[];
}

/**
 * Who has read each message of the open room, worked out from every member's join row rather than
 * asked of the server: the rows are already observed here, and a list built from them moves the
 * moment a member's cursor does.
 *
 * A message is meant for every member who is still in the room (`joined !== 0`), joined it before
 * the message (`joinedNo < chatNo`), and did not write it. Of those, a member whose read cursor has
 * reached the message has read it; the rest have not. The `joinedNo` test matters because joining
 * writes the latest number into `chatNo` as well — without it everything before a member's arrival
 * would read as seen by them. A row with no `joinedNo` is taken as having been there all along.
 *
 * A member's read cursor is `max(readNo, chatNo)`: the server keeps the last-read number in
 * `chatNo`, and my own row also carries the optimistic `readNo` that `readChat` writes before the
 * server answers. A member whose row has not synced yet is on neither side — the lists grow as rows
 * land rather than guessing at the roster.
 *
 * Desktop only kept MY join current (`useChannelReadCursors`), which leaves everybody else's cursor
 * stale, so while a room is open a join sync is registered for each member. The server refuses a
 * member's join to anyone outside the room, so nothing is registered until I am known to be in it,
 * and nothing before the room's own cloud is verified — a sync target is refcounted by key, so my own
 * join dedups with the sidebar's.
 *
 * Returns `readCountOf(chatNo, authorId)`, or null from it where the room shows no count: my
 * notes-to-self channel, a room of fewer than two members, before any join row has arrived, and a
 * message no other member was there for. Alongside it, `cursors` gives each other member's read
 * position, which is what places their face on the message they last read.
 */
export const useChannelReadCounts = (channel: DomainChannel | undefined): ChannelReadCounts => {
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

    // One entry per member still in the room; a departed member's row stays but counts nowhere.
    const activeMembers = useMemo(() => {
        const byUser = new Map<string, { userId: string; cursor: number; joinedNo?: number }>();
        for (const join of joins) {
            if (!join.userId || join.joined === 0) continue;
            byUser.set(join.userId, {
                userId: join.userId,
                cursor: Math.max(join.readNo ?? 0, join.chatNo ?? 0),
                joinedNo: join.joinedNo,
            });
        }
        return [...byUser.values()];
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
        const disposers = memberIds.map(memberId =>
            runtime.sync.registerSyncTarget({ type: 'join', id: `${channelId}@${memberId}` }, { cid })
        );
        return () => disposers.forEach(dispose => dispose());
        // userId is the uid in this cloud: a target only runs while it matches, so a change re-registers.
    }, [cid, channelId, isVerified, isMember, memberKey, userId]);

    const showsCounts = !!channel && channelKind(channel) !== 'self' && activeMembers.length >= 2;

    const readCountOf = useCallback(
        (chatNo: number, authorId: string): ReadCount | null => {
            if (!showsCounts) return null;
            const readIds: string[] = [];
            const unreadIds: string[] = [];
            for (const member of activeMembers) {
                if (member.userId === authorId || !isInJoinWindow({ chatNo }, member.joinedNo)) continue;
                (member.cursor >= chatNo ? readIds : unreadIds).push(member.userId);
            }
            // Nobody the message was meant for (everyone else joined after it): no count, not "Seen 0".
            return readIds.length + unreadIds.length > 0 ? { readIds, unreadIds } : null;
        },
        [showsCounts, activeMembers]
    );

    const cursors = useMemo(
        () =>
            showsCounts && userId
                ? activeMembers
                      .filter(member => member.userId !== userId)
                      .map(({ userId: memberId, cursor, joinedNo }) => ({ userId: memberId, cursor, joinedNo }))
                : [],
        [showsCounts, activeMembers, userId]
    );

    return useMemo(() => ({ readCountOf, cursors }), [readCountOf, cursors]);
};
