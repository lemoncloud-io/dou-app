import { useCallback, useState } from 'react';

import { runtime, type WriteReceipt } from '@chatic/runtime';
import { logger } from '@chatic/bridges';
import type { ChannelUpdateJoinInput } from '@lemoncloud/chatic-sockets-api';

type PendingKey = 'update';
type PendingState = Record<PendingKey, boolean>;

const INITIAL_PENDING: PendingState = { update: false };

export const useJoinMutations = () => {
    const { join: joinRepository } = runtime.data.useRuntimeRepositories();
    const [isPending, setIsPending] = useState<PendingState>(INITIAL_PENDING);

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
        (payload: ChannelUpdateJoinInput): Promise<WriteReceipt> =>
            run('update', () => joinRepository.updateJoin(payload)).then(receipt => {
                receipt.delivered.catch((error: unknown) => logger.error('CHAT', 'join update refused', { error }));
                return receipt;
            }),
        [joinRepository, run]
    );

    return { updateJoin, isPending };
};
