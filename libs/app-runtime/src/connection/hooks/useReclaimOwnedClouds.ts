import { useEffect, useRef } from 'react';

import { sessionSignal } from '../../session/store';
import { reclaimOwnedClouds } from '../../socket/auth/reclaimOwnedClouds';
import { backgroundClouds } from '../../socket/backgroundClouds';

/**
 * Hands the runtime the clouds this account OWNS, so any of them the device holds as an invitee is
 * re-issued as the owner (`socket/auth/reclaimOwnedClouds`). Ownership is the app's to know — its
 * owned catalog — while which identity a cloud's token names is the runtime's.
 *
 * Runs on four triggers, because any of them can come last:
 *  - **the list changes** — a catalog that resolves after an invite token was already held, or one
 *    that changes after a sign-in to the owning account;
 *  - **a cloud token is committed** (`cloud:token`) — an invite entry committed after the catalog had
 *    already resolved, which no list change would ever follow;
 *  - **the relay token changes** (`relay:token`) — a sign-in to an account whose owned list happens
 *    to read the same, which leaves the list key unchanged;
 *  - **the background-cloud store announces** — for an issue started before a sign-in and answered
 *    after it, which writes the previous user's token with no signal of its own. The store also
 *    announces holds, joined-list changes and expiries; each costs a storage read here.
 *
 * Each also retries a failed renewal. None can loop: a successful renewal stamps the entry with the
 * user now signed in, which is what the check looks for, and the check itself is a storage read.
 *
 * The list is compared by content, so handing a fresh array on every render costs nothing.
 */
export const useReclaimOwnedClouds = (ownedCloudIds: readonly string[]): void => {
    const key = ownedCloudIds.join('\n');
    // The commit listener outlives renders; it reads the latest list rather than the one it closed over.
    const latest = useRef(key);
    latest.current = key;

    useEffect(() => {
        if (!key) return;
        // Never throws: each renewal reports its own failure.
        void reclaimOwnedClouds(key.split('\n'));
    }, [key]);

    useEffect(() => {
        const reclaimLatest = () => {
            if (latest.current) void reclaimOwnedClouds(latest.current.split('\n'));
        };
        const offSession = sessionSignal.subscribe(['cloud:token', 'relay:token'], reclaimLatest);
        const offBackground = backgroundClouds.subscribe(reclaimLatest);
        return () => {
            offSession();
            offBackground();
        };
    }, []);
};
