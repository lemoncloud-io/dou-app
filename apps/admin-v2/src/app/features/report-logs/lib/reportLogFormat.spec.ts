/**
 * `lib/report-logs/reportLogFormat.spec.ts`
 */
import { describe, expect, it } from 'vitest';

import { formatAbsolute, formatRelative, rowsToCsv } from './reportLogFormat';
import type { ReportLogRow } from './parseReportLog';

const now = 1_700_000_000_000;

describe('formatRelative', () => {
    it('buckets by unit', () => {
        expect(formatRelative(undefined, now)).toBe('-');
        expect(formatRelative(now - 5_000, now)).toBe('방금');
        expect(formatRelative(now - 5 * 60_000, now)).toBe('5분 전');
        expect(formatRelative(now - 2 * 3_600_000, now)).toBe('2시간 전');
        expect(formatRelative(now - 3 * 86_400_000, now)).toBe('3일 전');
    });
});

describe('rowsToCsv', () => {
    const row = (over: Partial<ReportLogRow>): ReportLogRow => ({
        id: '1',
        type: 'error',
        title: 't',
        payload: null,
        raw: {},
        parseError: false,
        ...over,
    });

    it('emits a header + one line per row', () => {
        const csv = rowsToCsv([row({ id: 'a', message: 'hi' })]);
        const [header, line] = csv.split('\n');
        expect(header).toContain('"message"');
        expect(line).toContain('"hi"');
    });

    it('escapes quotes and commas by quoting cells', () => {
        const csv = rowsToCsv([row({ title: 'a,"b"' })]);
        // inner quotes doubled, whole cell quoted → "a,""b"""
        expect(csv).toContain('"a,""b"""');
    });
});

describe('formatAbsolute', () => {
    it('treats epoch 0 as a real instant, not as missing', () => {
        // `eventAt` deliberately keeps `timestamp: 0` rather than hiding a bad device
        // clock; the formatters must tell the same story.
        expect(formatAbsolute(0)).not.toBe('-');
    });

    it('shows a dash only when there is no instant', () => {
        expect(formatAbsolute(undefined)).toBe('-');
    });
});

describe('rowsToCsv — 확장 컬럼', () => {
    const row = (over: Partial<ReportLogRow> = {}): ReportLogRow => ({
        id: 'r1',
        type: 'log-entry',
        title: 'auth',
        payload: null,
        raw: {},
        parseError: false,
        ...over,
    });

    const cells = (csv: string) => {
        const [header, line] = csv.split('\n');
        const keys = header.split(',').map(h => h.replace(/^"|"$/g, ''));
        const values = line.split(',').map(v => v.replace(/^"|"$/g, ''));
        return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
    };

    it('exports both clocks and the gap between them', () => {
        // A spreadsheet is where this gets re-sorted, and sorting by the wrong clock is the
        // mistake the screen exists to prevent — so both are present, not one.
        const csv = rowsToCsv([row({ timestamp: 1_000, createdAt: 61_000 })]);
        const out = cells(csv);

        expect(out.eventAt).toBe(new Date(1_000).toISOString());
        expect(out.createdAt).toBe(new Date(61_000).toISOString());
        expect(out.ingestLagMs).toBe('60000');
    });

    it('leaves the lag blank when only one clock is present', () => {
        expect(cells(rowsToCsv([row({ createdAt: 5_000 })])).ingestLagMs).toBe('');
    });

    it('survives an absurd device clock instead of throwing away the whole export', () => {
        // `toISOString` throws RangeError past 8.64e15, from inside a click handler.
        const csv = rowsToCsv([row({ timestamp: 1.7e18, createdAt: 1_000 })]);

        expect(csv).toContain('r1');
        expect(cells(csv).createdAt).toBe(new Date(1_000).toISOString());
    });

    it('carries the tracking and facet axes', () => {
        const out = cells(
            rowsToCsv([row({ cid: 'c1', sid: 's1', appVersion: '1.4.0', route: '/chat/1', os: 'iOS 18.1' })])
        );

        expect(out.cid).toBe('c1');
        expect(out.sid).toBe('s1');
        expect(out.appVersion).toBe('1.4.0');
        expect(out.route).toBe('/chat/1');
        expect(out.os).toBe('iOS 18.1');
    });
});
