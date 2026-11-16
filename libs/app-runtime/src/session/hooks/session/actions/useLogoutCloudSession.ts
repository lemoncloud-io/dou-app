import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';

import { sessionCommands } from '../../../sessionCommands';

/**
 * Leaves the active cloud through the engine's `logoutCloud` command: best-effort cloud-socket
 * `auth.logout` then the web-core cloud store clear (which drops the cloud slot, keeping relay).
 * Notifies the cloud socket so its auth session ends.
 */
export const useLogoutCloudSession = () => {
    const mutation = useMutation({
        mutationFn: () => sessionCommands().logoutCloud(),
    });

    // Key the memo on the stable mutateAsync, not the per-render mutation object (see useSiteSwitch).
    const { mutateAsync } = mutation;

    return {
        logoutCloudSession: useCallback(() => mutateAsync(), [mutateAsync]),
        isLoggingOutCloudSession: mutation.isPending,
    };
};
