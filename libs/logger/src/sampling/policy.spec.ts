import { samplingBucket } from './bucket';
import { DEFAULT_TELEMETRY_POLICY, isAppVersionAtLeast, parseTelemetryPolicy, resolveTelemetryRate } from './policy';

import type { TelemetryPolicy } from './policy';

const NOW = Date.parse('2026-10-22T00:00:00+09:00');

describe('samplingBucket', () => {
    it('gives the same run the same bucket every time', () => {
        expect(samplingBucket('run-abc', 'perf')).toBe(samplingBucket('run-abc', 'perf'));
    });

    it('stays in [0, 1)', () => {
        for (let i = 0; i < 200; i += 1) {
            const b = samplingBucket(`run-${i}`, 'usage');
            expect(b).toBeGreaterThanOrEqual(0);
            expect(b).toBeLessThan(1);
        }
    });

    it('salts streams apart, so one run can land differently per stream', () => {
        const differs = Array.from({ length: 50 }, (_, i) => `r${i}`).some(
            run => samplingBucket(run, 'perf') !== samplingBucket(run, 'usage')
        );
        expect(differs).toBe(true);
    });
});

describe('parseTelemetryPolicy', () => {
    it('reads a full document', () => {
        const policy = parseTelemetryPolicy({
            version: 7,
            ttlSec: 3600,
            enabled: true,
            defaults: { perf: 0.2, usage: 1 },
            rules: [{ match: { stream: 'perf', tag: 'perf.chat_room_open' }, rate: 1 }],
            force: [{ uid: 'u1', until: '2026-10-26T00:00:00+09:00' }],
        });

        expect(policy).toEqual({
            version: 7,
            ttlSec: 3600,
            enabled: true,
            defaults: { perf: 0.2, usage: 1 },
            rules: [{ match: { stream: 'perf', tag: 'perf.chat_room_open' }, rate: 1 }],
            force: [{ uid: 'u1', until: Date.parse('2026-10-26T00:00:00+09:00') }],
        });
    });

    it('refuses a document without a usable version', () => {
        expect(parseTelemetryPolicy(null)).toBeUndefined();
        expect(parseTelemetryPolicy({ enabled: true })).toBeUndefined();
        expect(parseTelemetryPolicy({ version: -1, enabled: true })).toBeUndefined();
        expect(parseTelemetryPolicy([])).toBeUndefined();
    });

    it('turns statistics on only for enabled: true exactly', () => {
        expect(parseTelemetryPolicy({ version: 1, enabled: 'yes' })?.enabled).toBe(false);
        expect(parseTelemetryPolicy({ version: 1 })?.enabled).toBe(false);
    });

    it('drops rates outside 0..1, unreadable rules and overrides without an expiry', () => {
        const policy = parseTelemetryPolicy({
            version: 2,
            enabled: true,
            defaults: { perf: 2, usage: 0.5 },
            rules: [
                { match: { stream: 'perf' }, rate: -1 },
                { match: { country: 'kr' }, rate: 1 },
                { match: { tag: 1 }, rate: 1 },
                { match: { platform: 'ios' }, rate: 0.3 },
            ],
            force: [{ uid: 'u1' }, { until: '2026-10-26T00:00:00Z' }, { runId: 'r1', until: 'never' }],
        });

        expect(policy?.defaults).toEqual({ usage: 0.5 });
        expect(policy?.rules).toEqual([{ match: { platform: 'ios' }, rate: 0.3 }]);
        expect(policy?.force).toEqual([]);
    });
});

describe('resolveTelemetryRate', () => {
    const base: TelemetryPolicy = {
        version: 3,
        enabled: true,
        defaults: { perf: 0.2, usage: 1 },
        rules: [
            { match: { stream: 'perf', tag: 'perf.chat_room_open' }, rate: 1 },
            { match: { stream: 'perf', platform: 'android' }, rate: 0.5 },
            { match: { stream: 'perf', tag: 'perf.chat_room_open', platform: 'android' }, rate: 0 },
        ],
    };

    it('gives 0 for the default policy', () => {
        expect(resolveTelemetryRate(DEFAULT_TELEMETRY_POLICY, { stream: 'perf', tag: 'perf.boot' }, NOW)).toEqual({
            rate: 0,
            forced: false,
        });
    });

    it('takes the first rule that matches, not the most specific', () => {
        const q = { stream: 'perf' as const, tag: 'perf.chat_room_open', platform: 'android' };
        expect(resolveTelemetryRate(base, q, NOW).rate).toBe(1);
    });

    it('requires every key of a rule to match', () => {
        expect(resolveTelemetryRate(base, { stream: 'perf', tag: 'perf.boot', platform: 'android' }, NOW).rate).toBe(
            0.5
        );
        expect(resolveTelemetryRate(base, { stream: 'perf', tag: 'perf.boot', platform: 'ios' }, NOW).rate).toBe(0.2);
    });

    it('falls through to the stream default, and to 0 when the stream has none', () => {
        expect(resolveTelemetryRate(base, { stream: 'usage', tag: 'usage.screen_view' }, NOW).rate).toBe(1);
        expect(resolveTelemetryRate({ version: 1, enabled: true }, { stream: 'usage', tag: 'usage.x' }, NOW).rate).toBe(
            0
        );
    });

    it('raises a forced user or run to 100% while the override is live', () => {
        const policy = {
            ...base,
            force: [
                { uid: 'u1', until: NOW + 1000 },
                { runId: 'r9', until: NOW + 1000 },
            ],
        };
        expect(resolveTelemetryRate(policy, { stream: 'perf', tag: 'perf.boot', uid: 'u1' }, NOW)).toEqual({
            rate: 1,
            forced: true,
        });
        expect(resolveTelemetryRate(policy, { stream: 'perf', tag: 'perf.boot', runId: 'r9' }, NOW).forced).toBe(true);
    });

    it('ignores an expired override', () => {
        const policy = { ...base, force: [{ uid: 'u1', until: NOW - 1 }] };
        expect(resolveTelemetryRate(policy, { stream: 'perf', tag: 'perf.boot', uid: 'u1' }, NOW)).toEqual({
            rate: 0.2,
            forced: false,
        });
    });

    it('lets the kill switch win over an override', () => {
        const policy = { ...base, enabled: false, force: [{ uid: 'u1', until: NOW + 1000 }] };
        expect(resolveTelemetryRate(policy, { stream: 'perf', tag: 'perf.boot', uid: 'u1' }, NOW).rate).toBe(0);
    });
});

describe('minAppVersion', () => {
    const rule = (minAppVersion: string) => ({
        version: 9,
        enabled: true,
        defaults: { perf: 0 },
        rules: [{ match: { host: 'app', minAppVersion }, rate: 1 }],
    });

    it('matches the minimum and every later app version, part by part', () => {
        const policy = parseTelemetryPolicy(rule('1.9.0')) as TelemetryPolicy;
        const rate = (appVersion?: string) =>
            resolveTelemetryRate(policy, { stream: 'perf', tag: 'perf.boot', host: 'app', appVersion }, 0).rate;

        expect(rate('1.9.0')).toBe(1);
        expect(rate('1.10.0')).toBe(1);
        expect(rate('2.0')).toBe(1);
        expect(rate('1.8.99')).toBe(0);
    });

    it('never matches a record with no app version, such as the standalone web', () => {
        const policy = parseTelemetryPolicy(rule('0.0.1')) as TelemetryPolicy;
        expect(resolveTelemetryRate(policy, { stream: 'perf', tag: 'perf.boot', host: 'app' }, 0).rate).toBe(0);
    });

    it('does not match an app version it cannot parse', () => {
        const policy = parseTelemetryPolicy(rule('1.0.0')) as TelemetryPolicy;
        expect(
            resolveTelemetryRate(policy, { stream: 'perf', tag: 'x', host: 'app', appVersion: '1.2.0-beta' }, 0).rate
        ).toBe(0);
    });

    it('skips a rule whose minimum is not a version', () => {
        expect(parseTelemetryPolicy(rule('latest'))?.rules).toEqual([]);
        expect(parseTelemetryPolicy(rule('1.2.3.4'))?.rules).toEqual([]);
    });
});

describe('isAppVersionAtLeast', () => {
    it('compares numerically with missing parts as zero', () => {
        expect(isAppVersionAtLeast('0.29.0', '0.29')).toBe(true);
        expect(isAppVersionAtLeast('0.29.0', '0.29.1')).toBe(false);
        expect(isAppVersionAtLeast('10.0.0', '9.9.9')).toBe(true);
        expect(isAppVersionAtLeast(undefined, '0.0.1')).toBe(false);
    });
});
