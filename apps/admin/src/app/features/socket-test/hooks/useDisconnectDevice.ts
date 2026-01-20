import { useMutation, useQueryClient } from '@tanstack/react-query';

import { disconnectDevice } from '../api/deviceApi';

import type { ConnectionBody } from '../types';

interface UseDisconnectDeviceParams {
    cid: string;
    body?: ConnectionBody;
    force?: boolean;
}

export const useDisconnectDevice = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ cid, body, force }: UseDisconnectDeviceParams) => disconnectDevice({ cid, body, force }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['admin', 'devices'] });
        },
    });
};
