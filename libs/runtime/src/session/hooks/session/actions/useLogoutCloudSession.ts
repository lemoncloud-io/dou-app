import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';

import { sessionCommands } from '@chatic/runtime-client';

export const useLogoutCloudSession = () => {
    const mutation = useMutation({
        mutationFn: () => sessionCommands().logoutCloud(),
    });

    const { mutateAsync } = mutation;

    return {
        logoutCloudSession: useCallback(() => mutateAsync(), [mutateAsync]),
        isLoggingOutCloudSession: mutation.isPending,
    };
};
