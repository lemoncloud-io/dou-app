import { useMemo } from 'react';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

import { useRelayInvites } from '../../../hooks';

/** Re-poll cadence while the waiting screen is mounted, on top of react-query's window-focus refetch. */
const POLL_INTERVAL_MS = 30_000;

/**
 * Resolves the single invite the waiting screen (`InviteWaitingPage`) is tracking, out of the
 * inviter's own `invite.list` (Track 0's `useRelayInvites`).
 *
 * The client guide has no accept-notification packet, so the inviter side only ever learns about
 * an acceptance by re-asking — `useRelayInvites` opts into a window-focus refetch; this adds the
 * roadmap's "+30s" cadence on top, scoped to the lifetime of this hook (mount/unmount), so it only
 * runs while the waiting screen is actually shown.
 *
 * The cadence is handed to react-query rather than run here as `setInterval` + `refetch()`: a manual
 * `refetch()` ignores the query's `enabled` gate, so the old timer re-asked `invite.list` every 30s
 * even while the relay socket was unauthenticated and the server answered `401 UNAUTHORIZED - not
 * authenticated`. Same cadence, now gated (and paused in the background).
 */
export const useInviteWaitingStatus = (inviteId: string | undefined) => {
    const { invites, isLoading, refetch } = useRelayInvites(undefined, { pollIntervalMs: POLL_INTERVAL_MS });

    const invite = useMemo<MyInviteView | undefined>(
        () => invites.find(item => item.id === inviteId),
        [invites, inviteId]
    );

    // `invites`/`refetch` are exposed alongside the resolved single `invite` so callers can run
    // `resolveInviteCode` — a cache-first row (ADR-0052) carries no code, and that helper needs the
    // full list plus a way to re-ask the server, not just the one row this hook already resolved.
    return { invite, invites, isLoading, refetch };
};
