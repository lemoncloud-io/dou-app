import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';

import { switchSiteSession } from '../../../session';

/**
 * Switches the active site. Optimistically pre-applies the target sid (cached channel
 * streams swap immediately), commits via the cloud session refresh, and rolls the sid
 * back to the previous site if the refresh fails.
 */
export const useSiteSwitch = () => {
    const mutation = useMutation({
        mutationFn: (siteId: string) => switchSiteSession(siteId),
    });

    return {
        switchSite: useCallback((siteId: string) => mutation.mutateAsync(siteId), [mutation]),
        isSwitching: mutation.isPending,
    };
};
