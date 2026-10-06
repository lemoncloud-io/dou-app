import { runtime } from '@chatic/app-runtime';

import { useCloudSessionCatalog } from '../hooks/useCloudCatalog';
import { useInvitedClouds } from '../hooks/useInvitedClouds';
import { useJoinedCloudIds } from '../hooks/useJoinedCloudIds';

/**
 * Hands the runtime every cloud this account belongs to, so each keeps a socket session while the
 * user is in another one — or at home. Which of them actually get a socket (the cap, the order) is
 * the runtime's decision; this only supplies membership, which only the app can see.
 *
 * The owned ones go over a second time on their own: an owned cloud this device holds as an invitee
 * (its owner accepted their own invite link here) is re-issued as the owner. Sharing this runner
 * keeps both lists read from the one catalog the switcher shows.
 */
export const BackgroundCloudsRunner = () => {
    const { clouds: ownedClouds } = useCloudSessionCatalog();
    const { invitedClouds } = useInvitedClouds();
    runtime.connection.useBackgroundClouds(useJoinedCloudIds(ownedClouds, invitedClouds));
    runtime.connection.useReclaimOwnedClouds(useJoinedCloudIds(ownedClouds, []));
    return null;
};
