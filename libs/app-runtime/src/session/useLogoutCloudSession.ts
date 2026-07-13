import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';

import { logoutCloudViaSocket } from '../socket/auth';

/**
 * Leaves the active cloud via app-runtime's `logoutCloudViaSocket`: best-effort cloud-socket
 * `auth.logout` then the web-core cloud store clear (which drops the cloud slot, keeping relay).
 * Notifies the cloud socket so its auth session ends.
 */
export const useLogoutCloudSession = () => {
    const mutation = useMutation({
        mutationFn: () => logoutCloudViaSocket(),
    });

    // Key the memo on the stable mutateAsync, not the per-render mutation object (see useSiteSwitch).
    const { mutateAsync } = mutation;

    return {
        logoutCloudSession: useCallback(() => mutateAsync(), [mutateAsync]),
        isLoggingOutCloudSession: mutation.isPending,
    };
};
