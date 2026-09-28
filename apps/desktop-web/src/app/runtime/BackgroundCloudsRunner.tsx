import { useMemo } from 'react';

import { runtime } from '@chatic/app-runtime';

import { useClouds } from '../shared';

/**
 * Hands the runtime every cloud on the rail — owned, invited, just joined — so each keeps a socket
 * session while the user is in another one or at Home. The rail is this shell's one merge of cloud
 * membership, so it is the list; Home is the relay, which has its own slot. Which clouds actually get
 * a socket (the cap, the order) is the runtime's decision.
 */
export const BackgroundCloudsRunner = () => {
    const { clouds } = useClouds();
    const cids = useMemo(() => clouds.filter(cloud => cloud.kind !== 'home').map(cloud => cloud.id), [clouds]);
    runtime.connection.useBackgroundClouds(cids);
    return null;
};
