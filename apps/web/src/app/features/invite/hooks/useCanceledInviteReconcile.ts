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
    const { invites, isLoading } = useRelayInvites();
    const { cancelInvite } = useRelayInviteMutations();

    const ranRef = useRef(false);

    useEffect(() => {
        const dismissedRows = invites.filter(
            (row): row is RelayInviteRow & { id: string; dismissedAt: number } => !!row.id && !!row.dismissedAt
        );
        if (ranRef.current || isLoading || dismissedRows.length === 0) return;
        ranRef.current = true;

        void (async () => {
            for (const row of dismissedRows) {
                if (!row.state) {
                    await invite.cacheDelete(row.id);
                    continue;
                }
                if (row.state === 'rejected') continue;
                if (row.state === 'canceled' || row.state === 'accepted') {
                    await invite.undismiss(row.id);
                    continue;
                }
                const code = composeInviteCode(row);
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
    }, [isLoading, invites, cancelInvite, invite]);
};
