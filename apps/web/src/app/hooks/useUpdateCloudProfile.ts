import { useMutation } from '@tanstack/react-query';

import { runtime } from '@chatic/runtime';

interface UpdateCloudProfileData {
    id: string;
    name: string;
}

export const useUpdateCloudProfile = () => {
    const { cloud } = runtime.data.useRuntimeRepositories();

    return useMutation({
        mutationFn: ({ id, name }: UpdateCloudProfileData) =>
            cloud.updateCloud({ id, name } as Parameters<typeof cloud.updateCloud>[0]),
    });
};
