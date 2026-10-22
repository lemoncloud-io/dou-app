/**
 * The statistics sampling policy the client reads at the start of each run.
 *
 * Declared structurally, like `LogBatchWireBody`: `@chatic/logger` parses and validates it
 * (`parseTelemetryPolicy`), but this lib imports nothing from `@chatic/*`, so the shape is restated
 * here as the server is expected to serve it. Every field is optional on the wire — the parser, not
 * this type, decides what a usable policy is.
 */
export interface TelemetryPolicyWireBody {
    version?: number;
    ttlSec?: number;
    /** `false` switches statistics off. Logs are not affected. */
    enabled?: boolean;
    defaults?: { perf?: number; usage?: number };
    rules?: { match?: Record<string, string>; rate?: number }[];
    /** ISO-8601 `until`; an override without one is ignored. */
    force?: { uid?: string; runId?: string; until?: string }[];
}

/**
 * Where the policy comes from.
 *
 * **There is no server route yet**, so the one implementation is {@link createStaticTelemetryPolicyHttpGateway},
 * which answers with a fixed document. Hosts are wired against this port now, and the HTTP
 * implementation replaces the static one when the route exists — nothing above the port changes.
 */
export interface TelemetryPolicyHttpGateway {
    getTelemetryPolicy(): Promise<TelemetryPolicyWireBody>;
}

/**
 * Statistics off: what a client that never reached the server uses too, so wiring the stand-in
 * changes nothing on the wire.
 */
export const DISABLED_TELEMETRY_POLICY_WIRE: Readonly<TelemetryPolicyWireBody> = Object.freeze({
    version: 0,
    enabled: false,
});

/**
 * The stand-in until the server serves a policy: always answers `policy`, statistics off by default.
 * A test or a local experiment passes its own document to turn statistics on without a server.
 */
export const createStaticTelemetryPolicyHttpGateway = (
    policy: TelemetryPolicyWireBody = DISABLED_TELEMETRY_POLICY_WIRE
): TelemetryPolicyHttpGateway => ({
    getTelemetryPolicy: async () => policy,
});
