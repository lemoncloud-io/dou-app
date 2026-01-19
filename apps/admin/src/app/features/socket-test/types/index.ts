export type DeviceStatus = 'green' | 'yellow' | 'red';

export type FilterStatus = DeviceStatus | 'all';

export interface DeviceView {
    id: string;
    name: string | null;
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

export interface DeviceStatusAggr {
    green?: number;
    yellow?: number;
    red?: number;
}

export interface DeviceListResponse {
    list: DeviceView[];
    total: number;
    limit: number;
    page: number;
    aggr?: {
        status: DeviceStatusAggr;
    };
}
