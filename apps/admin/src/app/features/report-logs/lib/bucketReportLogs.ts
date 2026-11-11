/**
 * `lib/report-logs/bucketReportLogs.ts`
 * - Buckets report rows into equal-width time slots so the time-series view can
 *   show occurrence trend and spikes over the collected corpus.
 *
 * Buckets on **occurrence** time (`eventAt`), not arrival. Batch uploads land many
 * entries at almost the same `createdAt`, so bucketing by arrival draws the shape of the
 * upload schedule rather than of the incident — which made the old chart misleading
 * rather than merely coarse. See `eventTime.ts`.
 */
import { eventAt } from './eventTime';
import type { ReportLogRow } from './parseReportLog';

export interface TimeBucket {
    start: number;
    end: number;
    count: number;
}

/**
 * Split rows into `bucketCount` equal-width time buckets spanning min→max occurrence
 * time. Returns [] when no row carries a usable clock; rows without one are ignored.
 */
export const bucketReportLogs = (rows: ReportLogRow[], bucketCount = 24): TimeBucket[] => {
    const count = Math.max(1, Math.floor(bucketCount));
    const times = rows.map(eventAt).filter((t): t is number => typeof t === 'number');
    if (times.length === 0) return [];

    const min = Math.min(...times);
    const max = Math.max(...times);
    // Zero-width span: one bucket. `end` is `start` so a consumer deriving width from
    // `end - start` gets 0 rather than a fictional 1 ms.
    if (min === max) return [{ start: min, end: min, count: times.length }];

    const width = (max - min) / count;
    const buckets: TimeBucket[] = Array.from({ length: count }, (_, i) => ({
        start: min + i * width,
        end: min + (i + 1) * width,
        count: 0,
    }));

    for (const t of times) {
        let idx = Math.floor((t - min) / width);
        if (idx >= count) idx = count - 1; // max value lands in the last bucket
        if (idx < 0) idx = 0;
        buckets[idx].count += 1;
    }

    return buckets;
};
