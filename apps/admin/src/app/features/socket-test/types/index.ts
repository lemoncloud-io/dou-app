export type DeviceStatus = 'online' | 'away' | 'offline';

export type FilterStatus = DeviceStatus | 'all';

export interface DeviceView {
    deviceId: string;
    deviceName?: string;
    status: DeviceStatus;
    connectedAt?: string;
    lastActivityAt?: string;
    remote?: string;
    domain?: string;
    platform?: string;
}

export interface DeviceListResponse {
    list: DeviceView[];
    total: number;
}
