import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';

import { logoutCloudViaSocket } from '@chatic/app-runtime';

/**
 * Leaves the active cloud via app-runtime's `logoutCloudViaSocket`: best-effort cloud-socket
 * `auth.logout` then the web-core cloud store clear (which drops the cloud slot, keeping relay).
 * Drop-in for the legacy web-core `useLogoutCloudSession` — apps/web uses this one so the cloud
 * socket is notified; admin/desktop-web keep the web-core hook.
 */
export const useLogoutCloudSession = () => {
    const mutation = useMutation({
        mutationFn: () => logoutCloudViaSocket(),
    });

    return {
        logoutCloudSession: useCallback(() => mutation.mutateAsync(), [mutation]),
        isLoggingOutCloudSession: mutation.isPending,
    };
};
