import { useEffect, useRef } from 'react';

import { useRelayInviteMutations, useRelayInvites } from '../../../hooks';
import { useLocallyCanceledInvites } from './useLocallyCanceledInvites';
import { composeInviteCode } from '../utils/inviteCode';
import { getSocketErrorCode } from '../../../utils/errors';

/**
 * Drain the stub era's local-only cancels by replaying them as real `invite.cancel` calls
 * (ADR-0043 결정 8, sender doc S9).
 *
 * Before the API existed, confirming cancel only stamped the invite id locally — the server kept
 * the invite `pending` and the recipient could still accept it. This pass runs once per home
 * mount, after the invite list settles, and for each recorded id:
 *
 * - row still `pending`/`expired` → fire the real cancel; clear the record on success or 409
 *   (accepted meanwhile — nothing left to cancel). Other failures keep the record for a later
 *   pass; the call is idempotent, so retrying is safe.
 * - row `canceled`/`accepted` → the server already knows; clear the record.
 * - row `rejected` → KEEP: the record now works as the rejected-row dismiss marker.
 * - row missing (fell out of the list window) → clear; without the row there is no code to act
 *   with, and the invite expires on its own.
 *
 * Sequential on purpose — legacy records are few, and a burst of parallel cancels would only
 * race the list invalidation each mutation already triggers.
 */
export const useCanceledInviteReconcile = (): void => {
    const { invites, isLoading } = useRelayInvites();
    const { cancelInvite } = useRelayInviteMutations();
    const { canceledIds, clearCanceled } = useLocallyCanceledInvites();

    const ranRef = useRef(false);

    useEffect(() => {
        if (ranRef.current || isLoading || canceledIds.length === 0) return;
        ranRef.current = true;

        void (async () => {
            for (const id of canceledIds) {
                const row = invites.find(invite => invite.id === id);
                if (!row) {
                    clearCanceled(id);
                    continue;
                }
                if (row.state === 'rejected') continue;
                if (row.state === 'canceled' || row.state === 'accepted') {
                    clearCanceled(id);
                    continue;
                }
                const code = composeInviteCode(row);
                if (!code) {
                    clearCanceled(id);
                    continue;
                }
                try {
                    await cancelInvite(code);
                    clearCanceled(id);
                } catch (error) {
                    if (getSocketErrorCode(error) === 409) clearCanceled(id);
                }
            }
        })();
    }, [isLoading, invites, canceledIds, cancelInvite, clearCanceled]);
};
