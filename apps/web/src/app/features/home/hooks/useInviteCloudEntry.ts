import { useCallback } from 'react';

import { useSiteSwitch, useSwitchCloudSession } from '@chatic/web-core';
import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

/**
 * Enters the invited cloud/site from a login token. Cloud and site identifiers come from the token
 * returned by the invite login (not the deeplink), so this step is decoupled from authentication.
 */
export const useInviteCloudEntry = () => {
    const { switchCloud, isPending: isSwitchingCloud } = useSwitchCloudSession();
    const { switchSite, isSwitching: isSwitchingSite } = useSiteSwitch();

    const enterInvitedCloud = useCallback(
        async (token: UserTokenView): Promise<void> => {
            if (token.cloudId) {
                await switchCloud(token.cloudId)
            }
        },
        [switchCloud, switchSite]
    );

    return { enterInvitedCloud, isEntering: isSwitchingCloud || isSwitchingSite };
};
