import { useCallback, useEffect, useRef } from 'react';

import { PAIRED_CLOUD_CHECK_INTERVAL_MS, pairedCloudSessions, pairedClouds, isRelayGuest } from '@chatic/auth';
import { useSessionAuth } from '../session/readers/useSessionAuth';

/**
 * Re-checks the paired clouds when mounted, every ten minutes, and whenever `check` is called — an
 * app calls it on returning to the foreground, the trigger only it can see. `onEnded` hears each cloud
 * the relay stopped delegating, already torn down and off the list, so the app can say so.
 *
 * With no paired cloud it does nothing at all, so mounting it everywhere costs nothing.
 *
 * Nothing runs before the session has initialised. The check is a relay-signed request, and at boot
 * the relay transport is not up yet: a check then fails before it reaches the network, counts as
 * "unknown", and the next try is ten minutes away — so a tab reopened after its approval was revoked
 * would stay in the cloud that long.
 */
export const usePairedCloudCheck = (onEnded: (cloudId: string) => void): { check: () => Promise<void> } => {
    const latest = useRef(onEnded);
    latest.current = onEnded;
    const running = useRef(false);
    const { isInitialized } = useSessionAuth();
    const ready = useRef(isInitialized);
    ready.current = isInitialized;

    const check = useCallback(async () => {
        if (!ready.current || running.current || pairedClouds.list().length === 0) return;
        // A device that has since signed in to an account of its own enters clouds through that account;
        // the list it kept as a guest no longer describes it.
        if (!isRelayGuest()) {
            pairedClouds.clear();
            return;
        }
        running.current = true;
        try {
            (await pairedCloudSessions.checkAll()).forEach(cloudId => latest.current(cloudId));
        } finally {
            running.current = false;
        }
    }, []);

    useEffect(() => {
        if (!isInitialized) return;
        void check();
        const timer = setInterval(() => void check(), PAIRED_CLOUD_CHECK_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [check, isInitialized]);

    return { check };
};
