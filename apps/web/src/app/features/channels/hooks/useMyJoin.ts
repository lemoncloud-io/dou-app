import { useEffect, useState } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useSessionIdentity } from '@chatic/web-core';
import type { DomainJoin } from '@chatic/data';

/**
 * Observe the current user's join row for a channel from the join cache stream.
 *
 * Per-channel settings (notify, nick, read-state) live on the join, not the
 * channel. Reading them off the channel's embedded `$join` is unreliable — that
 * snapshot is only a projection and lags the join cache — so subscribe to the
 * join cache directly and pick my row by user id (mirrors useChannelMembers's
 * join observation).
 */
export const useMyJoin = (channelId: string | null): DomainJoin | null => {
    const { join: joinRepository } = useRuntimeRepositories();
    const { userId } = useSessionIdentity();
    const [myJoin, setMyJoin] = useState<DomainJoin | null>(null);

    useEffect(() => {
        if (!channelId || !userId) {
            setMyJoin(null);
            return;
        }
        return joinRepository.observeList({ channelId, activeOnly: false }, result => {
            setMyJoin(result?.list.find(join => join.userId === userId) ?? null);
        });
    }, [joinRepository, channelId, userId]);

    return myJoin;
};
