/**
 * `components/report-logs/ReportLogTimeChart.tsx`
 * - Self-contained time-series bar chart (no socket-lab / .sm-root coupling).
 *   Plots log counts per equal-width time bucket; the spike (max) bar is
 *   emphasized so surges stand out.
 *
 * Buckets come from `bucketReportLogs`, which splits on **occurrence** time. That is what
 * makes this chart a picture of the incident rather than of the upload schedule — see
 * `eventTime.ts`.
 */
import { useT } from '../../../i18n';
import type { TimeBucket } from '../lib/bucketReportLogs';
import { formatDateTime, formatNumber } from '../lib/timeFormat';

interface ReportLogTimeChartProps {
    buckets: TimeBucket[];
}

export const ReportLogTimeChart = ({ buckets }: ReportLogTimeChartProps) => {
    const { t, lng } = useT('allLogs');
    const fmt = (ms: number): string => formatDateTime(ms, lng);
    const n = (value: number): string => formatNumber(value, lng);

    if (buckets.length === 0) {
        return <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t('chart.empty')}</p>;
    }

    const max = Math.max(...buckets.map(b => b.count), 1);
    const total = buckets.reduce((s, b) => s + b.count, 0);
    const first = buckets[0];
    const last = buckets[buckets.length - 1];

    return (
        <div className="flex flex-col gap-2 p-4">
            <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                <span>{t('chart.summary', { buckets: n(buckets.length), total: n(total), max: n(max) })}</span>
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
                            title={`${fmt(b.start)}\n${t(b.count === 1 ? 'rowsOne' : 'rowsOther', { n: n(b.count) })}`}
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
