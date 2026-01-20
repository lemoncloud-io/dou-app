import { useMutation } from '@tanstack/react-query';

import { disconnectDevice } from '../api/deviceApi';

interface UseDisconnectDeviceParams {
    connId: string;
    reason?: string;
    disconnectCode?: number;
    force?: boolean;
}

export const useDisconnectDevice = () => {
    return useMutation({
        mutationFn: (params: UseDisconnectDeviceParams) => disconnectDevice(params),
    });
};
