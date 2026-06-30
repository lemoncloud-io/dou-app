/**
 * `api/deviceApi.ts`
 * - 실제 서버 디바이스 목록(signed). web-core가 device list API를 제공하지 않아 admin 패턴을
 *   webTransport.buildSignedRequest로 재현. 조회 전용.
 */
import { webTransport } from '@chatic/web-core';

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

/** socket API base = VITE_BACKEND_ENDPOINT에서 stage suffix(/d1) 제거 후 /skt-d1 경로 사용(admin과 동일). */
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
