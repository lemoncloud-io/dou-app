import { describe, expect, it } from 'vitest';

import { GOALS, type GoalKey } from './goals';
import type { ReportLogRow } from './parseReportLog';
import {
    compareBy,
    compareVersions,
    dailyReadings,
    distribution,
    goalSamples,
    MIN_TO_JUDGE,
    NO_VALUE,
    slowestSamples,
} from './perfCompare';

// 2026-10-26 12:00 KST.
const NOON = Date.parse('2026-10-26T12:00:00+09:00');
const DAY = 86_400_000;

const stat = (over: Partial<ReportLogRow>): ReportLogRow => ({
    id: Math.random().toString(),
    type: 'log-entry',
    title: '',
    payload: null,
    raw: null,
    parseError: false,
    timestamp: NOON,
    recordKind: 'trace',
    tag: 'perf.boot',
    ...over,
});

const goal = (key: GoalKey) => {
    const found = GOALS.find(g => g.key === key);
    if (!found) throw new Error(`no goal ${key}`);
    return found;
};

const boots = (values: number[], over: Partial<ReportLogRow> = {}) =>
    values.map(durationMs => stat({ durationMs, ...over }));

describe('goalSamples', () => {
    it('keeps the goal tags, the matching vital and finite values inside the window', () => {
        const rows = [
            stat({ durationMs: 900 }),
            stat({ durationMs: undefined }),
            stat({ tag: 'perf.chat_room_open', durationMs: 500 }),
            stat({
                tag: 'perf.web_vitals',
                recordKind: 'sample',
                attrs: { vital: 'lcp' },
                metrics: { value_ms: 2_000 },
            }),
            stat({
                tag: 'perf.web_vitals',
                recordKind: 'sample',
                attrs: { vital: 'fcp' },
                metrics: { value_ms: 1_000 },
            }),
            stat({ durationMs: 1_000, timestamp: NOON - 3 * DAY }),
        ];
        const period = { fromMs: NOON - DAY, toMs: NOON + DAY };
        expect(goalSamples(goal('boot'), rows, period).map(s => s.value)).toEqual([900]);
        expect(goalSamples(goal('boot'), rows).map(s => s.value)).toEqual([900, 1_000]);
        expect(goalSamples(goal('lcp'), rows).map(s => s.value)).toEqual([2_000]);
    });
});

describe('compareVersions', () => {
    it('orders versions by their numeric parts', () => {
        expect(compareVersions('0.30.10', '0.30.9')).toBeGreaterThan(0);
        // A pre-release or build suffix is not part of the order — the same rule as the adoption view.
        expect(compareVersions('0.30.0-rc.1', '0.30.0')).toBe(0);
        expect(['0.29.2', '0.30.1', '0.3.0'].sort(compareVersions)).toEqual(['0.3.0', '0.29.2', '0.30.1']);
    });
});

describe('compareBy', () => {
    it('reads each group at the goal percentile and judges only groups with enough measurements', () => {
        const rows = [
            ...boots([1_000, 1_100, 1_200, 1_300, 2_400], { appVersion: '0.30.1' }),
            ...boots([800, 900, 1_000, 1_100, 1_200, 1_300], { appVersion: '0.29.2' }),
            ...boots([5_000], { appVersion: '0.30.10' }),
            ...boots([700]),
        ];
        const groups = compareBy(goalSamples(goal('boot'), rows), goal('boot'), 'appVersion');

        expect(groups.map(g => g.group)).toEqual(['0.29.2', '0.30.1', '0.30.10', NO_VALUE]);
        const [older, recent, newest] = groups;
        expect(older.verdict).toBe('met');
        expect(recent.atGoal).toBeCloseTo(2_180);
        expect(recent.verdict).toBe('missed');
        expect(newest.n).toBeLessThan(MIN_TO_JUDGE);
        expect(newest.tooFew).toBe(true);
        expect(newest.verdict).toBe('none');
        expect(groups.filter(g => g.newest).map(g => g.group)).toEqual(['0.30.10']);
    });

    it('gives no verdict to a goal without a target and marks no newest row outside versions', () => {
        const rows = boots([100, 200, 300, 400, 500], { tag: 'perf.chat_room_open', os: 'ios' });
        const [group] = compareBy(goalSamples(goal('roomEntry'), rows), goal('roomEntry'), 'os');
        expect(group).toMatchObject({ group: 'ios', n: 5, p50: 300, verdict: 'none', tooFew: false, newest: false });
    });
});

describe('dailyReadings', () => {
    it('groups by Korean day of occurrence, oldest first, and flags days over the target', () => {
        // 23:30 KST on the 25th is still the 25th in Korea, though the 25th's UTC date ends earlier.
        const lateOn25th = Date.parse('2026-10-25T23:30:00+09:00');
        const rows = [
            ...boots([2_000, 2_000, 2_000, 2_000, 2_000], { timestamp: lateOn25th }),
            ...boots([500, 600], { timestamp: NOON }),
            ...boots([9_000], { timestamp: NOON - 3 * DAY }),
        ];
        const days = dailyReadings(goalSamples(goal('boot'), rows), goal('boot'));
        // A day with fewer than five measurements is shown without a verdict, as in the table.
        expect(days.map(d => [d.day, d.n, d.over, d.tooFew])).toEqual([
            ['2026-10-23', 1, false, true],
            ['2026-10-25', 5, true, false],
            ['2026-10-26', 2, false, true],
        ]);
        expect(days[2].dayStart).toBe(Date.parse('2026-10-26T00:00:00+09:00'));
    });
});

describe('distribution', () => {
    it('is empty without measurements and one bin when all are equal', () => {
        expect(distribution([]).bins).toEqual([]);
        expect(distribution(goalSamples(goal('boot'), boots([5, 5, 5]))).bins).toEqual([{ from: 5, to: 5, count: 3 }]);
    });

    it('draws up to the 99th percentile and counts the tail it leaves out', () => {
        const values = [...Array.from({ length: 99 }, (_, i) => 100 + i), 60_000];
        const result = distribution(goalSamples(goal('boot'), boots(values)), 10);
        expect(result.clipped).toBe(1);
        expect(result.max).toBe(60_000);
        expect(result.bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(99);
    });

    it('clips nothing under twenty measurements', () => {
        const result = distribution(goalSamples(goal('boot'), boots([100, 200, 9_000])), 4);
        expect(result.clipped).toBe(0);
        expect(result.bins[3]).toMatchObject({ to: 9_000, count: 1 });
    });
});

describe('slowestSamples', () => {
    it('returns the slowest first, up to the limit', () => {
        const samples = goalSamples(goal('boot'), boots([300, 900, 100, 700]));
        expect(slowestSamples(samples, 2).map(s => s.value)).toEqual([900, 700]);
    });
});
