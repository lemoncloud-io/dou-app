/**
 * `components/report-logs/ReportLogTimeChart.tsx`
 * - Self-contained time-series bar chart (no socket-lab / .sm-root coupling).
 *   Plots report counts per equal-width time bucket; the spike (max) bar is
 *   emphasized so surges stand out.
 */
import type { TimeBucket } from '../lib/bucketReportLogs';

interface ReportLogTimeChartProps {
    buckets: TimeBucket[];
}

const fmt = (ms: number): string =>
    new Date(ms).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export const ReportLogTimeChart = ({ buckets }: ReportLogTimeChartProps) => {
    if (buckets.length === 0) {
        return <p className="px-4 py-10 text-center text-sm text-muted-foreground">표시할 데이터가 없습니다.</p>;
    }

    const max = Math.max(...buckets.map(b => b.count), 1);
    const total = buckets.reduce((s, b) => s + b.count, 0);
    const first = buckets[0];
    const last = buckets[buckets.length - 1];

    return (
        <div className="flex flex-col gap-2 p-4">
            <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                <span>
                    {buckets.length}구간 · 총 {total.toLocaleString()}건 · 최대 {max.toLocaleString()}건/구간
                </span>
            </div>
            {/* Bars: height ∝ count, spike (== max) highlighted. */}
            <div className="flex h-40 items-end gap-0.5">
                {buckets.map((b, i) => {
                    const pct = (b.count / max) * 100;
                    const isSpike = b.count === max && b.count > 0;
                    return (
                        <div
                            key={i}
                            className="group relative flex-1"
                            style={{ height: '100%' }}
                            title={`${fmt(b.start)}\n${b.count}건`}
                        >
                            <div
                                className={`absolute bottom-0 w-full rounded-t ${isSpike ? 'bg-destructive' : 'bg-primary'}`}
                                style={{ height: `${Math.max(pct, b.count > 0 ? 3 : 0)}%` }}
                            />
                        </div>
                    );
                })}
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>{fmt(first.start)}</span>
                <span>{fmt(last.end)}</span>
            </div>
        </div>
    );
};
