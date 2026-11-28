import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';

import { logoutCloudSessionMutation } from '@chatic/runtime/api/session';

export const useLogoutCloudSession = () => {
    const mutation = useMutation({ mutationFn: logoutCloudSessionMutation.mutationFn });

    const { mutateAsync } = mutation;

    return {
        logoutCloudSession: useCallback(() => mutateAsync(), [mutateAsync]),
        isLoggingOutCloudSession: mutation.isPending,
    };
};
