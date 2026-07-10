import { useCallback } from 'react';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

import { useSiteSwitch } from '../../../runtime/useSiteSwitch';

/**
 * Step 2 of invite entry: switch into the invited site when the invite carries a `siteId`.
 * No-ops when absent. Runs after the cloud switch so the target site resolves against the
 * already-active cloud session.
 */
export const useEnterInvitedSite = () => {
    const { switchSite, isSwitching: isEnteringSite } = useSiteSwitch();

    const enterSite = useCallback(
        async (info?: MyInviteView): Promise<void> => {
            if (!info?.siteId) return;
            await switchSite(info.siteId);
        },
        [switchSite]
    );

    return { enterSite, isEnteringSite };
};
