import { useEffect, useMemo, useState } from 'react';

import { useRuntimeRepositories, useSocketState } from '@chatic/app-runtime';
import type { DomainJoin, DomainUser } from '@chatic/data';

import type { ChannelMember } from '../types';

interface UseChannelMembersParams {
    channelId: string;
    detail?: boolean;
}

/**
 * Channel participants for a channel. Observes the user cache (identity) and the
 * join cache (per-member read-state/role), merging them by user id. The network
 * load is gated on `isVerified` so it never runs against a stale session and
 * auto-retries after re-auth (mirrors testbed's channel-user load).
 */
export const useChannelMembers = ({ channelId, detail = true }: UseChannelMembersParams) => {
    const { user: userRepository, join: joinRepository } = useRuntimeRepositories();
    const { isVerified } = useSocketState();

    const [users, setUsers] = useState<DomainUser[]>([]);
    const [joins, setJoins] = useState<DomainJoin[]>([]);
    const [isLoading, setIsLoading] = useState(!!channelId);

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

    // Network load is session-scoped; run it only once verified (auto-retries on re-auth).
    useEffect(() => {
        if (!channelId || !isVerified) return;
        void userRepository.refreshList({ channelId, detail }).catch(() => undefined);
    }, [userRepository, channelId, detail, isVerified]);

    const members = useMemo<ChannelMember[]>(() => {
        const joinByUserId = new Map<string, DomainJoin>();
        for (const join of joins) {
            if (join.userId) joinByUserId.set(join.userId, join);
        }
        return users.map(user => ({ ...user, $join: user.id ? joinByUserId.get(user.id) : undefined }));
    }, [users, joins]);

    return { members, total: members.length, isLoading, isError: false };
};
