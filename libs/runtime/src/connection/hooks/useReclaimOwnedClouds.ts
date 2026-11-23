import { useEffect } from 'react';

import { runtimeConnection } from '@chatic/runtime-client';

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
