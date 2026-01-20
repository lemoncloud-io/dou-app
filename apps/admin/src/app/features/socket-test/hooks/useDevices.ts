import { useQuery } from '@tanstack/react-query';

import { fetchDeviceList } from '../api/deviceApi';

const REFETCH_INTERVAL_MS = 10000;

interface UseDevicesOptions {
    page?: number;
    limit?: number;
    status?: 'green' | 'yellow' | 'red';
    autoRefresh?: boolean;
}

export const useDevices = ({ page = 0, limit = 10, status, autoRefresh = true }: UseDevicesOptions = {}) => {
    return useQuery({
        queryKey: ['admin', 'devices', { page, limit, status }],
        queryFn: () => fetchDeviceList({ page, limit, status }),
        refetchInterval: autoRefresh ? REFETCH_INTERVAL_MS : false,
    });
};
