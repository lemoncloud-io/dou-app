import { useMemo } from 'react';

import { runtime } from '@chatic/runtime';

import { useClouds } from '../shared';

export const BackgroundCloudsRunner = () => {
    const { clouds, ownedAlsoInvitedIds } = useClouds();
    const cids = useMemo(() => clouds.filter(cloud => cloud.kind !== 'home').map(cloud => cloud.id), [clouds]);
    const ownedCids = useMemo(() => clouds.filter(cloud => cloud.kind === 'owned').map(cloud => cloud.id), [clouds]);
    runtime.connection.useBackgroundClouds(cids);
    runtime.connection.useReclaimOwnedClouds(ownedCids, ownedAlsoInvitedIds);
    return null;
};
