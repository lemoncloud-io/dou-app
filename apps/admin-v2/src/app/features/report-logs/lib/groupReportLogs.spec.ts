/**
 * `lib/report-logs/groupReportLogs.spec.ts`
 */
import { describe, expect, it } from 'vitest';

import { groupReportLogs } from './groupReportLogs';
import type { ReportLogRow } from './parseReportLog';

const row = (over: Partial<ReportLogRow>): ReportLogRow => ({
    id: Math.random().toString(),
    type: 'error',
    title: 't',
    payload: null,
    raw: {},
    parseError: false,
    ...over,
});

describe('groupReportLogs', () => {
    it('groups by message and counts occurrences', () => {
        const groups = groupReportLogs([
            row({ message: 'Network Error', app: 'web', createdAt: 1 }),
            row({ message: 'Network Error', app: 'mobile', createdAt: 3 }),
            row({ message: 'Script error.', app: 'mobile', createdAt: 2 }),
        ]);
        expect(groups).toHaveLength(2);
        expect(groups[0].message).toBe('Network Error');
        expect(groups[0].count).toBe(2);
        expect(groups[0].apps.sort()).toEqual(['mobile', 'web']);
        expect(groups[0].latestAt).toBe(3); // most recent kept
    });

    it('sorts by count desc, then latest', () => {
        const groups = groupReportLogs([
            row({ message: 'A', createdAt: 1 }),
            row({ message: 'B', createdAt: 5 }),
            row({ message: 'B', createdAt: 6 }),
        ]);
        expect(groups.map(g => g.message)).toEqual(['B', 'A']);
    });

    it('collapses whitespace/newlines so multiline duplicates group', () => {
        const groups = groupReportLogs([row({ message: 'boom\n  at x' }), row({ message: 'boom at x' })]);
        expect(groups).toHaveLength(1);
        expect(groups[0].count).toBe(2);
    });

    it('falls back to title when message is absent', () => {
        const groups = groupReportLogs([row({ message: undefined, title: 'fallback' })]);
        expect(groups[0].message).toBe('fallback');
    });

    it('returns empty for empty input', () => {
        expect(groupReportLogs([])).toEqual([]);
    });
});
