import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';

import { logoutCloudSession } from '../../../session';

/**
 * Clears the active cloud session while keeping relay authentication intact.
 */
export const useLogoutCloudSession = () => {
    const mutation = useMutation({
        mutationFn: async () => {
            logoutCloudSession();
        },
    });

    return {
        logoutCloudSession: useCallback(() => mutation.mutateAsync(), [mutation]),
        isLoggingOutCloudSession: mutation.isPending,
    };
};
