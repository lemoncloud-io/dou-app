import type { LogHost, LogPlatform, TelemetryKind } from '../core/types';

export type TelemetryStream = 'perf' | 'usage';

export const TELEMETRY_STREAM_SALT: Record<TelemetryStream, string> = { perf: 'perf', usage: 'usage' };

export const TELEMETRY_STREAM_AREA: Record<TelemetryStream, string> = { perf: 'perf', usage: 'usage' };

export const telemetryStreamOf = (kind: TelemetryKind): TelemetryStream => (kind === 'event' ? 'usage' : 'perf');

export interface TelemetryPolicyMatch {
    stream?: TelemetryStream;
    tag?: string;
    platform?: LogPlatform;
    host?: LogHost;
    appVersion?: string;
    webVersion?: string;
    minAppVersion?: string;
}

const MATCH_KEYS: readonly (keyof TelemetryPolicyMatch)[] = [
    'stream',
    'tag',
    'platform',
    'host',
    'appVersion',
    'webVersion',
    'minAppVersion',
];

const VERSION = /^\d+(\.\d+){0,2}$/;

const versionParts = (value: string): number[] | undefined =>
    VERSION.test(value) ? value.split('.').map(Number) : undefined;

export const isAppVersionAtLeast = (version: string | undefined, minimum: string): boolean => {
    const have = version ? versionParts(version) : undefined;
    const need = versionParts(minimum);
    if (!have || !need) return false;
    for (let i = 0; i < 3; i += 1) {
        const a = have[i] ?? 0;
        const b = need[i] ?? 0;
        if (a !== b) return a > b;
    }
    return true;
};

export interface TelemetryPolicyRule {
    match: TelemetryPolicyMatch;
    rate: number;
}

export interface TelemetryPolicyForce {
    uid?: string;
    runId?: string;
    until: number;
}

export interface TelemetryPolicy {
    version: number;
    ttlSec?: number;
    enabled: boolean;
    defaults?: Partial<Record<TelemetryStream, number>>;
    rules?: TelemetryPolicyRule[];
    force?: TelemetryPolicyForce[];
}

export const DEFAULT_TELEMETRY_POLICY: TelemetryPolicy = Object.freeze({ version: 0, enabled: false });

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

const asRate = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : undefined;

const parseRule = (raw: unknown): TelemetryPolicyRule | undefined => {
    if (!isRecord(raw) || !isRecord(raw.match)) return undefined;
    const rate = asRate(raw.rate);
    if (rate === undefined) return undefined;

    const match: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw.match)) {
        if (!(MATCH_KEYS as readonly string[]).includes(key) || typeof value !== 'string') return undefined;
        if (key === 'minAppVersion' && !versionParts(value)) return undefined;
        match[key] = value;
    }
    return { match: match as TelemetryPolicyMatch, rate };
};

const parseForce = (raw: unknown): TelemetryPolicyForce | undefined => {
    if (!isRecord(raw)) return undefined;
    const uid = typeof raw.uid === 'string' && raw.uid ? raw.uid : undefined;
    const runId = typeof raw.runId === 'string' && raw.runId ? raw.runId : undefined;
    const until = typeof raw.until === 'string' ? Date.parse(raw.until) : Number.NaN;
    if ((!uid && !runId) || !Number.isFinite(until)) return undefined;
    return { ...(uid ? { uid } : {}), ...(runId ? { runId } : {}), until };
};

export const parseTelemetryPolicy = (raw: unknown): TelemetryPolicy | undefined => {
    if (!isRecord(raw)) return undefined;
    if (typeof raw.version !== 'number' || !Number.isInteger(raw.version) || raw.version < 0) return undefined;

    const policy: TelemetryPolicy = { version: raw.version, enabled: raw.enabled === true };

    if (typeof raw.ttlSec === 'number' && Number.isFinite(raw.ttlSec) && raw.ttlSec > 0) policy.ttlSec = raw.ttlSec;

    if (isRecord(raw.defaults)) {
        const defaults: Partial<Record<TelemetryStream, number>> = {};
        for (const stream of ['perf', 'usage'] as const) {
            const rate = asRate(raw.defaults[stream]);
            if (rate !== undefined) defaults[stream] = rate;
        }
        policy.defaults = defaults;
    }

    if (Array.isArray(raw.rules)) {
        policy.rules = raw.rules.map(parseRule).filter((rule): rule is TelemetryPolicyRule => rule !== undefined);
    }

    if (Array.isArray(raw.force)) {
        policy.force = raw.force.map(parseForce).filter((force): force is TelemetryPolicyForce => force !== undefined);
    }

    return policy;
};

export interface TelemetryRateQuery {
    stream: TelemetryStream;
    tag: string;
    uid?: string;
    runId?: string;
    platform?: string;
    host?: string;
    appVersion?: string;
    webVersion?: string;
}

export interface TelemetryRate {
    rate: number;
    forced: boolean;
}

const matches = (match: TelemetryPolicyMatch, query: TelemetryRateQuery): boolean =>
    Object.entries(match).every(([key, value]) =>
        key === 'minAppVersion'
            ? isAppVersionAtLeast(query.appVersion, value as string)
            : query[key as keyof TelemetryRateQuery] === value
    );

export const resolveTelemetryRate = (
    policy: TelemetryPolicy,
    query: TelemetryRateQuery,
    now: number
): TelemetryRate => {
    if (!policy.enabled) return { rate: 0, forced: false };

    const forced = (policy.force ?? []).some(
        force =>
            force.until > now &&
            ((force.uid !== undefined && force.uid === query.uid) ||
                (force.runId !== undefined && force.runId === query.runId))
    );
    if (forced) return { rate: 1, forced: true };

    const rule = (policy.rules ?? []).find(candidate => matches(candidate.match, query));
    if (rule) return { rate: rule.rate, forced: false };

    return { rate: policy.defaults?.[query.stream] ?? 0, forced: false };
};
