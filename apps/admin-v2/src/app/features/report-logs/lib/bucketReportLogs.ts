/**
 * `lib/report-logs/bucketReportLogs.ts`
 * - Buckets report rows into equal-width time slots so the time-series view can
 *   show occurrence trend and spikes over the loaded sample.
 */
import type { ReportLogRow } from './parseReportLog';

export interface TimeBucket {
    start: number;
    end: number;
    count: number;
}

/**
 * Split rows into `bucketCount` equal-width time buckets spanning min→max createdAt.
 * Returns [] when no timestamps are present. Rows without createdAt are ignored.
 */
export const bucketReportLogs = (rows: ReportLogRow[], bucketCount = 24): TimeBucket[] => {
    const times = rows.map(r => r.createdAt).filter((t): t is number => typeof t === 'number');
    if (times.length === 0) return [];

    const min = Math.min(...times);
    const max = Math.max(...times);
    if (min === max) return [{ start: min, end: min + 1, count: times.length }];

    const width = (max - min) / bucketCount;
    const buckets: TimeBucket[] = Array.from({ length: bucketCount }, (_, i) => ({
        start: min + i * width,
        end: min + (i + 1) * width,
        count: 0,
    }));

    for (const t of times) {
        let idx = Math.floor((t - min) / width);
        if (idx >= bucketCount) idx = bucketCount - 1; // max value lands in the last bucket
        if (idx < 0) idx = 0;
        buckets[idx].count += 1;
    }

    return buckets;
};
