import { useCallback } from 'react';

import { useSiteSwitch } from '../../../../runtime/useSiteSwitch';

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
