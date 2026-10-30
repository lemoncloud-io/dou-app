import { useEffect, useRef, useSyncExternalStore } from 'react';

import { issueCloudTokens, BackgroundCloudTokens } from '@chatic/auth';
import { getSocketSlotContext } from '@chatic/session';
import { backgroundClouds, isLinkKnownDown, getSocketManager } from '@chatic/transport';
import { currentBackgroundSelection, liveBackgroundReadiness } from '../utils/backgroundSlots';
import { subscribeSlotSignals } from '../utils/slotSignals';

const createPreparer = (): BackgroundCloudTokens =>
    new BackgroundCloudTokens({
        ...liveBackgroundReadiness,
        issue: cid => issueCloudTokens(cid, { allowCache: false }),
        onIssued: () => backgroundClouds.invalidate(),
        takeExpired: cid => backgroundClouds.takeExpired(cid),
        isOnline: () => !isLinkKnownDown(),
        now: () => Date.now(),
        setTimer: (run, ms) => setTimeout(run, ms),
        clearTimer: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
    });

/**
 * Keeps the background clouds' tokens ready before their slots boot (see `BackgroundCloudTokens`).
 * Re-checks whenever the answer could have moved: the app's list or the token cache (the background
 * version), the committed cloud (the slot signals), and a slot binding or going away — a cloud whose
 * slot was just torn down is the preparer's again, and that is decided by the manager, not by any
 * store this hook renders from.
 *
 * `enabled` is whether a relay session exists — every cloud token is minted from it.
 */
export const useBackgroundCloudTokens = (enabled: boolean): void => {
    const version = useSyncExternalStore(
        backgroundClouds.subscribe,
        backgroundClouds.getVersion,
        backgroundClouds.getVersion
    );
    const session = useSyncExternalStore(subscribeSlotSignals, getSocketSlotContext, getSocketSlotContext);
    const preparerRef = useRef<BackgroundCloudTokens | null>(null);
    const enabledRef = useRef(enabled);
    enabledRef.current = enabled;

    // Declared first so the preparer exists when the sync effect below runs in the same commit.
    useEffect(() => {
        const preparer = createPreparer();
        preparerRef.current = preparer;
        const unsubscribe = getSocketManager().subscribeSlotClients(() =>
            preparer.sync(enabledRef.current ? currentBackgroundSelection() : [])
        );
        return () => {
            unsubscribe();
            preparer.dispose();
            preparerRef.current = null;
        };
    }, []);

    useEffect(() => {
        preparerRef.current?.sync(enabled ? currentBackgroundSelection() : []);
    }, [enabled, version, session]);
};
