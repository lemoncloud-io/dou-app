import { webCore } from '@chatic/web-core';

import type { DeviceListResponse } from '../types';

const getSocketApiEndpoint = () => {
    const backendEndpoint = import.meta.env.VITE_BACKEND_ENDPOINT || '';
    return backendEndpoint.replace('/d1', '');
};

export const fetchDeviceList = async (): Promise<DeviceListResponse> => {
    const { data } = await webCore
        .buildSignedRequest({
            method: 'GET',
            baseURL: `${getSocketApiEndpoint()}/skt-d1/devices/0/list`,
        })
        .setParams({ view: 'admin' })
        .execute<DeviceListResponse>();
    return data;
};
