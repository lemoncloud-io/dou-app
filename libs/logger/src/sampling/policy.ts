import type { LogHost, LogPlatform, TelemetryKind } from '../core/types';

/**
 * A sampling stream. Performance records (`trace`, `sample`) and usage events (`event`) are sampled
 * separately, at different rates and with different salts.
 */
export type TelemetryStream = 'perf' | 'usage';

/** The salt each stream hashes the run id with. A contract — see `samplingBucket`. */
export const TELEMETRY_STREAM_SALT: Record<TelemetryStream, string> = { perf: 'perf', usage: 'usage' };

/** The tag prefix each stream's records carry: `perf.chat_room_open`, `usage.screen_view`. */
export const TELEMETRY_STREAM_AREA: Record<TelemetryStream, string> = { perf: 'perf', usage: 'usage' };

export const telemetryStreamOf = (kind: TelemetryKind): TelemetryStream => (kind === 'event' ? 'usage' : 'perf');

/**
 * What a rule can match on. A rule matches when all of its keys do. Every key is an exact match
 * except `minAppVersion`, which is "this app version or later".
 */
export interface TelemetryPolicyMatch {
    stream?: TelemetryStream;
    tag?: string;
    platform?: LogPlatform;
    host?: LogHost;
    appVersion?: string;
    webVersion?: string;
    /**
     * The app version or later (`1.4.0` matches `1.4.0`, `1.4.2`, `2.0.0`). A record with no app
     * version — the standalone web — never matches it. This is what lets statistics be turned on
     * only for app builds that carry the statistics queue share: on an older build a statistic would
     * be stored as a plain log.
     */
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

/** `major.minor.patch`, with the minor and patch optional. A pre-release or build suffix is not a version here. */
const VERSION = /^\d+(\.\d+){0,2}$/;

/** The numeric parts of a version, or `undefined` when it is not one. */
const versionParts = (value: string): number[] | undefined =>
    VERSION.test(value) ? value.split('.').map(Number) : undefined;

/**
 * Whether `version` is `minimum` or later, part by part (`1.10.0` is after `1.9.0`; a missing part is
 * zero). A version that does not parse — or no version at all — is not "later" than anything.
 */
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
    /** `0..1`. */
    rate: number;
}

/** A debugging override: every record of the named user or run at 100%, until it expires. */
export interface TelemetryPolicyForce {
    uid?: string;
    runId?: string;
    /** Epoch milliseconds. An override without an expiry is not accepted. */
    until: number;
}

/**
 * The sampling policy, as this package uses it.
 *
 * Statistics only — logs never pass through it. The server owns the document; what arrives is read
 * by {@link parseTelemetryPolicy}, which is the only way a policy gets built from outside the code.
 */
export interface TelemetryPolicy {
    version: number;
    /** How long a fetched policy may be reused at the next run's start. */
    ttlSec?: number;
    /** `false` is the statistics kill switch. Logs are not affected. */
    enabled: boolean;
    defaults?: Partial<Record<TelemetryStream, number>>;
    /** First match wins; no match falls through to `defaults`. */
    rules?: TelemetryPolicyRule[];
    force?: TelemetryPolicyForce[];
}

/**
 * The built-in policy: statistics off.
 *
 * A run that has never received a policy creates no statistics entries at all, so shipping the
 * client ahead of the server changes nothing on the wire. The server turns statistics on by serving
 * a policy; the client does not wait for a server release.
 */
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
        // A key this build does not know, or a value that is not a string, could only be read more
        // broadly than the policy meant. Such a rule is skipped as a whole rather than half-applied.
        if (!(MATCH_KEYS as readonly string[]).includes(key) || typeof value !== 'string') return undefined;
        // A minimum that is not a version could never be compared; the rule is skipped rather than
        // read as "every version".
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

/**
 * Reads a policy document as the server serves it. Returns `undefined` when the document cannot be a
 * policy at all, so the caller falls back to the last stored one, then to the default.
 *
 * Within a valid document it is conservative item by item: a rate outside `0..1` is dropped, a rule
 * it cannot read never matches, and an override without a readable expiry is ignored. `enabled` must
 * be exactly `true` to turn anything on.
 */
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

/** What a rate is resolved against: the record's stream and tag, and the run's context. */
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
    /** Raised to 100% by a debugging override. */
    forced: boolean;
}

const matches = (match: TelemetryPolicyMatch, query: TelemetryRateQuery): boolean =>
    Object.entries(match).every(([key, value]) =>
        key === 'minAppVersion'
            ? isAppVersionAtLeast(query.appVersion, value as string)
            : query[key as keyof TelemetryRateQuery] === value
    );

/**
 * The rate one record is kept at.
 *
 * Order: the kill switch, then a live override (100%), then the first rule that matches, then the
 * stream's default. A stream with no default is not collected — a policy has to say what it wants.
 */
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
