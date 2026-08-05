import { useEffect, useRef } from 'react';

import {
    recoverInvitedCloudIfMissing,
    syncInvitedCloudName,
    useRuntimeRepositories,
    useRuntimeSocketState,
} from '@chatic/app-runtime';
import { useCloudSessionCatalog, useSessionSelection } from '@chatic/web-core';

/**
 * Rebuilds the active invited cloud's local record, so the rail keeps it after you leave.
 *
 * An invited cloud has no server-side list — its only durable record is the `invitecloud` cache
 * row the invite-accept flow writes. A profile that never ran that flow (the Electron shell beside
 * a browser session, a reinstall) has no row, so the cloud shows up only while the session is
 * inside it and vanishes on a switch or a reload (.claude/20260804/DEBUG-14-50-00.md). Both engine
 * helpers already exist for the native app: `recoverInvitedCloudIfMissing` re-derives the cloud's
 * endpoints from a fresh delegation token, and `syncInvitedCloudName` fetches the authoritative
 * name over that cloud's socket — the row is written without one, which is why a recovered tile
 * would otherwise read as its id.
 *
 * Skipped for clouds in the relay catalog: those are owned, the catalog is their record, and
 * writing an invited row for one would mislabel it. Runs once per cloud, after the socket verifies
 * (both helpers need a live session), and is best-effort — a revoked grant just leaves the rail as
 * it was.
 */
export const useInvitedCloudRecovery = (): void => {
    const { cloud } = useRuntimeRepositories();
    const { isVerified } = useRuntimeSocketState();
    const { selectedCloudId } = useSessionSelection();
    const { clouds: ownedClouds } = useCloudSessionCatalog();
    const recoveredRef = useRef<string | null>(null);
    // Depend on the answer, not the catalog array: it gets a new identity on every poll, and the
    // ref would then be absorbing re-runs it was never meant to guard.
    const isOwned = ownedClouds.some(c => c.id === selectedCloudId);

    useEffect(() => {
        if (!isVerified || !selectedCloudId || selectedCloudId === 'default' || isOwned) return;
        if (recoveredRef.current === selectedCloudId) return;
        recoveredRef.current = selectedCloudId;

        // Best-effort for real: both helpers swallow their own network failures, but the cache
        // reads and writes around those are outside their try blocks, so a rejection here would
        // otherwise surface as an unhandled rejection rather than leaving the rail as it was.
        void (async () => {
            await recoverInvitedCloudIfMissing(cloud, selectedCloudId);
            await syncInvitedCloudName(cloud, selectedCloudId);
        })().catch(() => undefined);
    }, [cloud, isVerified, selectedCloudId, isOwned]);
};
