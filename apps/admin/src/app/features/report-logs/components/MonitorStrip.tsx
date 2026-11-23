import { useMemo } from 'react';

import { useT } from '../../../i18n';
import { bucketReportLogs } from '../lib/bucketReportLogs';
import { levelBadgeClass } from '../lib/badgeClass';
import type { ReportLogRow } from '../lib/parseReportLog';
import { formatNumber } from '../lib/timeFormat';

interface MonitorStripProps {
    rows: ReportLogRow[];
    corpusSize: number;
}

const KNOWN_LEVELS = ['error', 'warn', 'info', 'debug'] as const;

const NO_LEVEL = '';

const median = (values: number[]): number => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const SPIKE_FACTOR = 2;
const SPIKE_MIN_COUNT = 5;

export const MonitorStrip = ({ rows, corpusSize }: MonitorStripProps) => {
    const { t, lng } = useT('allLogs');
    const n = (value: number): string => formatNumber(value, lng);
    const counts = useMemo(() => {
        const byLevel = new Map<string, number>();
        let reports = 0;
        for (const row of rows) {
            if (row.type === 'log-entry') {
                const level = row.level || NO_LEVEL;
                byLevel.set(level, (byLevel.get(level) ?? 0) + 1);
            } else reports += 1;
        }
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
                        {level === NO_LEVEL ? t('monitor.noLevel') : level}
                    </span>
                    <span className="font-mono text-foreground">{n(count)}</span>
                </span>
            ))}
            {counts.reports > 0 && (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    {t('monitor.reports')} <span className="font-mono text-foreground">{n(counts.reports)}</span>
                </span>
            )}
            {spike && (
                <span
                    className="rounded bg-destructive/15 px-2 py-0.5 text-destructive"
                    title={t(spike.count === 1 ? 'monitor.spikeTitleOne' : 'monitor.spikeTitleOther', {
                        n: n(spike.count),
                        baseline: formatNumber(spike.baseline, lng, 1),
                    })}
                >
                    {t(spike.count === 1 ? 'monitor.spikeOne' : 'monitor.spikeOther', { n: n(spike.count) })}
                </span>
            )}
            {corpusSize > 0 && rows.length !== corpusSize && (
                <span className="text-muted-foreground">
                    {t('monitor.filtered', { shown: n(rows.length), total: n(corpusSize) })}
                </span>
            )}
        </div>
    );
};
