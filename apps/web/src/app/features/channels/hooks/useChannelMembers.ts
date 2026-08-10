import { useEffect, useMemo, useRef, useState } from 'react';

import { useRuntimeRepositories, useRuntimeSocketState } from '@chatic/app-runtime';
import type { DomainJoin, DomainUser } from '@chatic/data';

import type { ChannelMember } from '../types';
import { hasLeftChannel } from '../utils/membership';

interface UseChannelMembersParams {
    channelId: string;
    detail?: boolean;
    /**
     * The channel's full roster (`channel.memberIds`). Optional but strongly preferred: it is the
     * only membership source that is authoritative BEFORE any per-channel sync lands, so passing it
     * makes the member list appear immediately instead of waiting on `syncChannelUsers`.
     */
    memberIds?: string[];
}

/**
 * Channel participants for a channel. Observes the user cache (identity) and the
 * join cache (per-member read-state/role), merging them by user id.
 *
 * Hydration runs through `syncChannelUsers` alone, gated on `isVerified` (so it never runs
 * against a stale session and auto-retries on the false→true edge after re-auth):
 *  - `since: 0` returns the full member snapshot (guaranteed by the backend), so the first
 *    sync seeds the complete roster + each member's embedded `$join` read-state.
 *  - subsequent calls send the advanced `since` cursor for an incremental delta.
 * `refreshList` (channel.listUser) is intentionally not called: syncChannelUsers returns the
 * same users + `$join` from one response, so a separate full-snapshot fetch would be redundant.
 *
 * `activeMemberIds` is derived here (the single owner of member/join hydration) as the
 * authoritative active-membership set — join rows with `joined !== 0`. Callers feed it to the
 * profile sync registration and read-count denominator (active users only); the join read-state
 * sync instead covers the full channel roster (channel.memberIds), registered in useJoinPositions.
 */
export const useChannelMembers = ({ channelId, detail = true, memberIds }: UseChannelMembersParams) => {
    const { user: userRepository, join: joinRepository } = useRuntimeRepositories();
    const { isVerified } = useRuntimeSocketState();

    const [users, setUsers] = useState<DomainUser[]>([]);
    const [joins, setJoins] = useState<DomainJoin[]>([]);
    // Cleared by EITHER stream emitting. Keying it to the user stream alone would hang the list on
    // the one source with no sync plan — and the roster below can already name members without it.
    const [isLoading, setIsLoading] = useState(!!channelId);

    // Incremental channel-users sync cursor (since). Reset per channel; advanced per sync.
    const usersSinceRef = useRef(0);

    useEffect(() => {
        if (!channelId) {
            setUsers([]);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        return userRepository.observeList({ channelId, detail }, result => {
            setUsers(result?.list ?? []);
            setIsLoading(false);
        });
    }, [userRepository, channelId, detail]);

    useEffect(() => {
        if (!channelId) {
            setJoins([]);
            return;
        }
        return joinRepository.observeList({ channelId, activeOnly: false }, result => {
            setJoins(result?.list ?? []);
            setIsLoading(false);
        });
    }, [joinRepository, channelId]);

    // Reset the incremental cursor when the channel changes so a new room starts a fresh sync.
    useEffect(() => {
        usersSinceRef.current = 0;
    }, [channelId]);

    // Member (user) list has NO background sync plan in the runtime (unlike chat/channel/profile/
    // join), so this network load is the only path that hydrates members — it cannot be
    // centralized into the sync layer. The isVerified gate is load-bearing: it defers the fetch
    // until the session is verified (avoiding a stale-session, mis-scoped read during a site/cloud
    // switch) and, because isVerified is a dependency, re-fetches on the false→true edge after
    // reconnect/switch.
    useEffect(() => {
        if (!channelId || !isVerified) return;
        // since:0 returns the full snapshot, larger cursors an incremental delta; advance `since`
        // with the returned syncedAt.
        // The data dist types are stale (syncChannelUsers not yet surfaced on IUserRepositoryV2),
        // so narrow-cast the user repo to reach it — mirrors testbed ChatRoomPage.
        const userRepoWithSync = userRepository as unknown as {
            syncChannelUsers(payload: { channelId: string; since?: number }): Promise<number>;
        };
        void userRepoWithSync
            .syncChannelUsers({ channelId, since: usersSinceRef.current })
            .then(syncedAt => {
                usersSinceRef.current = syncedAt;
            })
            .catch(() => undefined);
    }, [userRepository, channelId, detail, isVerified]);

    // Membership first, identity second. The spine is the roster + join rows (both synced by the
    // runtime); the user cache only decorates a row it happens to hold. Building the list the other
    // way round — `users.map(...)` — silently hid every member whose user row had not synced, which
    // for a self-chat is the only member there is.
    const members = useMemo<ChannelMember[]>(() => {
        const userById = new Map<string, DomainUser>();
        for (const user of users) if (user.id) userById.set(user.id, user);

        const joinByUserId = new Map<string, DomainJoin>();
        for (const join of joins) if (join.userId) joinByUserId.set(join.userId, join);

        // Roster order first (the server's order, owner-first), then anyone the caches know about
        // but the roster does not yet list.
        const ordered = [...(memberIds ?? []), ...joinByUserId.keys(), ...userById.keys()];

        const rows: ChannelMember[] = [];
        const seen = new Set<string>();
        for (const id of ordered) {
            if (!id || seen.has(id)) continue;
            seen.add(id);
            const join = joinByUserId.get(id);
            // Someone who left keeps their join row in the cache, so without this they stay in the
            // list forever — and, since a departed row is `joined: 0` just like an invitee's, they
            // were being badged as still-pending invites (see membership.ts).
            if (hasLeftChannel(join)) continue;
            rows.push({ ...userById.get(id), id, $join: join });
        }
        return rows;
    }, [users, joins, memberIds]);

    // Active-membership set: join rows still joined (`joined !== 0`), deduped by user id. This is
    // the authoritative input for the join/profile sync registrations downstream.
    const activeMemberIds = useMemo<string[]>(() => {
        const ids = new Set<string>();
        for (const join of joins) {
            if (join.userId && join.joined !== 0) ids.add(join.userId);
        }
        return [...ids];
    }, [joins]);

    return { members, activeMemberIds, total: members.length, isLoading, isError: false };
};
