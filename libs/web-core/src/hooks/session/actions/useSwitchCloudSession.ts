import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';

import { switchCloudSession } from '../../../session';

/**
 * Stable key for the cloud-switch mutation. Exported so a global observer (e.g. the
 * background sync runner) can detect an in-flight switch via `useIsMutating` — the
 * mutation's own `isPending` is per-hook-instance and not visible across components.
 */
export const SWITCH_CLOUD_MUTATION_KEY = ['session', 'switch-cloud'] as const;

/**
 * Switches the active cloud session through session services.
 */
export const useSwitchCloudSession = () => {
    const mutation = useMutation({
        mutationKey: SWITCH_CLOUD_MUTATION_KEY,
        mutationFn: (cloudId: string) => switchCloudSession({ cloudId }),
    });

    return {
        switchCloud: useCallback((cloudId: string) => mutation.mutateAsync(cloudId), [mutation]),
        isPending: mutation.isPending,
    };
};
