import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';

import { switchCloudSession } from '../../../session';

/**
 * Switches the active cloud session through session services.
 */
export const useSwitchCloudSession = () => {
    const mutation = useMutation({
        mutationFn: (cloudId: string) => switchCloudSession({ cloudId }),
    });

    return {
        switchCloud: useCallback((cloudId: string) => mutation.mutateAsync(cloudId), [mutation]),
        isPending: mutation.isPending,
    };
};
