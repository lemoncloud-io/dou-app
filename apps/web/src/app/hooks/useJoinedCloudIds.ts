import { useMemo } from 'react';

import { RELAY_CLOUD_ID, type DomainCloud } from '@chatic/runtime';

const isReachable = (cloud: DomainCloud): boolean => !cloud.status || cloud.status === 'active';

export const useJoinedCloudIds = (
    ownedClouds: readonly DomainCloud[],
    invitedClouds: readonly DomainCloud[]
): readonly string[] => {
    const ids = new Set<string>();
    for (const cloud of [...ownedClouds, ...invitedClouds]) {
        if (cloud.id && cloud.id !== RELAY_CLOUD_ID && isReachable(cloud)) ids.add(cloud.id);
    }
    const key = [...ids].join('\n');
    return useMemo(() => (key ? key.split('\n') : []), [key]);
};
