/**
 * `lib/report-logs/reportLogFormat.spec.ts`
 */
import { describe, expect, it } from 'vitest';

import { rowsToCsv } from './reportLogFormat';
import type { ReportLogRow } from './parseReportLog';

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

    it('carries the statistics fields, blank on a log', () => {
        const csv = rowsToCsv([
            row({ recordKind: 'trace', durationMs: 381, attrs: { entry: 'list' }, metrics: { mount: 3 }, sr: 0.5 }),
            row({}),
        ]);
        const [header, stat, log] = csv.split('\n');
        expect(header).toContain('"kind","durationMs","attrs","metrics","sr"');
        expect(stat).toContain('"trace","381"');
        expect(stat).toContain('"{""entry"":""list""}"');
        expect(log).toContain('"","","","",""');
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
