import { useCallback, useEffect, useRef, useState } from 'react';

import { createPairedCloudCheck, PAIRED_CLOUD_CHECK_INTERVAL_MS } from '@chatic/runtime-client';

import { useSessionAuth } from '../session/readers/useSessionAuth';

/**
 * Re-checks the paired clouds when mounted, every ten minutes, and whenever `check` is called — an
 * app calls it on returning to the foreground, the trigger only it can see. `onEnded` hears each cloud
 * the relay stopped delegating, already torn down and off the list, so the app can say so.
 *
 * With no paired cloud it does nothing at all, so mounting it everywhere costs nothing. The check itself
 * is runtime-client's `createPairedCloudCheck`; this hook decides when it runs.
 *
 * Nothing runs before the session has initialised. The check is a relay-signed request, and at boot
 * the relay transport is not up yet: a check then fails before it reaches the network, counts as
 * "unknown", and the next try is ten minutes away — so a tab reopened after its approval was revoked
 * would stay in the cloud that long.
 */
export const usePairedCloudCheck = (onEnded: (cloudId: string) => void): { check: () => Promise<void> } => {
    const latest = useRef(onEnded);
    latest.current = onEnded;
    // One check per mount, so a call while the last one runs is dropped; it hears the latest `onEnded`.
    const [runCheck] = useState(() => createPairedCloudCheck(cloudId => latest.current(cloudId)));
    const { isInitialized } = useSessionAuth();
    const ready = useRef(isInitialized);
    ready.current = isInitialized;

    const check = useCallback(async () => {
        if (!ready.current) return;
        await runCheck();
    }, [runCheck]);

    useEffect(() => {
        if (!isInitialized) return;
        void check();
        const timer = setInterval(() => void check(), PAIRED_CLOUD_CHECK_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [check, isInitialized]);

    return { check };
};
