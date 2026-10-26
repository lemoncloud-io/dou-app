import { DEFAULT_TELEMETRY_POLICY, parseTelemetryPolicy } from '@chatic/bridges';

import type { TelemetryPolicy, TelemetryPolicyMatch, TelemetryPolicyRule } from '@chatic/bridges';

/**
 * Where the sampling policy comes from.
 *
 * The server has no route for it yet, so the app ships its own: {@link builtInTelemetryPolicySource}
 * answers the policy below. When the route exists, the source becomes the `@chatic/http` policy
 * gateway and nothing else here changes.
 */
export type TelemetryPolicySource = () => Promise<unknown>;

/** Statistics off — what a run that never received a policy uses, and the kill switch's answer. */
export const disabledTelemetryPolicySource: TelemetryPolicySource = async () => ({ version: 0, enabled: false });

/**
 * The first mobile app version whose native log queue has a statistics share. An older build relays
 * a statistic into a queue that stores it as a plain log and drops its `kind` on a restart, so those
 * builds stay off.
 */
export const FIRST_APP_VERSION_WITH_STATISTICS = '0.29.2';

/**
 * Where statistics are collected: the two mobile apps from the first build with the share, and the
 * web in a browser tab. The desktop app also runs the web as `host: 'app'` (`platform: 'web'`) on a
 * version line of its own, so it matches none of these and stays off.
 */
const COLLECTED: TelemetryPolicyMatch[] = [
    { host: 'app', platform: 'ios', minAppVersion: FIRST_APP_VERSION_WITH_STATISTICS },
    { host: 'app', platform: 'android', minAppVersion: FIRST_APP_VERSION_WITH_STATISTICS },
    { host: 'browser' },
];

/**
 * Records kept from every run: the ones with a performance target (boot, the first screen, cloud
 * and place switches, the web vitals) and the room open, whose slow tail is the question. A sample
 * misses that tail, which is what reading a target needs.
 */
export const FULL_RATE_PERF_TAGS = [
    'perf.boot',
    'perf.first_screen',
    'perf.cloud_switch',
    'perf.site_switch',
    'perf.web_vitals',
    'perf.chat_room_open',
] as const;

/** Every other performance record, from one run in five. */
export const DEFAULT_PERF_RATE = 0.2;

/** Usage events from every run: a sampled count of users is not a count of users. */
export const USAGE_RATE = 1;

const rulesFor = (where: TelemetryPolicyMatch): TelemetryPolicyRule[] => [
    ...FULL_RATE_PERF_TAGS.map(tag => ({ match: { ...where, stream: 'perf' as const, tag }, rate: 1 })),
    { match: { ...where, stream: 'perf' }, rate: DEFAULT_PERF_RATE },
    { match: { ...where, stream: 'usage' }, rate: USAGE_RATE },
];

/**
 * The policy the app serves itself until the server serves one. No `defaults`: a run that matches
 * no rule — an older app build, the desktop app — collects nothing.
 *
 * A week of `ttlSec`, not an hour: a run starts from the stored policy only while it is that fresh,
 * and an hour would leave most cold starts — a user opening the app once a day — with statistics
 * off. A long reuse costs nothing in safety: the policy is fetched again as each run starts, and the
 * kill switch in a newer one applies at once.
 */
export const BUILT_IN_TELEMETRY_POLICY: TelemetryPolicy = {
    version: 1,
    ttlSec: 7 * 24 * 3_600,
    enabled: true,
    rules: COLLECTED.flatMap(rulesFor),
};

export const builtInTelemetryPolicySource: TelemetryPolicySource = async () => BUILT_IN_TELEMETRY_POLICY;

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
 * statistics off. So the first run after an install starts with statistics off and turns them on
 * from the next run, once a fetch has stored the policy. A newly fetched policy is saved for the **next** run: this run keeps the one it
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
