import type { ReportLogRow } from './parseReportLog';

export const RECORD_FILTERS = ['log', 'stats', 'trace', 'sample', 'event', 'all'] as const;

export type RecordFilter = (typeof RECORD_FILTERS)[number];

export type RecordKind = 'log' | 'trace' | 'sample' | 'event';

export const recordKindOf = (row: ReportLogRow): RecordKind => row.recordKind ?? 'log';

export const isStatistic = (row: ReportLogRow): boolean => recordKindOf(row) !== 'log';

export const matchesRecord = (row: ReportLogRow, filter: RecordFilter): boolean => {
    const kind = recordKindOf(row);
    if (filter === 'all') return true;
    if (filter === 'stats') return kind !== 'log';
    return kind === filter;
};
