import { useMemo } from 'react';

import { runtime } from '@chatic/app-runtime';

import { useClouds } from '../shared';

/**
 * Hands the runtime every cloud on the rail — owned, invited, just joined — so each keeps a socket
 * session while the user is in another one or at Home. The rail is this shell's one merge of cloud
 * membership, so it is the list; Home is the relay, which has its own slot. Which clouds actually get
 * a socket (the cap, the order) is the runtime's decision.
 *
 * The owned ones go over a second time on their own, with the ones also cached as invited: an owned
 * cloud this device holds as an invitee (a guest here accepted its invite, then signed in to the
 * account that owns it) is re-issued as the owner. Without it the owner keeps entering their own
 * cloud as the guest's member.
 */
export const BackgroundCloudsRunner = () => {
    const { clouds, ownedAlsoInvitedIds } = useClouds();
    const cids = useMemo(() => clouds.filter(cloud => cloud.kind !== 'home').map(cloud => cloud.id), [clouds]);
    const ownedCids = useMemo(() => clouds.filter(cloud => cloud.kind === 'owned').map(cloud => cloud.id), [clouds]);
    runtime.connection.useBackgroundClouds(cids);
    runtime.connection.useReclaimOwnedClouds(ownedCids, ownedAlsoInvitedIds);
    return null;
};
