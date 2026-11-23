import { eventAt } from './eventTime';
import type { ReportLogRow, ReportType } from './parseReportLog';

export interface ReportLogGroup {
    key: string;
    message: string;
    count: number;
    type: ReportType;
    apps: string[];
    latestAt?: number;
    sample: ReportLogRow;
}

const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim();

const firstLine = (value: string): string => value.split('\n')[0]?.trim() || value;

export const groupReportLogs = (rows: ReportLogRow[]): ReportLogGroup[] => {
    const map = new Map<string, ReportLogGroup>();
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
        group.type = Array.from(counts.entries()).reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0];
    }

    return Array.from(map.values()).sort((a, b) => b.count - a.count || (b.latestAt ?? 0) - (a.latestAt ?? 0));
};
