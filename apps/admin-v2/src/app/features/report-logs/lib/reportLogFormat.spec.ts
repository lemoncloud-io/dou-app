/**
 * `lib/report-logs/reportLogFormat.spec.ts`
 */
import { describe, expect, it } from 'vitest';

import { formatRelative, rowsToCsv } from './reportLogFormat';
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
