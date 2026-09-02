/**
 * `api/deviceApi.ts`
 * - 실제 서버 디바이스 목록(signed).
 */
import { webTransport } from '@chatic/app-runtime';

export type DeviceStatus = 'green' | 'yellow' | 'red';

export interface DeviceListItem {
    id: string;
    name: string | null;
    status: DeviceStatus;
    platform: string;
    connId: string;
    tick: number;
    connectedAt: number;
    updatedAt: number;
}

export interface DeviceListResponse {
    list: DeviceListItem[];
    total: number;
    limit: number;
    page: number;
    aggr?: { status?: { green?: number; yellow?: number; red?: number } };
}

export interface FetchDeviceListParams {
    page?: number;
    limit?: number;
    status?: DeviceStatus;
}

const getSocketApiEndpoint = (): string => `${import.meta.env.VITE_BACKEND_ENDPOINT ?? ''}`.replace('/d1', '');

export const fetchDeviceList = async ({
    page = 0,
    limit = 20,
    status,
}: FetchDeviceListParams = {}): Promise<DeviceListResponse> => {
    const { data } = await webTransport
        .buildSignedRequest({
            method: 'GET',
            baseURL: `${getSocketApiEndpoint()}/skt-d1/hello/device/list`,
        })
        .setParams({ page, limit, ...(status && { status }) })
        .execute<DeviceListResponse>();
    return data;
};
