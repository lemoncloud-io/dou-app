/**
 * `components/report-logs/MonitorStrip.tsx`
 * - Level counts and a spike flag, across the top of the console.
 *
 * "Is something on fire right now" is a different question from "find me this user's
 * logs", and it should not require switching views to answer. So the answer sits above
 * the view switch, always visible, computed from the same corpus everything else uses.
 *
 * The spike test compares the most recent bucket against the median of the ones before
 * it. A mean would be dragged up by the very spike it is meant to detect, and comparing
 * against the previous bucket alone flags ordinary jitter.
 */
import { useMemo } from 'react';

import { bucketReportLogs } from '../lib/bucketReportLogs';
import { levelBadgeClass } from '../lib/badgeClass';
import type { ReportLogRow } from '../lib/parseReportLog';

interface MonitorStripProps {
    rows: ReportLogRow[];
    /** Rows the counts are computed over, for the caption. */
    corpusSize: number;
}

/**
 * Levels shown first, in severity order rather than by frequency, so the strip reads the
 * same every time. Anything else the app emits is appended after these rather than
 * dropped — a level introduced next release must not become invisible on the screen whose
 * job is "is something on fire right now".
 */
const KNOWN_LEVELS = ['error', 'warn', 'info', 'debug'] as const;

const median = (values: number[]): number => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** How many times the latest bucket exceeds the baseline before it counts as a spike. */
const SPIKE_FACTOR = 2;
/** Below this the ratio is meaningless — 1 row against a baseline of 0 is not a spike. */
const SPIKE_MIN_COUNT = 5;

export const MonitorStrip = ({ rows, corpusSize }: MonitorStripProps) => {
    const counts = useMemo(() => {
        const byLevel = new Map<string, number>();
        let reports = 0;
        for (const row of rows) {
            if (row.type === 'log-entry') {
                const level = row.level || '(레벨 없음)';
                byLevel.set(level, (byLevel.get(level) ?? 0) + 1);
            } else reports += 1;
        }
        // Known levels first in severity order, then whatever else turned up, so the
        // numbers on screen always add up to the log rows in view.
        const known = KNOWN_LEVELS.map(level => [level, byLevel.get(level) ?? 0] as const).filter(
            ([, count]) => count > 0
        );
        const rest = Array.from(byLevel.entries())
            .filter(([level]) => !(KNOWN_LEVELS as readonly string[]).includes(level))
            .sort((a, b) => b[1] - a[1]);
        const ordered = [...known, ...rest];
        return { ordered, reports };
    }, [rows]);

    const spike = useMemo(() => {
        const buckets = bucketReportLogs(rows, 12);
        if (buckets.length < 4) return null;
        const latest = buckets[buckets.length - 1];
        const baseline = median(buckets.slice(0, -1).map(b => b.count));
        if (latest.count < SPIKE_MIN_COUNT) return null;
        // With a zero baseline, clearing SPIKE_MIN_COUNT above is the whole test — there is
        // no ratio to apply.
        if (baseline > 0 && latest.count < baseline * SPIKE_FACTOR) return null;
        return { count: latest.count, baseline };
    }, [rows]);

    return (
        <div className="flex flex-wrap items-center gap-3 text-xs">
            {counts.ordered.map(([level, count]) => (
                <span key={level} className="inline-flex items-center gap-1.5">
                    <span
                        className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${levelBadgeClass(level)}`}
                    >
                        {level}
                    </span>
                    <span className="font-mono text-foreground">{count.toLocaleString()}</span>
                </span>
            ))}
            {counts.reports > 0 && (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    제보·리포트 <span className="font-mono text-foreground">{counts.reports.toLocaleString()}</span>
                </span>
            )}
            {spike && (
                <span
                    className="rounded bg-destructive/15 px-2 py-0.5 text-destructive"
                    title={`최근 구간 ${spike.count}건 · 앞 구간 중위값 ${spike.baseline}건`}
                >
                    최근 구간 급증 {spike.count.toLocaleString()}건
                </span>
            )}
            {corpusSize > 0 && rows.length !== corpusSize && (
                <span className="text-muted-foreground">
                    필터 적용 {rows.length.toLocaleString()} / 수집 {corpusSize.toLocaleString()}건
                </span>
            )}
        </div>
    );
};
