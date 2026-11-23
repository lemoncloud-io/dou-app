import { useEffect, useMemo, useRef, useState } from 'react';

import { runtime, type DomainJoin, type DomainUser } from '@chatic/runtime';

import type { ChannelMember } from '../types';
import { hasLeftChannel } from '../utils/membership';

interface UseChannelMembersParams {
    channelId: string;
    detail?: boolean;
    memberIds?: string[];
    joins: DomainJoin[];
    keepLeftMembers?: boolean;
}

export const useChannelMembers = ({
    channelId,
    detail = true,
    memberIds,
    joins,
    keepLeftMembers = false,
}: UseChannelMembersParams) => {
    const { user: userRepository } = runtime.data.useRuntimeRepositories();
    const { isVerified } = runtime.connection.useRuntimeSocketState();

    const [users, setUsers] = useState<DomainUser[]>([]);
    const [isLoading, setIsLoading] = useState(!!channelId);

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
        if (joins.length > 0) setIsLoading(false);
    }, [joins]);

    useEffect(() => {
        usersSinceRef.current = 0;
    }, [channelId]);

    useEffect(() => {
        if (!channelId || !isVerified) return;
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
        const userById = new Map<string, DomainUser>();
        for (const user of users) if (user.id) userById.set(user.id, user);

        const joinByUserId = new Map<string, DomainJoin>();
        for (const join of joins) if (join.userId) joinByUserId.set(join.userId, join);

        const ordered = [...(memberIds ?? []), ...joinByUserId.keys(), ...userById.keys()];

        const rows: ChannelMember[] = [];
        const seen = new Set<string>();
        for (const id of ordered) {
            if (!id || seen.has(id)) continue;
            seen.add(id);
            const join = joinByUserId.get(id);
            if (!keepLeftMembers && hasLeftChannel(join)) continue;
            rows.push({ ...userById.get(id), id, $join: join });
        }
        return rows;
    }, [users, joins, memberIds, keepLeftMembers]);

    return { members, total: members.length, isLoading, isError: false };
};
