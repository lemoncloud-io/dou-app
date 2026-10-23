import { describe, expect, it } from 'vitest';

import { DURATION, groupKeysOf, histogram, measuresOf, percentile, statGroups, statTagsOf } from './traceStats';

import type { ReportLogRow } from './parseReportLog';

const row = (over: Partial<ReportLogRow> = {}): ReportLogRow =>
    ({
        id: Math.random().toString(),
        type: 'log-entry',
        title: '',
        payload: null,
        raw: null,
        parseError: false,
        ...over,
    }) as ReportLogRow;

const trace = (durationMs: number, over: Partial<ReportLogRow> = {}) =>
    row({ tag: 'perf.chat_room_open', recordKind: 'trace', durationMs, ...over });

describe('percentile', () => {
    it('uses nearest rank', () => {
        const sorted = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
        expect(percentile(sorted, 50)).toBe(50);
        expect(percentile(sorted, 95)).toBe(100);
        expect(percentile(sorted, 10)).toBe(10);
    });

    it('has no value for no data', () => {
        expect(percentile([], 50)).toBeUndefined();
    });
});

describe('statTagsOf', () => {
    it('lists statistics tags busiest first, and leaves logs out', () => {
        const tags = statTagsOf([
            trace(1),
            trace(2),
            row({ tag: 'usage.screen_view', recordKind: 'event' }),
            row({ tag: 'SOCKET', level: 'warn' }),
        ]);

        expect(tags).toEqual([
            { tag: 'perf.chat_room_open', kind: 'trace', count: 2 },
            { tag: 'usage.screen_view', kind: 'event', count: 1 },
        ]);
    });
});

describe('measuresOf / groupKeysOf', () => {
    it('offers the duration first, then the metrics', () => {
        expect(measuresOf([trace(1, { metrics: { mount: 2, cache_emit: 3 } })])).toEqual([
            DURATION,
            'cache_emit',
            'mount',
        ]);
    });

    it('offers attributes, then the context axes', () => {
        expect(groupKeysOf([trace(1, { attrs: { entry: 'list' } })])).toEqual([
            'attr:entry',
            'appVersion',
            'webVersion',
            'platform',
            'host',
            'os',
            'routeTemplate',
        ]);
    });
});

describe('statGroups', () => {
    it('summarizes the duration with n, users and percentiles', () => {
        const rows = [10, 20, 30, 40].map((ms, i) => trace(ms, { userId: `u${i % 2}` }));
        const [all] = statGroups(rows, DURATION, '');

        expect(all).toMatchObject({
            group: '(all)',
            n: 4,
            estimated: 4,
            users: 2,
            measured: 4,
            p50: 20,
            p95: 40,
            mean: 25,
        });
    });

    it('weighs the estimated count by each record sampling rate', () => {
        const [all] = statGroups([trace(1, { sr: 0.5 }), trace(2, { sr: 0.25 }), trace(3)], DURATION, '');

        expect(all.estimated).toBe(2 + 4 + 1);
    });

    it('splits by an attribute, with the total first and missing values grouped', () => {
        const groups = statGroups(
            [trace(1, { attrs: { entry: 'list' } }), trace(2, { attrs: { entry: 'list' } }), trace(3)],
            DURATION,
            'attr:entry'
        );

        expect(groups.map(g => [g.group, g.n])).toEqual([
            ['(all)', 3],
            ['list', 2],
            ['(none)', 1],
        ]);
    });

    it('reads a metric when asked instead of the duration', () => {
        const [all] = statGroups([trace(9, { metrics: { mount: 100 } }), trace(9)], 'mount', '');

        expect(all).toMatchObject({ n: 2, measured: 1, p50: 100 });
    });
});

describe('histogram', () => {
    it('bins the values evenly and counts every one', () => {
        const bins = histogram(
            [0, 10, 20, 30, 40].map(ms => trace(ms)),
            DURATION,
            4
        );

        expect(bins).toHaveLength(4);
        expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(5);
        expect(bins[3].count).toBe(2);
    });

    it('is a single bin when every value is the same, and empty with nothing measured', () => {
        expect(histogram([trace(5), trace(5)], DURATION)).toEqual([{ from: 5, to: 5, count: 2 }]);
        expect(histogram([row()], DURATION)).toEqual([]);
    });
});
