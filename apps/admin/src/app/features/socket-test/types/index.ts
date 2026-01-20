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

// WebSocket message envelope for device updates
export interface WSSEnvelope<T> {
    mid: string;
    type: 'system';
    action: 'updated' | 'created' | 'deleted';
    payload: T;
    meta: {
        ts: number;
        channel: string;
    };
}

// Device payload from WebSocket (includes 'type' field)
export interface DevicePayload extends DeviceView {
    ns: string;
    type: 'device';
    count?: number;
}

// Disconnect request body
export interface ConnectionBody {
    reason?: string;
    disconnectCode?: number;
}

// Disconnect response
export interface ConnectionView {
    id?: string;
    connId?: string;
    disconnectedAt?: number;
}
