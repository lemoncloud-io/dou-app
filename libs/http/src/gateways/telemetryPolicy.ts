export interface TelemetryPolicyWireBody {
    version?: number;
    ttlSec?: number;
    enabled?: boolean;
    defaults?: { perf?: number; usage?: number };
    rules?: { match?: Record<string, string>; rate?: number }[];
    force?: { uid?: string; runId?: string; until?: string }[];
}

export interface TelemetryPolicyHttpGateway {
    getTelemetryPolicy(): Promise<TelemetryPolicyWireBody>;
}

export const DISABLED_TELEMETRY_POLICY_WIRE: Readonly<TelemetryPolicyWireBody> = Object.freeze({
    version: 0,
    enabled: false,
});

export const createStaticTelemetryPolicyHttpGateway = (
    policy: TelemetryPolicyWireBody = DISABLED_TELEMETRY_POLICY_WIRE
): TelemetryPolicyHttpGateway => ({
    getTelemetryPolicy: async () => policy,
});
