/**
 * `lib/report-logs/groupReportLogs.ts`
 * - Aggregates report rows by their message so recurring errors surface as
 *   "top offenders" (e.g. "Script error." × N). Grouped over whatever rows the
 *   caller passes (the loaded/filtered page), so counts are sample-scoped.
 */
import { eventAt } from './eventTime';
import type { ReportLogRow, ReportType } from './parseReportLog';

export interface ReportLogGroup {
    /** Normalized grouping key (whitespace-collapsed message/title). */
    key: string;
    /** Display message (first line of the group's message). */
    message: string;
    count: number;
    /** Dominant type across the group — the most frequent, not the first seen. */
    type: ReportType;
    /** Distinct apps seen in the group. */
    apps: string[];
    /** Most recent occurrence time (`eventAt`, so device time when the row has one). */
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
    // Type counts per group, so `type` can be the dominant one. Taking the first row's
    // type instead badges a group of errors as `unknown` whenever an unparseable row
    // happens to arrive first — and the group table renders that badge as the kind.
    const typeCounts = new Map<string, Map<ReportType, number>>();

    for (const row of rows) {
        const source = row.message ?? row.title ?? '(unknown)';
        const key = normalize(source) || '(unknown)';
        const at = eventAt(row);
        const counts = typeCounts.get(key) ?? new Map<ReportType, number>();
        counts.set(row.type, (counts.get(row.type) ?? 0) + 1);
        typeCounts.set(key, counts);
        const existing = map.get(key);
        if (existing) {
            existing.count += 1;
            if (row.app && !existing.apps.includes(row.app)) existing.apps.push(row.app);
            if ((at ?? 0) > (existing.latestAt ?? 0)) {
                existing.latestAt = at;
                existing.sample = row;
            }
        } else {
            map.set(key, {
                key,
                message: firstLine(source),
                count: 1,
                type: row.type,
                apps: row.app ? [row.app] : [],
                latestAt: at,
                sample: row,
            });
        }
    }

    for (const group of map.values()) {
        const counts = typeCounts.get(group.key);
        if (!counts) continue;
        // Ties keep whichever the iteration reached first; every candidate is equally
        // dominant, so there is nothing better to prefer.
        group.type = Array.from(counts.entries()).reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0];
    }

    return Array.from(map.values()).sort((a, b) => b.count - a.count || (b.latestAt ?? 0) - (a.latestAt ?? 0));
};
