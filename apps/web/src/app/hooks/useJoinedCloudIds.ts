import { useMemo } from 'react';

import { RELAY_CLOUD_ID, type DomainCloud } from '@chatic/runtime';

export const useJoinedCloudIds = (
    ownedClouds: readonly DomainCloud[],
    invitedClouds: readonly DomainCloud[]
): readonly string[] => {
    const ids = new Set<string>();
    for (const cloud of [...ownedClouds, ...invitedClouds]) {
        if (cloud.id && cloud.id !== RELAY_CLOUD_ID) ids.add(cloud.id);
    }
    const key = [...ids].join('\n');
    return useMemo(() => (key ? key.split('\n') : []), [key]);
};
