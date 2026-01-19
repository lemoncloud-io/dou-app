import { useQuery } from '@tanstack/react-query';

import { fetchDeviceList } from '../api/deviceApi';

const REFETCH_INTERVAL_MS = 10000;

export const useDevices = () => {
    return useQuery({
        queryKey: ['admin', 'devices'],
        queryFn: fetchDeviceList,
        refetchInterval: REFETCH_INTERVAL_MS,
    });
};
