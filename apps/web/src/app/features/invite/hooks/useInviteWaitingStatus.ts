import { useEffect, useMemo } from 'react';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

import { useRelayInvites } from '../../../hooks';

/** Re-poll cadence while the waiting screen is mounted, on top of react-query's window-focus refetch. */
const POLL_INTERVAL_MS = 30_000;

/**
 * Resolves the single invite the waiting screen (`InviteWaitingPage`) is tracking, out of the
 * inviter's own `invite.list` (Track 0's `useRelayInvites`).
 *
 * The client guide has no accept-notification packet, so the inviter side only ever learns about
 * an acceptance by re-asking — `useRelayInvites` already refetches on window focus (react-query
 * default); this adds the roadmap's "+30s" cadence on top, scoped to the lifetime of this hook
 * (mount/unmount), so it only runs while the waiting screen is actually shown.
 */
export const useInviteWaitingStatus = (inviteId: string | undefined) => {
    const { invites, isLoading, refetch } = useRelayInvites();

    useEffect(() => {
        const intervalId = setInterval(() => {
            refetch();
        }, POLL_INTERVAL_MS);
        return () => clearInterval(intervalId);
    }, [refetch]);

    const invite = useMemo<MyInviteView | undefined>(
        () => invites.find(item => item.id === inviteId),
        [invites, inviteId]
    );

    return { invite, isLoading, refetch };
};
