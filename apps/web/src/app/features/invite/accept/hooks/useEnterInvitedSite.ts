import { useCallback } from 'react';

import { useSiteSwitch } from '../../../../runtime/useSiteSwitch';

/**
 * Step 2 of invite entry: switch into the invited place. The caller resolves which place that is
 * (the invite does not always name one — see useInviteAccept); with none, this does nothing. Runs
 * after the cloud switch so the target site resolves against the already-active cloud session.
 */
export const useEnterInvitedSite = () => {
    const { switchSite, isSwitching: isEnteringSite } = useSiteSwitch();

    const enterSite = useCallback(
        async (siteId?: string): Promise<void> => {
            if (!siteId) return;
            await switchSite(siteId);
        },
        [switchSite]
    );

    return { enterSite, isEnteringSite };
};
