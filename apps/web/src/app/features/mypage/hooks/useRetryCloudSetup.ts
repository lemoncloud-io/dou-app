import { useQueryClient } from '@tanstack/react-query';

import { runtime } from '@chatic/app-runtime';
import { useCustomMutation } from '@chatic/shared';

import type { DomainCloud } from '@chatic/data';

/**
 * Asks the relay to set up a cloud whose setup failed, again.
 *
 * The catalog is re-read once the relay accepts, rather than patched with the returned row: the
 * catalog row is what every cloud screen reads its state from, and the relay is the one that moved
 * it back to provisioning. The re-read is awaited so the caller's success toast lands on a screen
 * that already shows the new state.
 */
export const useRetryCloudSetup = () => {
    const { cloud } = runtime.data.useRuntimeRepositories();
    const queryClient = useQueryClient();

    return useCustomMutation<DomainCloud, unknown, { id: string }>(async ({ id }) => {
        const retried = await cloud.retryCloudSetup(id);
        await queryClient.invalidateQueries({ queryKey: runtime.data.cloudsKeys.lists() });
        return retried;
    });
};
