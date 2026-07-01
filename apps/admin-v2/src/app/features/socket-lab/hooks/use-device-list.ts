import { useQuery } from '@tanstack/react-query';

import { fetchDeviceList, type FetchDeviceListParams } from '../api/deviceApi';

export const useDeviceList = (params: FetchDeviceListParams = {}) =>
    useQuery({
        queryKey: ['admin-v2', 'device-list', params],
        queryFn: () => fetchDeviceList(params),
        refetchOnWindowFocus: false,
    });
