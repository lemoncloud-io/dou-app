import { runtime } from '@chatic/app-runtime';

import { useCloudSessionCatalog } from '../hooks/useCloudCatalog';
import { useInvitedClouds } from '../hooks/useInvitedClouds';
import { useJoinedCloudIds } from '../hooks/useJoinedCloudIds';

/**
 * Hands the runtime every cloud this account belongs to, so each keeps a socket session while the
 * user is in another one — or at home. Which of them actually get a socket (the cap, the order) is
 * the runtime's decision; this only supplies membership, which only the app can see.
 */
export const BackgroundCloudsRunner = () => {
    const { clouds: ownedClouds } = useCloudSessionCatalog();
    const { invitedClouds } = useInvitedClouds();
    runtime.connection.useBackgroundClouds(useJoinedCloudIds(ownedClouds, invitedClouds));
    return null;
};
