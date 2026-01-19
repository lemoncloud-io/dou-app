/** Device connection status: green=online, yellow=away, red=offline */
export type DeviceStatus = 'green' | 'yellow' | 'red';

export type FilterStatus = DeviceStatus | 'all';

export interface DeviceView {
    id: string;
    name: string;
    status: DeviceStatus;
    platform: string;
    connId: string;
    tick: number;
    createdAt: number;
    updatedAt: number;
    deletedAt: number;
    connectedAt: number;
    disconnectedAt: number;
    lastActiveAt?: number;
    $?: Record<string, unknown>;
}

export interface DeviceListResponse {
    list: DeviceView[];
    total: number;
    limit: number;
    page: number;
}
