import { useQuery } from '@tanstack/react-query';

import { fetchDeviceList, type FetchDeviceListParams } from '../api/deviceApi';

/** 실제 서버 디바이스 목록 조회(signed). 조회 전용 — refetch로 갱신. */
export const useDeviceList = (params: FetchDeviceListParams = {}) =>
    useQuery({
        queryKey: ['admin-v2', 'device-list', params],
        queryFn: () => fetchDeviceList(params),
        refetchOnWindowFocus: false,
    });
