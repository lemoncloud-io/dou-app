import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';

import { refreshCloudSession } from '../../../session';

/**
 * Refreshes the active cloud site session by requesting a new cloud token for the target site.
 */
export const useRefreshCloudSiteSession = () => {
    const mutation = useMutation({
        mutationFn: (siteId: string) => refreshCloudSession({ siteId }),
    });

    return {
        refreshSiteSession: useCallback((siteId: string) => mutation.mutateAsync(siteId), [mutation]),
        isRefreshingCloudToken: mutation.isPending,
    };
};
