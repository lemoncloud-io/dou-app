import { useCallback, useRef, useState } from 'react';

import { hostProfile } from '@chatic/bridges';
import type { PairingListItem } from '@chatic/http';

import { useRuntimeRepositories } from '../../../data/hooks/useRuntimeRepositories';
import { isPairedSession } from '@chatic/runtime-client';

export interface PairingAwareLogout {
    start(): Promise<void>;
    pending: PairingListItem[] | null;
    confirm(): Promise<void>;
    cancel(): void;
    busy: boolean;
}

export const usePairingAwareLogout = (onLogout: () => void): PairingAwareLogout => {
    const { pairing } = useRuntimeRepositories();
    const [pending, setPending] = useState<PairingListItem[] | null>(null);
    const [busy, setBusy] = useState(false);
    const latest = useRef(onLogout);
    latest.current = onLogout;

    const start = useCallback(async () => {
        if (hostProfile().bridge === null || isPairedSession()) return latest.current();
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
