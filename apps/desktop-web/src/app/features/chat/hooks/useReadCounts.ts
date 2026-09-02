import { useCallback, useEffect, useMemo, useState } from 'react';

import { getSyncManager, useRuntimeRepositories, useRuntimeSocketState } from '@chatic/app-runtime';
import type { DomainChannel, DomainJoin } from '@chatic/data';

import { isSelfChannel, useReadCursorStore } from '../../../shared';
import {
    activeMemberIdsOf,
    countReadsAt,
    readCursorsOf,
    readStateKeyOf,
    type MessageViewer,
    type ReadCount,
} from '../utils';

/**
 * Counts for one message — its `chatNo` and its author — or null when it gets no receipt.
 */
export type ReadCountOf = (chatNo: number, senderId?: string) => ReadCount | null;

/**
 * Per-message read receipts for the open channel (`Read N · Unread M`).
 *
 * Reporting our own read position is already handled (`useReadReceipts`); this is the
 * reading side, and it needs every *other* member's cursor. The sidebar only keeps MY join
 * row current (`useChannelReadCursors`), so a join sync is registered here for the whole
 * roster while the channel is open, and the join cache observed directly. `registerJoin`
 * refcounts by key, so my own row dedups with that sidebar registration and mounting this
 * in both the feed and the thread panel costs one set of targets, not two.
 *
 * The returned callback answers null — no receipt at all — when the counts would be
 * meaningless or wrong: a self-channel, a channel with fewer than two active members, or
 * before any join row has synced (every row would claim "Read 0" and be lying).
 */
export const useReadCounts = (channel: DomainChannel | undefined, viewer: MessageViewer): ReadCountOf => {
    const { join: joinRepository } = useRuntimeRepositories();
    const { isVerified } = useRuntimeSocketState();
    const channelId = channel?.id ?? null;
    const [joins, setJoins] = useState<DomainJoin[]>([]);

    // My id inside THIS channel: the cloud id the server rewrites my messages to, falling
    // back to the account id before the channel's join has landed.
    const myId = viewer.cloudUid || viewer.uid || '';
    // The full roster, which is what the read-state sync covers — including members who
    // have left, so their cursor is still known if an old message is scrolled to. The
    // denominator is narrower (active members only) and comes off the join rows below.
    const memberIds = useMemo(() => {
        const ids = new Set(channel?.memberIds ?? []);
        if (myId) ids.add(myId);
        return [...ids];
    }, [channel?.memberIds, myId]);

    // Network-bound, so gated on isVerified (auto-retries on the false→true edge after
    // re-auth/reconnect). memberKey stands in for the member set so the effect re-runs only
    // when the roster actually changes.
    const memberKey = memberIds.join(',');
    useEffect(() => {
        if (!channelId || !isVerified || memberIds.length === 0) return;
        const sync = getSyncManager();
        const disposers = memberIds.map(userId => sync.registerJoin(`${channelId}@${userId}`));
        return () => disposers.forEach(dispose => dispose());
    }, [channelId, isVerified, memberKey]);

    useEffect(() => {
        if (!channelId) {
            setJoins([]);
            return;
        }
        return joinRepository.observeList({ channelId }, result => setJoins(result?.list ?? []));
    }, [joinRepository, channelId]);

    // My own read position, optimistically ahead of my join row: readChat is debounced and
    // the server round-trip lands later still, so without this floor my newest message reads
    // as unread by me for a beat — and in a 1:1 that is the whole unread count.
    const localCursor = useReadCursorStore(s => (channelId ? (s.cursors[channelId] ?? 0) : 0));

    // Keyed by the read state's value, not the row array's identity — see `readStateKeyOf`.
    // `joins` is deliberately absent from the deps: everything read out of it is in the key.
    const readStateKey = readStateKeyOf(joins);
    const { cursorByUser, activeMemberIds } = useMemo(() => {
        const cursors = readCursorsOf(joins);
        if (myId) cursors.set(myId, Math.max(cursors.get(myId) ?? 0, localCursor));
        return { cursorByUser: cursors, activeMemberIds: activeMemberIdsOf(joins) };
    }, [readStateKey, myId, localCursor]);

    // A receipt on a self-channel or a 1-member channel counts only me, which says nothing.
    // Two active members is also what stands in for "the join rows have arrived": they are
    // derived from those rows, so before the first one syncs there is nothing to show and
    // no row claims "Read 0" on the way in.
    const show = !!channel && !isSelfChannel(channel) && activeMemberIds.length >= 2;

    return useCallback(
        (chatNo: number, senderId?: string) =>
            show ? countReadsAt(chatNo, activeMemberIds, cursorByUser, senderId) : null,
        [show, activeMemberIds, cursorByUser]
    );
};
