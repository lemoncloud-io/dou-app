import { describe, expect, it } from 'vitest';

import { inWindow, kstDate, kstDayEnd, kstDayStart, resolvePeriod, widerPreset } from './period';

// 2026-10-26 14:30 KST.
const NOW = Date.parse('2026-10-26T14:30:00+09:00');
const HOUR = 3_600_000;

describe('period', () => {
    it('reads instants on the Korean calendar, whatever the host zone', () => {
        expect(kstDate(Date.parse('2026-10-25T15:00:00Z'))).toBe('2026-10-26');
        expect(kstDate(Date.parse('2026-10-25T14:59:59Z'))).toBe('2026-10-25');
        expect(kstDayEnd('2026-10-26') - kstDayStart('2026-10-26')).toBe(24 * HOUR - 1);
    });

    it('resolves the last hour to the exact window, with covering days for the server', () => {
        const period = resolvePeriod({ preset: '1h' }, NOW);
        expect(period.toMs - period.fromMs).toBe(HOUR);
        expect([period.fromDate, period.toDate]).toEqual(['2026-10-26', '2026-10-26']);
        expect(period.exact).toBe(false);
    });

    it('spans two days for a rolling 24 hours, and says the days are wider', () => {
        const period = resolvePeriod({ preset: '24h' }, NOW);
        expect([period.fromDate, period.toDate]).toEqual(['2026-10-25', '2026-10-26']);
        expect(period.exact).toBe(false);
    });

    it('treats today, yesterday and the last 7 days as whole days', () => {
        expect(resolvePeriod({ preset: 'today' }, NOW)).toMatchObject({
            fromMs: kstDayStart('2026-10-26'),
            toMs: NOW,
            exact: true,
        });
        expect(resolvePeriod({ preset: 'yesterday' }, NOW)).toMatchObject({
            fromDate: '2026-10-25',
            toDate: '2026-10-25',
            toMs: kstDayEnd('2026-10-25'),
            exact: true,
        });
        expect(resolvePeriod({ preset: '7d' }, NOW)).toMatchObject({ fromDate: '2026-10-20', toDate: '2026-10-26' });
    });

    it('reads a custom range, straightening a reversed one and falling back to today on junk', () => {
        expect(resolvePeriod({ preset: 'custom', from: '2026-10-10', to: '2026-10-12' }, NOW)).toMatchObject({
            fromDate: '2026-10-10',
            toDate: '2026-10-12',
        });
        expect(resolvePeriod({ preset: 'custom', from: '2026-10-12', to: '2026-10-10' }, NOW)).toMatchObject({
            fromDate: '2026-10-10',
            toDate: '2026-10-12',
        });
        expect(resolvePeriod({ preset: 'custom', from: 'nope' }, NOW).preset).toBe('today');
    });

    it('centres an around window on the instant, half an hour each side', () => {
        const at = Date.parse('2026-10-26T00:10:00+09:00');
        const period = resolvePeriod({ preset: 'around', at }, NOW);
        expect(period.fromMs).toBe(at - HOUR / 2);
        expect(period.toMs).toBe(at + HOUR / 2);
        // Just after midnight: the window reaches back into the previous day.
        expect([period.fromDate, period.toDate]).toEqual(['2026-10-25', '2026-10-26']);
    });

    it('widens step by step and stops at the widest', () => {
        expect(widerPreset('1h')).toBe('24h');
        expect(widerPreset('today')).toBe('7d');
        expect(widerPreset('7d')).toBeUndefined();
    });

    it('includes both bounds of a window', () => {
        expect(inWindow(10, { fromMs: 10, toMs: 20 })).toBe(true);
        expect(inWindow(20, { fromMs: 10, toMs: 20 })).toBe(true);
        expect(inWindow(21, { fromMs: 10, toMs: 20 })).toBe(false);
        expect(inWindow(undefined, { fromMs: 10, toMs: 20 })).toBe(false);
    });
});
