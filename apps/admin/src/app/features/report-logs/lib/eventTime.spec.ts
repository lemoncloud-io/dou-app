/**
 * `lib/report-logs/eventTime.spec.ts`
 */
import { describe, expect, it } from 'vitest';

import {
    byEventAtAsc,
    byEventAtDesc,
    eventAt,
    hasNoticeableLag,
    ingestLagMs,
    isOutsideRange,
    LAG_NOTICE_MS,
} from './eventTime';
import type { ReportLogRow } from './parseReportLog';

const row = (partial: Partial<ReportLogRow> = {}): ReportLogRow => ({
    id: 'r',
    type: 'log-entry',
    title: 't',
    payload: null,
    raw: {},
    parseError: false,
    ...partial,
});

describe('eventAt', () => {
    it('prefers the occurrence timestamp', () => {
        expect(eventAt(row({ timestamp: 100, createdAt: 900 }))).toBe(100);
    });

    it('falls back to arrival time when there is no timestamp', () => {
        expect(eventAt(row({ createdAt: 900 }))).toBe(900);
    });

    it('is undefined when neither clock is present', () => {
        expect(eventAt(row())).toBeUndefined();
    });

    it('treats timestamp 0 as a real value rather than falling back', () => {
        // `??` and not `||`: epoch 0 is nonsense as a date but it is still the value the
        // record carries, and silently swapping in `createdAt` would hide a bad client clock.
        expect(eventAt(row({ timestamp: 0, createdAt: 900 }))).toBe(0);
    });
});

describe('ingestLagMs', () => {
    it('measures device-to-server delay', () => {
        expect(ingestLagMs(row({ timestamp: 1_000, createdAt: 61_000 }))).toBe(60_000);
    });

    it('clamps a device clock running ahead to zero', () => {
        expect(ingestLagMs(row({ timestamp: 5_000, createdAt: 1_000 }))).toBe(0);
    });

    it('is undefined when either clock is missing', () => {
        expect(ingestLagMs(row({ createdAt: 1_000 }))).toBeUndefined();
        expect(ingestLagMs(row({ timestamp: 1_000 }))).toBeUndefined();
    });
});

describe('hasNoticeableLag', () => {
    it('flags a lag at or above the threshold', () => {
        expect(hasNoticeableLag(row({ timestamp: 0, createdAt: LAG_NOTICE_MS }))).toBe(true);
    });

    it('ignores the ordinary flush-interval delay', () => {
        expect(hasNoticeableLag(row({ timestamp: 0, createdAt: 3_000 }))).toBe(false);
    });

    it('does not flag rows with only one clock', () => {
        expect(hasNoticeableLag(row({ createdAt: 999_999 }))).toBe(false);
    });

    it('honours a custom threshold', () => {
        expect(hasNoticeableLag(row({ timestamp: 0, createdAt: 5_000 }), 1_000)).toBe(true);
    });
});

describe('isOutsideRange', () => {
    it('flags a row that happened before the range but arrived inside it', () => {
        expect(isOutsideRange(row({ timestamp: 50, createdAt: 500 }), 100, 900)).toBe(true);
    });

    it('flags a row past the range end', () => {
        expect(isOutsideRange(row({ timestamp: 1_000 }), 100, 900)).toBe(true);
    });

    it('accepts a row inside the range', () => {
        expect(isOutsideRange(row({ timestamp: 500 }), 100, 900)).toBe(false);
    });

    it('accepts anything when the range is open-ended', () => {
        expect(isOutsideRange(row({ timestamp: 50 }))).toBe(false);
    });

    it('says nothing about rows with no clock', () => {
        expect(isOutsideRange(row(), 100, 900)).toBe(false);
    });
});

describe('comparators', () => {
    it('sorts newest occurrence first and sinks clockless rows', () => {
        const rows = [row({ id: 'a', timestamp: 100 }), row({ id: 'b' }), row({ id: 'c', timestamp: 300 })];
        expect([...rows].sort(byEventAtDesc).map(r => r.id)).toEqual(['c', 'a', 'b']);
    });

    it('sorts oldest occurrence first and sinks clockless rows', () => {
        const rows = [row({ id: 'a', timestamp: 300 }), row({ id: 'b' }), row({ id: 'c', timestamp: 100 })];
        expect([...rows].sort(byEventAtAsc).map(r => r.id)).toEqual(['c', 'a', 'b']);
    });

    it('orders by occurrence even when arrival order is the reverse', () => {
        // The case the whole module exists for: one batch upload, arrival order scrambled.
        const rows = [
            row({ id: 'late-event', timestamp: 900, createdAt: 1_000 }),
            row({ id: 'early-event', timestamp: 100, createdAt: 1_001 }),
        ];
        expect([...rows].sort(byEventAtAsc).map(r => r.id)).toEqual(['early-event', 'late-event']);
    });
});
