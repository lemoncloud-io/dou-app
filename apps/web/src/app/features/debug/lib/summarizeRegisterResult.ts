import type { RegisterDeviceResult } from '@lemoncloud/chatic-pushes-api';

export interface RegistrationSummary {
    registered: boolean;
    status?: string;
    endpoint?: string;
    registeredAt?: number;
    deviceId?: string;
}

interface RegisterDeviceResponseShape {
    endpoint?: string;
    status?: string;
    updatedAt?: number;
    registeredAt?: number;
    deviceId?: string;
    Device?: unknown;
    User?: { endpoint?: string; registeredAt?: number; deviceId?: string };
}

export const summarizeRegisterResult = (result: RegisterDeviceResult | null | undefined): RegistrationSummary => {
    const r = (result ?? {}) as RegisterDeviceResponseShape;
    const endpoint = r.endpoint ?? r.User?.endpoint;

    return {
        registered: r.status === 'active' || Boolean(endpoint) || Boolean(r.Device),
        status: r.status,
        endpoint,
        registeredAt: r.updatedAt ?? r.registeredAt ?? r.User?.registeredAt,
        deviceId: r.deviceId ?? r.User?.deviceId,
    };
};
