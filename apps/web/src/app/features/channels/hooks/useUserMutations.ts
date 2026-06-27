import { useCallback, useState } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import type { MyInviteView, MyUserInviteBody } from '@lemoncloud/chatic-backend-api';
import type { UserInviteInput } from '@lemoncloud/chatic-sockets-api';

type PendingKey = 'invite' | 'invite-batch';
type PendingState = Record<PendingKey, boolean>;

const INITIAL_PENDING: PendingState = { invite: false, 'invite-batch': false };

/**
 * User invite operations backed by the engine's user repository. `requestInvite`
 * creates a single invite (the caller shares the returned Location link);
 * `requestInviteBatch` hands a phone/name list to the server for SMS dispatch.
 */
export const useUserMutations = () => {
    const { user: userRepository } = useRuntimeRepositories();
    const [isPending, setIsPending] = useState<PendingState>(INITIAL_PENDING);

    const run = useCallback(<T>(key: PendingKey, op: () => Promise<T>): Promise<T> => {
        setIsPending(prev => ({ ...prev, [key]: true }));
        return op().finally(() => setIsPending(prev => ({ ...prev, [key]: false })));
    }, []);

    const requestInvite = useCallback(
        (payload: UserInviteInput): Promise<MyInviteView> => run('invite', () => userRepository.requestInvite(payload)),
        [userRepository, run]
    );

    const requestInviteBatch = useCallback(
        (payload: MyUserInviteBody): Promise<MyInviteView[]> =>
            run('invite-batch', () => userRepository.requestInviteBatch(payload)),
        [userRepository, run]
    );

    return { requestInvite, requestInviteBatch, isPending };
};
