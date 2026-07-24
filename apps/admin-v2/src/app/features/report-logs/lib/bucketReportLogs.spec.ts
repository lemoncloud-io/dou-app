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
