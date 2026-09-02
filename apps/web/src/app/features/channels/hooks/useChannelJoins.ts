import { useEffect, useMemo, useState } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useSessionIdentity } from '@chatic/app-runtime';
import type { DomainJoin } from '@chatic/data';

export interface ChannelJoins {
    /** Every join row cached for this channel, departures included (`activeOnly: false`). */
    joins: DomainJoin[];
    /** My row, or null while nothing has synced. Per-channel settings live here, not on the channel. */
    myJoin: DomainJoin | null;
    /** Members still joined (`joined !== 0`) — the read-count denominator and sync-registration set. */
    activeMemberIds: string[];
    /** userId → read cursor, `max(readNo, chatNo)`. Drives the per-message read receipts. */
    cursorByUser: Map<string, number>;
}

/**
 * The join (membership + read-state) rows for one channel — ONE subscription, four readings.
 *
 * A room screen wants all four, and it used to open a separate observer for each consumer:
 * `useChannelMembers` for the roster's read-state, `useJoinPositions` for the read cursors, and
 * `useMyJoin` for my own row (nick / notify / read boundary). All three asked the same question of
 * the same cache, and while the data source shares the storage read between observers on one key
 * (their keys DO match — `activeOnly` is falsy for all three), it does not share the React state:
 * every join write produced three callbacks, three `setState`s and three independent derivations of
 * overlapping values.
 *
 * `activeOnly: false` is load-bearing rather than a default: departed members keep a `joined: 0` row,
 * and both the roster (which must drop them) and the active-member set (which must not count them)
 * need to SEE that row to make the distinction.
 *
 * Read cursor: the API join model stores the last-read number in `chatNo`, with my own row also
 * carrying an explicit `readNo` from readChat's optimistic patch, so a member's position is
 * `max(readNo, chatNo)` taken straight off the latest observed row (no high-water mark).
 *
 * Cache observation only — no sync registration. That belongs to the screen (see
 * {@link useJoinPositions}, which registers every member's cursor while the room is open).
 */
export const useChannelJoins = (channelId: string | null): ChannelJoins => {
    const { join: joinRepository } = useRuntimeRepositories();
    const { userId } = useSessionIdentity();

    const [joins, setJoins] = useState<DomainJoin[]>([]);

    useEffect(() => {
        if (!channelId) {
            setJoins([]);
            return;
        }
        return joinRepository.observeList({ channelId, activeOnly: false }, result => setJoins(result?.list ?? []));
    }, [joinRepository, channelId]);

    const myJoin = useMemo(
        () => (userId ? (joins.find(join => join.userId === userId) ?? null) : null),
        [joins, userId]
    );

    const activeMemberIds = useMemo(() => {
        const ids = new Set<string>();
        for (const join of joins) {
            if (join.userId && join.joined !== 0) ids.add(join.userId);
        }
        return [...ids];
    }, [joins]);

    const cursorByUser = useMemo(() => {
        const map = new Map<string, number>();
        for (const join of joins) {
            if (!join.userId) continue;
            map.set(join.userId, Math.max(join.readNo ?? 0, join.chatNo ?? 0));
        }
        return map;
    }, [joins]);

    return { joins, myJoin, activeMemberIds, cursorByUser };
};
