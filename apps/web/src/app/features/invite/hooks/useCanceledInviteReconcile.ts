import { useEffect, useRef } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';

import { useRelayInviteMutations, useRelayInvites, type RelayInviteRow } from '../../../hooks';
import { composeInviteCode } from '../utils/inviteCode';
import { getSocketErrorCode } from '../../../utils/errors';

/**
 * Drain the stub era's local-only cancels by replaying them as real `invite.cancel` calls
 * (ADR-0043 결정 8, sender doc S9). Reads dismissed rows off the cache (`dismissedAt`, ADR-0052)
 * instead of the retired `canceledInviteIds` localStorage list — the one-time migration
 * (`useInviteDismissMigration`) seeds a dismiss stub for every legacy record before this ever runs.
 *
 * Codes never reach the cache (they are credentials — ADR-0052) and home no longer fetches the
 * list at all, so a drain with something to do re-asks the server ONCE up front and composes every
 * code off that one response. No response (relay never verified inside `refetch`'s wait) leaves
 * every record untouched for a later mount — clearing a dismiss stamp we could not act on would
 * lose the legacy cancel silently.
 *
 * This pass runs once per home mount, after the invite list settles, and for each dismissed row:
 *
 * - row has no `state` (a migration stub that never matched a server response — fell out of the
 *   list window, or was never returned) → drop the stub entirely; there is no code to act with.
 * - row still `pending`/`expired` → fire the real cancel; clear the dismiss on success or 409
 *   (accepted meanwhile — nothing left to cancel). Other failures keep the record for a later
 *   pass; the call is idempotent, so retrying is safe.
 * - row `canceled`/`accepted` → the server already knows; clear the dismiss.
 * - row `rejected` → KEEP: this is the steady-state rejected-row dismiss marker, not a legacy
 *   stamp — nothing to reconcile.
 *
 * Sequential on purpose — legacy records are few, and a burst of parallel cancels would only
 * race the list invalidation each mutation already triggers.
 */
export const useCanceledInviteReconcile = (): void => {
    const { invite } = useRuntimeRepositories();
    const { invites, isLoading, refetch } = useRelayInvites();
    const { cancelInvite } = useRelayInviteMutations();

    const ranRef = useRef(false);

    useEffect(() => {
        const dismissedRows = invites.filter(
            (row): row is RelayInviteRow & { id: string; dismissedAt: number } => !!row.id && !!row.dismissedAt
        );
        if (ranRef.current || isLoading || dismissedRows.length === 0) return;
        ranRef.current = true;

        void (async () => {
            // Stubs carry no state and need no code — drop them before spending a round trip.
            const stubs = dismissedRows.filter(row => !row.state);
            for (const row of stubs) {
                await invite.cacheDelete(row.id);
            }

            // Already final on the server — the dismiss stamp has nothing left to replay, and
            // clearing it needs no code, so these are settled before any round trip too.
            const settled = dismissedRows.filter(row => row.state === 'canceled' || row.state === 'accepted');
            for (const row of settled) {
                await invite.undismiss(row.id);
            }

            // What is left is the actual legacy work: a still-live card whose cancel never reached
            // the server. Only these need a `code`, so only these justify the re-ask.
            const needsCancel = dismissedRows.filter(row => row.state === 'pending' || row.state === 'expired');
            if (needsCancel.length === 0) return;

            const { data: fresh } = await refetch();
            if (!fresh) {
                // The wait timed out — retry on a later mount rather than acting blind.
                ranRef.current = false;
                return;
            }

            for (const row of needsCancel) {
                const match = fresh.find(item => item.id === row.id);
                const code = match && composeInviteCode(match);
                if (!code) {
                    await invite.undismiss(row.id);
                    continue;
                }
                try {
                    await cancelInvite(code);
                    await invite.undismiss(row.id);
                } catch (error) {
                    if (getSocketErrorCode(error) === 409) await invite.undismiss(row.id);
                }
            }
        })();
    }, [isLoading, invites, cancelInvite, invite, refetch]);
};
