import { useEffect, useRef } from 'react';

import { sessionSignal } from '@chatic/session';
import { reclaimOwnedClouds } from '../../socket/auth/reclaimOwnedClouds';

/**
 * Hands the runtime the clouds this account OWNS, so any of them the device holds as an invitee is
 * re-issued as the owner (`socket/auth/reclaimOwnedClouds`). Ownership is the app's to know — its
 * owned catalog — while which identity a cloud's token names is the runtime's.
 *
 * `alsoInvitedCloudIds` are the owned clouds this device has also cached as invited clouds: the ones
 * whose token may have been issued to the device's guest without leaving a mark on the token itself.
 * Only the app reads the invited cache, so it hands these over too.
 *
 * Runs on two triggers, because either can come second:
 *  - **the list changes** — a catalog that resolves after an invite token was already held, or one
 *    that changes after a sign-in to the owning account;
 *  - **a cloud token is committed** (`cloud:token`) — an invite entry committed after the catalog had
 *    already resolved, which no list change would ever follow. It also retries a failed renewal on
 *    the next commit. It cannot loop: a successful renewal removes what the check looks for, and the
 *    check itself is a storage read.
 *
 * The list is compared by content, so handing a fresh array on every render costs nothing.
 */
export const useReclaimOwnedClouds = (
    ownedCloudIds: readonly string[],
    alsoInvitedCloudIds: readonly string[]
): void => {
    const key = ownedCloudIds.join('\n');
    const invitedKey = alsoInvitedCloudIds.join('\n');
    // The commit listener outlives renders; it reads the latest lists rather than the ones it closed over.
    const latest = useRef({ key, invitedKey });
    latest.current = { key, invitedKey };

    useEffect(() => {
        if (!key) return;
        // Never throws: each renewal reports its own failure.
        void reclaimOwnedClouds(key.split('\n'), splitKey(invitedKey));
    }, [key, invitedKey]);

    useEffect(
        () =>
            sessionSignal.subscribe(['cloud:token'], () => {
                const current = latest.current;
                if (current.key) void reclaimOwnedClouds(current.key.split('\n'), splitKey(current.invitedKey));
            }),
        []
    );
};

const splitKey = (key: string): string[] => (key ? key.split('\n') : []);
