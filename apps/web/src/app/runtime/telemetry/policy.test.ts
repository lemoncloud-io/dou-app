import { parseTelemetryPolicy, resolveTelemetryRate } from '@chatic/bridges';

import type { TelemetryRateQuery } from '@chatic/bridges';

import {
    BUILT_IN_TELEMETRY_POLICY,
    DEFAULT_PERF_RATE,
    FULL_RATE_PERF_TAGS,
    loadStartingPolicy,
    refreshPolicy,
    TELEMETRY_POLICY_OVERRIDE_KEY,
} from './policy';

const STORED = '@chatic/web.telemetry.policy';
const on = { version: 4, enabled: true, ttlSec: 60, defaults: { perf: 1 } };

beforeEach(() => localStorage.clear());

describe('loadStartingPolicy', () => {
    it('starts with statistics off when nothing was ever fetched', () => {
        expect(loadStartingPolicy(0, false)).toEqual({ version: 0, enabled: false });
    });

    it('starts with the stored policy while its ttl holds, and the default after', () => {
        localStorage.setItem(STORED, JSON.stringify({ raw: on, savedAt: 1_000 }));

        expect(loadStartingPolicy(1_000 + 60_000, false).version).toBe(4);
        expect(loadStartingPolicy(1_000 + 60_001, false).version).toBe(0);
    });

    it('honours the development override only when allowed', () => {
        localStorage.setItem(TELEMETRY_POLICY_OVERRIDE_KEY, JSON.stringify({ version: 9, enabled: true }));

        expect(loadStartingPolicy(0, true).version).toBe(9);
        expect(loadStartingPolicy(0, false).version).toBe(0);
    });

    it('falls back to the default on a stored document that is not a policy', () => {
        localStorage.setItem(STORED, '{not json');
        expect(loadStartingPolicy(0, false).enabled).toBe(false);
    });
});

describe('refreshPolicy', () => {
    it('stores a fetched policy for the next run and returns it', async () => {
        const policy = await refreshPolicy(
            async () => on,
            () => 5,
            false
        );

        expect(policy?.version).toBe(4);
        expect(JSON.parse(localStorage.getItem(STORED) ?? '{}')).toEqual({ raw: on, savedAt: 5 });
    });

    it('returns nothing and stores nothing when the fetch fails or is not a policy', async () => {
        await expect(
            refreshPolicy(
                async () => Promise.reject(new Error('net')),
                () => 5,
                false
            )
        ).resolves.toBeUndefined();
        await expect(
            refreshPolicy(
                async () => ({ nope: true }),
                () => 5,
                false
            )
        ).resolves.toBeUndefined();
        expect(localStorage.getItem(STORED)).toBeNull();
    });
});

describe('the built-in policy', () => {
    const rateOf = (query: Partial<TelemetryRateQuery> & Pick<TelemetryRateQuery, 'stream'>) =>
        resolveTelemetryRate(BUILT_IN_TELEMETRY_POLICY, { tag: 'perf.api_request', ...query }, 0).rate;

    it('parses as a policy, so a fetch stores it for the next run', () => {
        expect(parseTelemetryPolicy(BUILT_IN_TELEMETRY_POLICY)).toEqual(BUILT_IN_TELEMETRY_POLICY);
    });

    it('collects on the mobile apps at or above the version floor', () => {
        expect(rateOf({ host: 'app', platform: 'ios', appVersion: '0.30.0', stream: 'usage' })).toBe(1);
        expect(rateOf({ host: 'app', platform: 'android', appVersion: '0.31.2', stream: 'perf' })).toBe(
            DEFAULT_PERF_RATE
        );
    });

    it('keeps an app below the version floor off — it only reaches the update screen', () => {
        expect(rateOf({ host: 'app', platform: 'ios', appVersion: '0.29.2', stream: 'usage' })).toBe(0);
        expect(rateOf({ host: 'app', platform: 'android', stream: 'usage' })).toBe(0);
    });

    it('keeps the desktop app off', () => {
        expect(rateOf({ host: 'app', platform: 'web', appVersion: '9.0.0', stream: 'usage' })).toBe(0);
    });

    it('collects in a browser tab', () => {
        expect(rateOf({ host: 'browser', platform: 'web', stream: 'usage' })).toBe(1);
        expect(rateOf({ host: 'browser', platform: 'web', stream: 'perf' })).toBe(DEFAULT_PERF_RATE);
    });

    it('keeps every run of the records with a target', () => {
        for (const tag of FULL_RATE_PERF_TAGS) {
            expect(rateOf({ host: 'browser', platform: 'web', stream: 'perf', tag })).toBe(1);
            expect(rateOf({ host: 'app', platform: 'ios', appVersion: '0.30.0', stream: 'perf', tag })).toBe(1);
        }
    });
});
