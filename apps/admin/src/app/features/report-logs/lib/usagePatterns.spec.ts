import { describe, expect, it } from 'vitest';

import type { ReportLogRow } from './parseReportLog';
import {
    busiestHour,
    fillTrend,
    foldByHourOfDay,
    kstHourOf,
    summarizeScreens,
    summarizeSessions,
    summarizeStarts,
    trendUnitOf,
} from './usagePatterns';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const DAY_START = Date.parse('2026-10-20T00:00:00+09:00');

const row = (fields: Partial<ReportLogRow>): ReportLogRow => ({
    id: Math.random().toString(),
    type: 'log-entry',
    title: 'usage',
    payload: null,
    raw: {},
    parseError: false,
    recordKind: 'event',
    ...fields,
});

describe('trendUnitOf', () => {
    it('uses hours for two days or less and days beyond', () => {
        expect(trendUnitOf({ fromMs: 0, toMs: HOUR })).toBe('hour');
        expect(trendUnitOf({ fromMs: 0, toMs: 2 * DAY - 1 })).toBe('hour');
        expect(trendUnitOf({ fromMs: 0, toMs: 7 * DAY })).toBe('day');
    });
});

describe('fillTrend', () => {
    it('fills the days the server left out, up to the end of the window', () => {
        const trend = [
            { key: DAY_START, val: 3, users: 2 },
            { key: DAY_START + 2 * DAY, val: 5, users: 4 },
        ];
        const filled = fillTrend(trend, 'day', { fromMs: DAY_START + HOUR, toMs: DAY_START + 3 * DAY + HOUR });

        expect(filled.map(bucket => bucket.val)).toEqual([3, 0, 5, 0]);
        expect(filled[1]).toEqual({ key: DAY_START + DAY, val: 0, users: 0 });
    });

    it('fills hours from the start of the first covered day', () => {
        const filled = fillTrend([{ key: DAY_START + 2 * HOUR, val: 1 }], 'hour', {
            fromMs: DAY_START + 3 * HOUR,
            toMs: DAY_START + 4 * HOUR,
        });

        expect(filled.map(bucket => bucket.val)).toEqual([0, 0, 1, 0, 0]);
    });

    it('returns the buckets untouched when one is off the expected boundary', () => {
        const trend = [{ key: DAY_START + 30 * 60 * 1000, val: 1 }];

        expect(fillTrend(trend, 'hour', { fromMs: DAY_START, toMs: DAY_START + 2 * HOUR })).toBe(trend);
    });
});

describe('hours of the day', () => {
    it('reads the hour in Korean time', () => {
        expect(kstHourOf(Date.parse('2026-10-20T23:30:00+09:00'))).toBe(23);
        expect(kstHourOf(Date.parse('2026-10-20T15:00:00Z'))).toBe(0);
    });

    it('sums the same hour across days', () => {
        const slots = foldByHourOfDay([
            { key: DAY_START + 9 * HOUR, val: 2 },
            { key: DAY_START + DAY + 9 * HOUR, val: 3 },
            { key: DAY_START + 21 * HOUR, val: 4 },
        ]);

        expect(slots).toHaveLength(24);
        expect(slots[9]).toBe(5);
        expect(slots[21]).toBe(4);
        expect(slots.reduce((a, b) => a + b, 0)).toBe(9);
    });

    it('names the busiest hour, the earliest on a tie, and none when all are empty', () => {
        const slots = Array.from({ length: 24 }, () => 0);
        expect(busiestHour(slots)).toBeUndefined();
        slots[8] = 4;
        slots[20] = 4;
        expect(busiestHour(slots)).toBe(8);
        slots[20] = 5;
        expect(busiestHour(slots)).toBe(20);
    });
});

describe('summarizeSessions', () => {
    it('takes the median length and screens, skipping records without them', () => {
        const summary = summarizeSessions([
            row({ metrics: { duration_ms: 60_000, screens: 3 } }),
            row({ metrics: { duration_ms: 120_000, screens: 5 } }),
            row({ metrics: { duration_ms: 600_000 } }),
            row({}),
        ]);

        expect(summary).toEqual({ sessions: 4, medianDurationMs: 120_000, medianScreens: 4 });
    });

    it('has no medians without records', () => {
        expect(summarizeSessions([])).toEqual({ sessions: 0, medianDurationMs: undefined, medianScreens: undefined });
    });
});

describe('summarizeScreens', () => {
    it('counts views per screen and reads the time spent from the following view', () => {
        const summary = summarizeScreens([
            row({ attrs: { screen: '/home' } }),
            row({ attrs: { screen: '/channels/:id/room', prev_screen: '/home' }, metrics: { prev_dwell_ms: 4_000 } }),
            row({ attrs: { screen: '/home', prev_screen: '/channels/:id/room' }, metrics: { prev_dwell_ms: 30_000 } }),
            row({ attrs: { screen: '/settings', prev_screen: '/home' }, metrics: { prev_dwell_ms: 2_000 } }),
        ]);

        expect(summary.totalViews).toBe(4);
        expect(summary.distinct).toBe(3);
        expect(summary.screens[0]).toEqual({ screen: '/home', views: 2, medianDwellMs: 3_000, dwellCount: 2 });
        expect(summary.screens.find(s => s.screen === '/settings')).toEqual({
            screen: '/settings',
            views: 1,
            medianDwellMs: undefined,
            dwellCount: 0,
        });
    });

    it('keeps the top screens but counts every view in the total', () => {
        const rows = ['/a', '/a', '/b', '/c'].map(screen => row({ attrs: { screen } }));
        const summary = summarizeScreens(rows, 2);

        expect(summary.screens.map(s => s.screen)).toEqual(['/a', '/b']);
        expect(summary.totalViews).toBe(4);
    });

    it('falls back to the record route template when the screen attribute is missing', () => {
        expect(summarizeScreens([row({ routeTemplate: '/home' })]).screens[0].screen).toBe('/home');
    });
});

describe('summarizeStarts', () => {
    it('counts start kinds and entry points, most first', () => {
        const summary = summarizeStarts([
            row({ attrs: { start: 'cold', entry: 'icon' } }),
            row({ attrs: { start: 'warm', entry: 'push' } }),
            row({ attrs: { start: 'warm', entry: 'icon' } }),
            row({ attrs: {} }),
        ]);

        expect(summary.sessions).toBe(4);
        expect(summary.start).toEqual([
            { key: 'warm', count: 2 },
            { key: 'cold', count: 1 },
        ]);
        expect(summary.entry).toEqual([
            { key: 'icon', count: 2 },
            { key: 'push', count: 1 },
        ]);
    });
});
