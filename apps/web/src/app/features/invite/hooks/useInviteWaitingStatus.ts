import { useMemo } from 'react';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

import { useRelayInvites } from '../../../hooks';

const POLL_INTERVAL_MS = 30_000;

export const useInviteWaitingStatus = (inviteId: string | undefined) => {
    const { invites, isLoading, refetch } = useRelayInvites(undefined, { pollIntervalMs: POLL_INTERVAL_MS });

    const invite = useMemo<MyInviteView | undefined>(
        () => invites.find(item => item.id === inviteId),
        [invites, inviteId]
    );

    return { invite, invites, isLoading, refetch };
};
