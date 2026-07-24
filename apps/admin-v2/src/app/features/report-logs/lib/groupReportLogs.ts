/**
 * `lib/report-logs/groupReportLogs.ts`
 * - Aggregates report rows by their message so recurring errors surface as
 *   "top offenders" (e.g. "Script error." × N). Grouped over whatever rows the
 *   caller passes (the loaded/filtered page), so counts are sample-scoped.
 */
import type { ReportLogRow, ReportType } from './parseReportLog';

export interface ReportLogGroup {
    /** Normalized grouping key (whitespace-collapsed message/title). */
    key: string;
    /** Display message (first line of the group's message). */
    message: string;
    count: number;
    /** Dominant type across the group. */
    type: ReportType;
    /** Distinct apps seen in the group. */
    apps: string[];
    /** Most recent occurrence timestamp. */
    latestAt?: number;
    /** A representative row (latest) for opening details. */
    sample: ReportLogRow;
}

/** Collapse whitespace/newlines so multi-line messages with the same text group together. */
const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim();

const firstLine = (value: string): string => value.split('\n')[0]?.trim() || value;

/**
 * Group rows by message and sort by descending count (ties broken by most
 * recent occurrence). Empty input yields an empty array.
 */
export const groupReportLogs = (rows: ReportLogRow[]): ReportLogGroup[] => {
    const map = new Map<string, ReportLogGroup>();

    for (const row of rows) {
        const source = row.message ?? row.title ?? '(unknown)';
        const key = normalize(source) || '(unknown)';
        const existing = map.get(key);
        if (existing) {
            existing.count += 1;
            if (row.app && !existing.apps.includes(row.app)) existing.apps.push(row.app);
            if ((row.createdAt ?? 0) > (existing.latestAt ?? 0)) {
                existing.latestAt = row.createdAt;
                existing.sample = row;
            }
        } else {
            map.set(key, {
                key,
                message: firstLine(source),
                count: 1,
                type: row.type,
                apps: row.app ? [row.app] : [],
                latestAt: row.createdAt,
                sample: row,
            });
        }
    }

    return Array.from(map.values()).sort((a, b) => b.count - a.count || (b.latestAt ?? 0) - (a.latestAt ?? 0));
};
