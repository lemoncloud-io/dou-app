import { useEffect, useMemo, useState } from 'react';

import type { DomainJoin, DomainUser } from '@chatic/data';
import { useWebSocketV2Store } from '@chatic/socket';

import { useRepositories } from '@chatic/app-runtime';

const MEMBER_LIMIT = 100;
const REFETCH_DEBOUNCE_MS = 500;

export interface ChannelMember extends DomainUser {
    /** True when this member is the channel owner (matched against ownerId). */
    isOwner: boolean;
}

/**
 * Channel member list. Fetches participants via user.fetchUsers({channelId,
 * detail:true}) so each member carries its `$join`. Owner is flagged by
 * comparing the member id against the channel's ownerId (pass it in — usually
 * from the selected channel); the flag is applied off the network path so an
 * ownerId change never re-fetches.
 *
 * Live updates: re-fetches on user:update / join:update events (member profile
 * edits, reads, joins/leaves), debounced so a burst coalesces into one fetch.
 * join:update events are filtered to this channel. Subscriptions are cleaned up
 * on unmount/switch.
 */
export const useChannelMembers = (channelId: string | null, ownerId?: string) => {
    const { user: userRepository, join: joinRepository } = useRepositories();
    const isVerified = useWebSocketV2Store(s => s.isVerified);
    const [rawMembers, setRawMembers] = useState<DomainUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!channelId || !isVerified) {
            setRawMembers([]);
            setIsLoading(false);
            return;
        }

        let active = true;
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        setIsLoading(true);
        setError(null);

        // Initial load may serve cache; event-driven refetches must hit the network,
        // otherwise live join/leave/profile updates would return the stale cached list.
        const fetchMembers = (cachePolicy: 'cache-first' | 'network-only' = 'cache-first') => {
            userRepository
                .fetchUsers({ channelId, detail: true, limit: MEMBER_LIMIT }, { cachePolicy })
                .then(result => {
                    if (!active) return;
                    setRawMembers(result.list ?? []);
                })
                .catch((err: unknown) => {
                    if (active) setError(err instanceof Error ? err : new Error(String(err)));
                })
                .finally(() => {
                    if (active) setIsLoading(false);
                });
        };

        const scheduleRefetch = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => fetchMembers('network-only'), REFETCH_DEBOUNCE_MS);
        };

        const onJoin = (join: DomainJoin) => {
            if (join.channelId && join.channelId !== channelId) return;
            scheduleRefetch();
        };

        fetchMembers();

        const unsubs = [userRepository.onUserUpdated(scheduleRefetch), joinRepository.onJoinUpdated(onJoin)];

        return () => {
            active = false;
            if (debounceTimer) clearTimeout(debounceTimer);
            unsubs.forEach(fn => fn());
        };
    }, [channelId, isVerified, userRepository, joinRepository]);

    const members = useMemo<ChannelMember[]>(
        () => rawMembers.map(user => ({ ...user, isOwner: !!ownerId && user.id === ownerId })),
        [rawMembers, ownerId]
    );

    return { members, isLoading, error };
};
