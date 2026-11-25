import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { DomainUser } from '@chatic/runtime-react';
import { runtime } from '@chatic/runtime-react';

export interface ChannelMember extends DomainUser {
    isOwner: boolean;
}

export const useChannelMembers = (channelId: string | null, ownerId?: string) => {
    const { user: userRepository } = runtime.data.useRuntimeRepositories();
    const { isVerified } = runtime.connection.useRuntimeSocketState();
    const [rawMembers, setRawMembers] = useState<DomainUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [syncError, setSyncError] = useState<Error | null>(null);
    const [retryTick, setRetryTick] = useState(0);

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

    useEffect(() => {
        sinceRef.current = 0;
    }, [channelId]);

    useEffect(() => {
        if (!channelId || !isVerified) return;
        setError(null);
        setSyncError(null);
        void userRepository
            .refreshList({ channelId, detail: true })
            .catch((err: unknown) => setError(err instanceof Error ? err : new Error(String(err))));
        void userRepository
            .syncChannelUsers({ channelId, since: sinceRef.current })
            .then(syncedAt => {
                sinceRef.current = syncedAt;
            })
            .catch((err: unknown) => setSyncError(err instanceof Error ? err : new Error(String(err))));
    }, [userRepository, channelId, isVerified, retryTick]);

    const members = useMemo<ChannelMember[]>(
        () => rawMembers.map(user => ({ ...user, isOwner: !!ownerId && user.id === ownerId })),
        [rawMembers, ownerId]
    );

    const retry = useCallback(() => {
        setError(null);
        setSyncError(null);
        setRetryTick(tick => tick + 1);
    }, []);

    return { members, isLoading, error, syncError, retry };
};
