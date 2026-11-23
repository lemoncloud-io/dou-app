import { runtime, type DomainCloud } from '@chatic/runtime';
import { useCustomMutation } from '@chatic/shared';

export const useDeleteCloud = () => {
    const { cloud } = runtime.data.useRuntimeRepositories();

    return useCustomMutation<DomainCloud, string, { id: string; cascade?: boolean }>(({ id, cascade }) =>
        cloud.releaseCloud(id, { cascade })
    );
};
