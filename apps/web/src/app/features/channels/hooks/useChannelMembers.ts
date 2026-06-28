import { useEffect, useMemo, useRef, useState } from 'react';

import { useRuntimeRepositories, useSocketState } from '@chatic/app-runtime';
import type { DomainJoin, DomainUser } from '@chatic/data';

import type { ChannelMember } from '../types';

interface UseChannelMembersParams {
    channelId: string;
    detail?: boolean;
}

/**
 * Channel participants for a channel. Observes the user cache (identity) and the
 * join cache (per-member read-state/role), merging them by user id.
 *
 * Hydration runs on two complementary paths, both gated on `isVerified` (so they
 * never run against a stale session and auto-retry on the false→true edge after
 * re-auth), mirroring testbed's channel-user load:
 *  - `refreshList`: one-shot full snapshot of members + their embedded `$join`.
 *  - `syncChannelUsers`: incremental delta keyed by a `since` cursor, advanced per sync.
 *
 * `activeMemberIds` is derived here (the single owner of member/join hydration) as the
 * authoritative active-membership set — join rows with `joined !== 0`. Callers feed it to
 * the join/profile sync registrations so only active users are tracked.
 */
export const useChannelMembers = ({ channelId, detail = true }: UseChannelMembersParams) => {
    const { user: userRepository, join: joinRepository } = useRuntimeRepositories();
    const { isVerified } = useSocketState();

    const [users, setUsers] = useState<DomainUser[]>([]);
    const [joins, setJoins] = useState<DomainJoin[]>([]);
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
        });
    }, [joinRepository, channelId]);

    // Reset the incremental cursor when the channel changes so a new room starts a fresh sync.
    useEffect(() => {
        usersSinceRef.current = 0;
    }, [channelId]);

    // Member (user) list has NO background sync plan in the runtime (unlike chat/channel/profile/
    // join), so these two network loads are the only paths that hydrate members — they cannot be
    // centralized into the sync layer. The isVerified gate is load-bearing: it defers the fetch
    // until the session is verified (avoiding a stale-session, mis-scoped read during a site/cloud
    // switch) and, because isVerified is a dependency, re-fetches on the false→true edge after
    // reconnect/switch.
    useEffect(() => {
        if (!channelId || !isVerified) return;
        // Full snapshot of the current members + their embedded `$join` read-state.
        void userRepository.refreshList({ channelId, detail }).catch(() => undefined);
        // Incremental delta from the last cursor; advance `since` with the returned syncedAt.
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

    const members = useMemo<ChannelMember[]>(() => {
        const joinByUserId = new Map<string, DomainJoin>();
        for (const join of joins) {
            if (join.userId) joinByUserId.set(join.userId, join);
        }
        return users.map(user => ({ ...user, $join: user.id ? joinByUserId.get(user.id) : undefined }));
    }, [users, joins]);

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
