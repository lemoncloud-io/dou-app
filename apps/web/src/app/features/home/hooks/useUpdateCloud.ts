import { useMutation } from '@tanstack/react-query';

import type { CloudBody } from '@lemoncloud/chatic-backend-api';

import { useRuntimeRepositories } from '@chatic/app-runtime';

/**
 * Updates a cloud entity (e.g. its name) through the Cloud domain socket action.
 * This edits the cloud organization itself, not the current user's profile.
 * Replaces the former HTTP `PUT /clouds/{cloudId}` call. The `{ id, body }`
 * signature is preserved so existing call sites stay unchanged.
 */
export const useUpdateCloud = () => {
    const { cloud } = useRuntimeRepositories();

    return useMutation({
        mutationFn: ({ id, body }: { id: string; body: CloudBody }) =>
            cloud.updateCloud({ id, ...body } as Parameters<typeof cloud.updateCloud>[0]),
    });
};
