import type { RegisterDeviceResult } from '@lemoncloud/chatic-pushes-api';

/** Human-readable verdict derived from a register-device server response. */
export interface RegistrationSummary {
    /** True when the server has an active push endpoint for this device. */
    registered: boolean;
    /** Registration status reported by the server (e.g. `active`). */
    status?: string;
    /** SNS endpoint ARN registered for the device, when present. */
    endpoint?: string;
    /** Timestamp of the last registration/update (server-defined unit), when present. */
    registeredAt?: number;
    /** Device id recorded on the server, when present. */
    deviceId?: string;
}

/**
 * The runtime `register-device` response is flatter than the published
 * `RegisterDeviceResult` type: `endpoint`/`status`/`updatedAt`/`deviceId` come
 * back at the top level. We read both the flat shape and the legacy nested
 * (`User.*`) shape defensively so the verdict is correct either way.
 */
interface RegisterDeviceResponseShape {
    endpoint?: string;
    status?: string;
    updatedAt?: number;
    registeredAt?: number;
    deviceId?: string;
    Device?: unknown;
    User?: { endpoint?: string; registeredAt?: number; deviceId?: string };
}

/**
 * Interprets a `register-device` response into display facts for the debug UI.
 *
 * The backend has no read-only "is my device registered" endpoint, so the debug
 * surfaces confirm registration by (idempotently) calling register-device and
 * reading the response. `status === 'active'` (or a present SNS `endpoint`) is
 * the signal that the device is actually wired up for push.
 */
export const summarizeRegisterResult = (
    result: RegisterDeviceResult | null | undefined
): RegistrationSummary => {
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
