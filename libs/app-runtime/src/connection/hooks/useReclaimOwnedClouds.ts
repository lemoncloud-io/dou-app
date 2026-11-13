import { useEffect } from 'react';

import { runtimeConnection } from '../connectionCommands';

/**
 * Hands the runtime the clouds this account OWNS, so any of them the device holds as an invitee is
 * re-issued as the owner (the engine's `setOwnedClouds`). Ownership is the app's to know — its owned
 * catalog — while which identity a cloud's token names is the runtime's.
 *
 * `alsoInvitedCloudIds` are the owned clouds this device has also cached as invited clouds: the ones
 * whose token may have been issued to the device's guest without leaving a mark on the token itself.
 * Only the app reads the invited cache, so it hands these over too.
 *
 * The runtime re-issues when the lists change and again whenever a cloud token is committed — either
 * can come second. Unmounting withdraws the lists. They are compared by content, so handing fresh
 * arrays on every render costs nothing.
 */
export const useReclaimOwnedClouds = (
    ownedCloudIds: readonly string[],
    alsoInvitedCloudIds: readonly string[]
): void => {
    const key = ownedCloudIds.join('\n');
    const invitedKey = alsoInvitedCloudIds.join('\n');

    useEffect(() => {
        runtimeConnection().setOwnedClouds(splitKey(key), splitKey(invitedKey));
    }, [key, invitedKey]);

    useEffect(() => () => runtimeConnection().setOwnedClouds([], []), []);
};

const splitKey = (key: string): string[] => (key ? key.split('\n') : []);
