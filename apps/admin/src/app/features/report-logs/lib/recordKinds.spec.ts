import { describe, expect, it } from 'vitest';

import { matchesRecord, recordKindOf } from './recordKinds';

import type { ReportLogRow } from './parseReportLog';

const row = (recordKind?: ReportLogRow['recordKind']) => ({ recordKind }) as ReportLogRow;

describe('recordKinds', () => {
    it('treats a record with no kind as a log', () => {
        expect(recordKindOf(row())).toBe('log');
    });

    it('shows logs only by default, statistics on request, everything with all', () => {
        expect(matchesRecord(row(), 'log')).toBe(true);
        expect(matchesRecord(row('trace'), 'log')).toBe(false);
        expect(matchesRecord(row('trace'), 'stats')).toBe(true);
        expect(matchesRecord(row(), 'stats')).toBe(false);
        expect(matchesRecord(row('event'), 'event')).toBe(true);
        expect(matchesRecord(row('event'), 'trace')).toBe(false);
        expect(matchesRecord(row('sample'), 'all')).toBe(true);
    });
});
