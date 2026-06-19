import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';

import { getActiveServerContext } from '../../../session/contexts';
import { refreshCloudSession } from '../../../session/services';

/**
 * Refreshes the current active cloud session without switching sites.
 * Reads the active siteId from session context at call time and re-issues
 * a cloud token for it. Use useRefreshCloudSiteSession to switch to a different site.
 */
export const useRefreshCurrentCloudSession = () => {
    const mutation = useMutation({
        mutationFn: () => {
            const { siteId } = getActiveServerContext();
            if (!siteId) throw new Error('No active siteId to refresh');
            return refreshCloudSession({ siteId });
        },
    });

    return {
        refreshCurrentCloudSession: useCallback(() => mutation.mutateAsync(), [mutation]),
        isRefreshingCloudSession: mutation.isPending,
    };
};
