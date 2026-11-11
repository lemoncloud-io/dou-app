/**
 * `lib/report-logs/bucketReportLogs.spec.ts`
 */
import { describe, expect, it } from 'vitest';

import { bucketReportLogs } from './bucketReportLogs';
import type { ReportLogRow } from './parseReportLog';

const row = (createdAt?: number): ReportLogRow => ({
    id: Math.random().toString(),
    type: 'error',
    title: 't',
    createdAt,
    payload: null,
    raw: {},
    parseError: false,
});

describe('bucketReportLogs', () => {
    it('returns [] with no timestamps', () => {
        expect(bucketReportLogs([row(undefined)])).toEqual([]);
    });

    it('collapses to a single bucket when all timestamps are equal', () => {
        const b = bucketReportLogs([row(100), row(100)]);
        expect(b).toHaveLength(1);
        expect(b[0].count).toBe(2);
    });

    it('distributes counts across buckets and keeps the max in the last bucket', () => {
        // times 0..10 into 10 buckets (width 1)
        const rows = [row(0), row(1), row(1), row(9), row(10)];
        const b = bucketReportLogs(rows, 10);
        expect(b).toHaveLength(10);
        expect(b.reduce((s, x) => s + x.count, 0)).toBe(5);
        expect(b[0].count).toBe(1); // t=0
        expect(b[1].count).toBe(2); // t=1,1
        expect(b[9].count).toBe(2); // t=9 and t=10 (max clamped to last)
    });
});

describe('bucketReportLogs — 발생 시각 기준', () => {
    it('buckets on the occurrence timestamp, not the arrival time', () => {
        // Two entries from one batch upload: both arrived at 10_000, but they happened
        // 1_000 apart. Bucketing by arrival would collapse them into one slot.
        const rows = [
            { ...row(10_000), timestamp: 0 },
            { ...row(10_000), timestamp: 1_000 },
        ];
        const b = bucketReportLogs(rows, 2);

        expect(b).toHaveLength(2);
        expect(b[0].count).toBe(1);
        expect(b[1].count).toBe(1);
        expect(b[0].start).toBe(0);
    });

    it('falls back to arrival time for rows with no occurrence timestamp', () => {
        // Slack reports have no `timestamp`; they must still be charted.
        const b = bucketReportLogs([row(100), { ...row(900), timestamp: 500 }], 2);

        expect(b.reduce((s, x) => s + x.count, 0)).toBe(2);
        expect(b[0].start).toBe(100);
    });
});
