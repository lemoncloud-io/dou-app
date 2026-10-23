import type { ReportLogRow } from './parseReportLog';

/**
 * Which records the list shows. The log pipeline carries logs and statistics in one store; a record
 * with no `kind` (every report, every log, every entry from a build before statistics) is a log.
 *
 * The default is `log`: statistics would otherwise bury the logs this console exists to read. The
 * server cannot filter on `kind` — it is not one of the fields it stores at the top of a document —
 * so this narrows the fetched population only, like every other client axis.
 */
export const RECORD_FILTERS = ['log', 'stats', 'trace', 'sample', 'event', 'all'] as const;

export type RecordFilter = (typeof RECORD_FILTERS)[number];

export const RECORD_FILTER_LABELS: Record<RecordFilter, string> = {
    log: 'Logs',
    stats: 'All statistics',
    trace: 'Traces',
    sample: 'Samples',
    event: 'Events',
    all: 'Everything',
};

export type RecordKind = 'log' | 'trace' | 'sample' | 'event';

export const recordKindOf = (row: ReportLogRow): RecordKind => row.recordKind ?? 'log';

export const isStatistic = (row: ReportLogRow): boolean => recordKindOf(row) !== 'log';

export const matchesRecord = (row: ReportLogRow, filter: RecordFilter): boolean => {
    const kind = recordKindOf(row);
    if (filter === 'all') return true;
    if (filter === 'stats') return kind !== 'log';
    return kind === filter;
};
