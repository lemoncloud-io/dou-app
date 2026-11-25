import { useQueryClient } from '@tanstack/react-query';

import { runtime, type DomainCloud } from '@chatic/runtime-react';
import { useCustomMutation } from '@chatic/shared';

export const useRetryCloudSetup = () => {
    const { cloud } = runtime.data.useRuntimeRepositories();
    const queryClient = useQueryClient();

    return useCustomMutation<DomainCloud, unknown, { id: string }>(async ({ id }) => {
        const retried = await cloud.retryCloudSetup(id);
        await queryClient.invalidateQueries({ queryKey: runtime.data.cloudsKeys.lists() });
        return retried;
    });
};
