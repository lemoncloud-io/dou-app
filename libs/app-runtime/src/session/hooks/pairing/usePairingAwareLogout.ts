import { useCallback, useRef, useState } from 'react';

import { isNative } from '@chatic/bridges';
import type { PairingListItem } from '@chatic/http';

import { useRuntimeRepositories } from '../../../data/hooks/useRuntimeRepositories';
import { isPairedSession } from '@chatic/auth';

export interface PairingAwareLogout {
    /**
     * Starts a sign-out. Logs out at once unless this device approved sign-ins that are still standing;
     * then `pending` lists them for a confirm.
     */
    start(): Promise<void>;
    /** The approved sign-ins the confirm lists, or `null` when no confirm is open. */
    pending: PairingListItem[] | null;
    /** Revokes every listed approval, whatever each one answers, then logs out. */
    confirm(): Promise<void>;
    cancel(): void;
    /** Reading the list or revoking is under way. */
    busy: boolean;
}

/**
 * Signing out of an approving app ends the sign-ins it approved.
 *
 * The relay would refuse those sessions at their next renewal anyway, once the approver's own session
 * is gone; revoking first closes a relay sign-in's connection at once and keeps the approver's list
 * clean. So the order is: read the approvals, confirm when there are any, revoke them all, then the
 * app's ordinary logout (`onLogout`).
 *
 * Only an approving device asks: inside the app, on a session that is not itself a secondary device.
 * A browser and a secondary device log out straight away, and so does an approving device whose list
 * cannot be read — the server catches up on its own, so a failed read must never hold a logout hostage.
 * A failed revoke does not stop the logout either.
 */
export const usePairingAwareLogout = (onLogout: () => void): PairingAwareLogout => {
    const { pairing } = useRuntimeRepositories();
    const [pending, setPending] = useState<PairingListItem[] | null>(null);
    const [busy, setBusy] = useState(false);
    const latest = useRef(onLogout);
    latest.current = onLogout;

    const start = useCallback(async () => {
        if (!isNative() || isPairedSession()) return latest.current();
        setBusy(true);
        let standing: PairingListItem[] = [];
        try {
            standing = (await pairing.listPairings()).list.filter(item => item.status === 'approved');
        } catch {
            standing = [];
        } finally {
            setBusy(false);
        }
        if (standing.length === 0) return latest.current();
        setPending(standing);
    }, [pairing]);

    const confirm = useCallback(async () => {
        const rows = pending ?? [];
        setBusy(true);
        await Promise.allSettled(rows.map(row => pairing.revokePairing(row.pairingId)));
        setBusy(false);
        setPending(null);
        latest.current();
    }, [pairing, pending]);

    const cancel = useCallback(() => setPending(null), []);

    return { start, pending, confirm, cancel, busy };
};
