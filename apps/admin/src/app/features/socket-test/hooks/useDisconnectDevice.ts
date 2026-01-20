import { useMutation } from '@tanstack/react-query';

import { disconnectDevice } from '../api/deviceApi';

import type { ConnectionBody } from '../types';

interface UseDisconnectDeviceParams {
    cid: string;
    body?: ConnectionBody;
    force?: boolean;
}

export const useDisconnectDevice = () => {
    return useMutation({
        mutationFn: ({ cid, body, force }: UseDisconnectDeviceParams) => disconnectDevice({ cid, body, force }),
        // WebSocket handles real-time updates via setQueriesData in useDevices
    });
};
