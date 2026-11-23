import { eventAt } from './eventTime';
import type { ReportLogRow } from './parseReportLog';

export interface TimeBucket {
    start: number;
    end: number;
    count: number;
}

export const bucketReportLogs = (rows: ReportLogRow[], bucketCount = 24): TimeBucket[] => {
    const count = Math.max(1, Math.floor(bucketCount));
    const times = rows.map(eventAt).filter((t): t is number => typeof t === 'number');
    if (times.length === 0) return [];

    const min = Math.min(...times);
    const max = Math.max(...times);
    if (min === max) return [{ start: min, end: min, count: times.length }];

    const width = (max - min) / count;
    const buckets: TimeBucket[] = Array.from({ length: count }, (_, i) => ({
        start: min + i * width,
        end: min + (i + 1) * width,
        count: 0,
    }));

    for (const t of times) {
        let idx = Math.floor((t - min) / width);
        if (idx >= count) idx = count - 1;
        if (idx < 0) idx = 0;
        buckets[idx].count += 1;
    }

    return buckets;
};
