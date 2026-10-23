import { DEFAULT_TELEMETRY_POLICY, parseTelemetryPolicy } from '@chatic/bridges';

import type { TelemetryPolicy } from '@chatic/bridges';

/**
 * Where the sampling policy comes from.
 *
 * The server has no route for it yet, so the source the app wires answers "statistics off" — the
 * same document a run that never reached the server uses. When the route exists, the source becomes
 * the `@chatic/http` policy gateway and nothing else here changes.
 */
export type TelemetryPolicySource = () => Promise<unknown>;

export const disabledTelemetryPolicySource: TelemetryPolicySource = async () => ({ version: 0, enabled: false });

const STORAGE_KEY = '@chatic/web.telemetry.policy';

/** How long a stored policy may start a run when the document gave no `ttlSec`. */
const DEFAULT_TTL_SEC = 3_600;

/**
 * A development-only override, for checking statistics end to end before the server serves a
 * policy: a policy document stored under this key wins over everything else. Never read in a
 * production build.
 */
export const TELEMETRY_POLICY_OVERRIDE_KEY = '@chatic/web.telemetry.policy.override';

interface StoredPolicy {
    raw: unknown;
    savedAt: number;
}

const readJson = (key: string): unknown => {
    try {
        const text = localStorage.getItem(key);
        return text ? JSON.parse(text) : undefined;
    } catch {
        return undefined;
    }
};

/**
 * The policy a run starts with, read synchronously so the first records of the run — the boot-time
 * vitals — are decided at once instead of waiting on the network.
 *
 * In order: the development override; the last fetched policy while its `ttlSec` holds; the default,
 * statistics off. A newly fetched policy is saved for the **next** run: this run keeps the one it
 * started with (only its kill switch and overrides follow a fetch — see `TelemetrySampler`).
 */
export const loadStartingPolicy = (now: number, allowOverride: boolean): TelemetryPolicy => {
    if (allowOverride) {
        const override = parseTelemetryPolicy(readJson(TELEMETRY_POLICY_OVERRIDE_KEY));
        if (override) return override;
    }

    const stored = readJson(STORAGE_KEY) as StoredPolicy | undefined;
    const policy = stored ? parseTelemetryPolicy(stored.raw) : undefined;
    if (!policy || typeof stored?.savedAt !== 'number') return DEFAULT_TELEMETRY_POLICY;

    const ttlMs = (policy.ttlSec ?? DEFAULT_TTL_SEC) * 1_000;
    return now - stored.savedAt <= ttlMs ? policy : DEFAULT_TELEMETRY_POLICY;
};

/**
 * Fetches the policy and keeps it for the next run. Resolves to the parsed policy, or `undefined`
 * when the fetch failed or the document was not a policy — in which case nothing is stored and the
 * caller must not treat it as "switched off".
 */
export const refreshPolicy = async (
    source: TelemetryPolicySource,
    now: () => number,
    allowOverride: boolean
): Promise<TelemetryPolicy | undefined> => {
    if (allowOverride) {
        const override = parseTelemetryPolicy(readJson(TELEMETRY_POLICY_OVERRIDE_KEY));
        if (override) return override;
    }

    let raw: unknown;
    try {
        raw = await source();
    } catch {
        return undefined;
    }

    const policy = parseTelemetryPolicy(raw);
    if (!policy) return undefined;

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ raw, savedAt: now() } satisfies StoredPolicy));
    } catch {
        /* storage full or blocked: the next run starts from the default, which is safe */
    }
    return policy;
};
