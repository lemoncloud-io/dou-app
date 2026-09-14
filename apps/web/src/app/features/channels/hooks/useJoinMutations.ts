import { useCallback, useState } from 'react';

import { runtime } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';
import type { DomainJoin } from '@chatic/data';
import type { ChannelUpdateJoinInput } from '@lemoncloud/chatic-sockets-api';

type PendingKey = 'update';
type PendingState = Record<PendingKey, boolean>;

const INITIAL_PENDING: PendingState = { update: false };

/**
 * Join write operations backed by the engine's join repository. `updateJoin`
 * wraps `join.update` — an invited member sets their own per-channel nick (the
 * personal room name shown only to them) or notification flag. Kept separate
 * from useChannelMutations because it talks to a different repository.
 */
export const useJoinMutations = () => {
    const { join: joinRepository } = runtime.data.useRuntimeRepositories();
    const [isPending, setIsPending] = useState<PendingState>(INITIAL_PENDING);

    // Toggle the pending flag around the promise, and log the failure (mirrors useChannelMutations).
    // A silent failure here leaves the user's own join row — their nick and mute flag — at its old
    // value with no trace of the write that was refused.
    const run = useCallback(<T>(key: PendingKey, op: () => Promise<T>): Promise<T> => {
        setIsPending(prev => ({ ...prev, [key]: true }));
        return op()
            .catch((error: unknown) => {
                logger.error('CHAT', `join ${key} failed`, { error });
                throw error;
            })
            .finally(() => setIsPending(prev => ({ ...prev, [key]: false })));
    }, []);

    const updateJoin = useCallback(
        (payload: ChannelUpdateJoinInput): Promise<DomainJoin> =>
            run('update', () => joinRepository.updateJoin(payload)),
        [joinRepository, run]
    );

    return { updateJoin, isPending };
};
