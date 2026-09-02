import { useEffect, useMemo, useRef, useState } from 'react';

import type { DomainUser } from '@chatic/data';
import { useRuntimeRepositories, useRuntimeSocketState } from '@chatic/app-runtime';

export interface ChannelMember extends DomainUser {
    /** True when this member is the channel owner (matched against ownerId). */
    isOwner: boolean;
}

/**
 * Channel member list (mirrors apps/web useChannelMembers). Observes the user
 * cache (member identity + embedded `$join` read-state) and, gated on socket
 * verification, hydrates it via two complementary network paths:
 *  - `refreshList`: one-shot full snapshot of members + their `$join`.
 *  - `syncChannelUsers`: incremental delta keyed by a `since` cursor, advanced per sync.
 *
 * The member list has no background sync plan in the runtime, so these two loads
 * are the only paths that hydrate members. The `isVerified` gate is load-bearing:
 * it defers the fetch until the session is verified (avoiding a stale, mis-scoped
 * read mid switch) and, as a dependency, re-fetches on the false→true edge after
 * reconnect/switch.
 *
 * Owner is flagged off the network path by comparing the member id against the
 * channel's ownerId (pass it in — usually from the selected channel), so an
 * ownerId change never re-fetches.
 */
export const useChannelMembers = (channelId: string | null, ownerId?: string) => {
    const { user: userRepository } = useRuntimeRepositories();
    const { isVerified } = useRuntimeSocketState();
    const [rawMembers, setRawMembers] = useState<DomainUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    // Incremental channel-users sync cursor (since). Reset per channel; advanced per sync.
    const sinceRef = useRef(0);

    useEffect(() => {
        if (!channelId) {
            setRawMembers([]);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        return userRepository.observeList({ channelId, detail: true }, result => {
            setRawMembers(result?.list ?? []);
            setIsLoading(false);
        });
    }, [userRepository, channelId]);

    // Reset the incremental cursor when the channel changes so a new room starts fresh.
    useEffect(() => {
        sinceRef.current = 0;
    }, [channelId]);

    useEffect(() => {
        if (!channelId || !isVerified) return;
        setError(null);
        // Full snapshot of the current members + their embedded `$join` read-state.
        void userRepository
            .refreshList({ channelId, detail: true })
            .catch((err: unknown) => setError(err instanceof Error ? err : new Error(String(err))));
        // Incremental delta from the last cursor; advance `since` with the returned syncedAt.
        void userRepository
            .syncChannelUsers({ channelId, since: sinceRef.current })
            .then(syncedAt => {
                sinceRef.current = syncedAt;
            })
            .catch(() => undefined);
    }, [userRepository, channelId, isVerified]);

    const members = useMemo<ChannelMember[]>(
        () => rawMembers.map(user => ({ ...user, isOwner: !!ownerId && user.id === ownerId })),
        [rawMembers, ownerId]
    );

    return { members, isLoading, error };
};
