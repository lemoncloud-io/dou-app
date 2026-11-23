import { DEFAULT_TELEMETRY_POLICY, parseTelemetryPolicy } from '@chatic/bridges';

import type { TelemetryPolicy, TelemetryPolicyMatch, TelemetryPolicyRule } from '@chatic/bridges';

import { deviceStore } from '../../storage';

import { APP_VERSION_FLOOR } from '../../features/appUpdate/lib/appVersionFloor';

export type TelemetryPolicySource = () => Promise<unknown>;

export const disabledTelemetryPolicySource: TelemetryPolicySource = async () => ({ version: 0, enabled: false });

const COLLECTED: TelemetryPolicyMatch[] = [
    { host: 'app', platform: 'ios', minAppVersion: APP_VERSION_FLOOR },
    { host: 'app', platform: 'android', minAppVersion: APP_VERSION_FLOOR },
    { host: 'browser' },
];

export const FULL_RATE_PERF_TAGS = [
    'perf.boot',
    'perf.first_screen',
    'perf.cloud_switch',
    'perf.site_switch',
    'perf.web_vitals',
    'perf.chat_room_open',
] as const;

export const DEFAULT_PERF_RATE = 0.2;

export const USAGE_RATE = 1;

const rulesFor = (where: TelemetryPolicyMatch): TelemetryPolicyRule[] => [
    ...FULL_RATE_PERF_TAGS.map(tag => ({ match: { ...where, stream: 'perf' as const, tag }, rate: 1 })),
    { match: { ...where, stream: 'perf' }, rate: DEFAULT_PERF_RATE },
    { match: { ...where, stream: 'usage' }, rate: USAGE_RATE },
];

export const BUILT_IN_TELEMETRY_POLICY: TelemetryPolicy = {
    version: 1,
    ttlSec: 7 * 24 * 3_600,
    enabled: true,
    rules: COLLECTED.flatMap(rulesFor),
};

export const builtInTelemetryPolicySource: TelemetryPolicySource = async () => BUILT_IN_TELEMETRY_POLICY;

const STORAGE_KEY = '@chatic/web.telemetry.policy';

export const TELEMETRY_POLICY_KEY_PREFIX = STORAGE_KEY;

const DEFAULT_TTL_SEC = 3_600;

export const TELEMETRY_POLICY_OVERRIDE_KEY = '@chatic/web.telemetry.policy.override';

interface StoredPolicy {
    raw: unknown;
    savedAt: number;
}

const readJson = (key: string): unknown => {
    try {
        const text = deviceStore.get(key);
        return text ? JSON.parse(text) : undefined;
    } catch {
        return undefined;
    }
};

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

    deviceStore.set(STORAGE_KEY, JSON.stringify({ raw, savedAt: now() } satisfies StoredPolicy));
    return policy;
};
