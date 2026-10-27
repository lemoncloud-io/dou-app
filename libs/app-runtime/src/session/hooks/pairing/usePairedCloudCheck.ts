import { useCallback, useEffect, useRef } from 'react';

import { PAIRED_CLOUD_CHECK_INTERVAL_MS, checkPairedClouds } from '../../pairing/pairedCloudCheck';
import { pairedClouds } from '../../pairing/pairedClouds';
import { isRelayGuest } from '../../pairing/pairedSession';

/**
 * Re-checks the paired clouds when mounted, every ten minutes, and whenever `check` is called — an
 * app calls it on returning to the foreground, the trigger only it can see. `onEnded` hears each cloud
 * the relay stopped delegating, already torn down and off the list, so the app can say so.
 *
 * With no paired cloud it does nothing at all, so mounting it everywhere costs nothing.
 */
export const usePairedCloudCheck = (onEnded: (cloudId: string) => void): { check: () => Promise<void> } => {
    const latest = useRef(onEnded);
    latest.current = onEnded;
    const running = useRef(false);

    const check = useCallback(async () => {
        if (running.current || pairedClouds.list().length === 0) return;
        // A device that has since signed in to an account of its own enters clouds through that account;
        // the list it kept as a guest no longer describes it.
        if (!isRelayGuest()) {
            pairedClouds.clear();
            return;
        }
        running.current = true;
        try {
            (await checkPairedClouds()).forEach(cloudId => latest.current(cloudId));
        } finally {
            running.current = false;
        }
    }, []);

    useEffect(() => {
        void check();
        const timer = setInterval(() => void check(), PAIRED_CLOUD_CHECK_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [check]);

    return { check };
};
