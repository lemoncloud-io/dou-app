import { useEffect, useMemo, useState } from 'react';

import type { DomainJoin, DomainUser } from '@chatic/data';
import { useWebSocketV2Store } from '@chatic/socket';

import { useRuntimeRepositories } from '@chatic/app-runtime';

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
    const { user: userRepository, join: joinRepository } = useRuntimeRepositories();
    const isVerified = useWebSocketV2Store(s => s.isVerified);
    const [rawMembers, setRawMembers] = useState<DomainUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!channelId) {
            setRawMembers([]);
            setIsLoading(false);
            return;
        }

        let active = true;
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        // Once the authoritative network roster lands, ignore a slower cache read so
        // it can't clobber freshly-fetched names back to a blank cached record.
        let networkSettled = false;
        setIsLoading(true);
        setError(null);

        const applyResult = (list: DomainUser[], fromNetwork: boolean) => {
            if (!active || (!fromNetwork && networkSettled)) return;
            if (fromNetwork) networkSettled = true;
            setRawMembers(list);
        };

        // Cache-first paints the roster instantly (a local read needs no socket) so
        // members render right away, but it is only a *fallback* for author names —
        // useAuthorNames resolves seen authors from the user cache without waiting
        // on this. isLoading (the name skeleton) is cleared only when the network
        // roster lands, so an author the roster hasn't confirmed yet shows a skeleton
        // rather than flashing "Unknown". Already-resolved names ignore isLoading, so
        // this never adds a skeleton to a name we can already show.
        const fetchMembers = (cachePolicy: 'cache-first' | 'network-only') => {
            const fromNetwork = cachePolicy === 'network-only';
            userRepository
                .fetchUsers({ channelId, detail: true, limit: MEMBER_LIMIT }, { cachePolicy })
                .then(result => {
                    applyResult(result.list ?? [], fromNetwork);
                    if (fromNetwork && active) setError(null);
                })
                .catch((err: unknown) => {
                    if (active && fromNetwork) setError(err instanceof Error ? err : new Error(String(err)));
                })
                .finally(() => {
                    // Only the network result clears loading — the cache paint keeps it up.
                    if (active && fromNetwork) setIsLoading(false);
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

        fetchMembers('cache-first');
        fetchMembers('network-only');

        const unsubs = [userRepository.onUserUpdated(scheduleRefetch), joinRepository.onJoinUpdated(onJoin)];

        return () => {
            active = false;
            if (debounceTimer) clearTimeout(debounceTimer);
            unsubs.forEach(fn => fn());
        };
        // isVerified is a dep (not read in the body): the initial fetch is
        // cache-first and runs before the socket connects, so re-running once the
        // socket verifies kicks the network refresh that couldn't fire offline.
    }, [channelId, isVerified, userRepository, joinRepository]);

    const members = useMemo<ChannelMember[]>(
        () => rawMembers.map(user => ({ ...user, isOwner: !!ownerId && user.id === ownerId })),
        [rawMembers, ownerId]
    );

    return { members, isLoading, error };
};
