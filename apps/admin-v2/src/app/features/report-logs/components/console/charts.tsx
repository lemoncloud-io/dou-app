/**
 * `components/report-logs/console/charts.tsx`
 * - The three chart shapes the statistics views use, drawn with plain elements.
 *
 * Columns over time, shares as horizontal bars, and a distribution. No chart library: the views
 * need little more than bars with labels, and plain elements take the theme tokens, render in tests
 * and stay accessible (each chart carries a label, each bar a title with its exact value).
 */
import type { ReactNode } from 'react';

export type ChartTone = 'primary' | 'error' | 'good' | 'muted';

const FILL: Record<ChartTone, string> = {
    primary: 'bg-primary/70',
    error: 'bg-red-500/65',
    good: 'bg-emerald-500/70',
    muted: 'bg-muted-foreground/30',
};

export interface Column {
    key: string | number;
    /** Shown under the column; leave empty to label only some columns. */
    label?: string;
    value: number;
    /** Full text for the tooltip. */
    title?: string;
    tone?: ChartTone;
}

/**
 * Vertical columns, one per bucket — days, hours. Values are printed above the columns when there
 * are few enough to read.
 */
export const ColumnChart = ({
    columns,
    label,
    format = String,
    height = 'h-32',
    tone = 'primary',
}: {
    columns: Column[];
    label: string;
    format?: (value: number) => string;
    height?: string;
    tone?: ChartTone;
}) => {
    if (columns.length === 0) return null;
    const max = Math.max(1, ...columns.map(column => column.value));
    const showValues = columns.length <= 14;
    return (
        <div className="flex flex-col gap-1.5">
            <div className={`flex ${height} items-end gap-1`} role="img" aria-label={label}>
                {columns.map(column => (
                    <div
                        key={column.key}
                        className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
                    >
                        {showValues && (
                            <span className="text-[11px] tabular-nums text-muted-foreground">
                                {format(column.value)}
                            </span>
                        )}
                        <div
                            className={`w-full max-w-12 rounded-t ${column.value > 0 ? FILL[column.tone ?? tone] : 'bg-border'}`}
                            style={{ height: column.value > 0 ? `${Math.max(3, (column.value / max) * 100)}%` : '2px' }}
                            title={column.title ?? `${column.label ?? column.key} · ${format(column.value)}`}
                        />
                    </div>
                ))}
            </div>
            {columns.some(column => column.label) && (
                <div className="flex gap-1">
                    {columns.map(column => (
                        <span
                            key={column.key}
                            className="min-w-0 flex-1 truncate text-center text-[11px] text-muted-foreground"
                        >
                            {column.label ?? ''}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
};

export interface Share {
    key: string;
    label: ReactNode;
    value: number;
    /** A second line under the label (e.g. a count or a median). */
    sub?: ReactNode;
    tone?: ChartTone;
}

/**
 * Horizontal bars for "how is it split": versions, screens, outcomes. Each row shows its label, its
 * value and its share of `total` (the sum of the values when not given).
 */
export const ShareBars = ({
    shares,
    label,
    total,
    format = String,
    tone = 'primary',
}: {
    shares: Share[];
    label: string;
    total?: number;
    format?: (value: number) => string;
    tone?: ChartTone;
}) => {
    const sum = total ?? shares.reduce((acc, share) => acc + share.value, 0);
    return (
        <ul className="flex flex-col gap-3" aria-label={label}>
            {shares.map(share => {
                const pct = sum > 0 ? (share.value / sum) * 100 : 0;
                return (
                    <li key={share.key} className="flex flex-col gap-1.5">
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="min-w-0 truncate text-foreground">{share.label}</span>
                            <span className="shrink-0 tabular-nums text-muted-foreground">
                                <span className="font-medium text-foreground">{format(share.value)}</span>
                                {sum > 0 && ` · ${pct < 1 && pct > 0 ? '<1' : Math.round(pct)}%`}
                            </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted">
                            <div
                                className={`h-2 rounded-full ${FILL[share.tone ?? tone]}`}
                                style={{ width: `${Math.max(pct > 0 ? 1.5 : 0, pct)}%` }}
                            />
                        </div>
                        {share.sub && <span className="text-xs text-muted-foreground">{share.sub}</span>}
                    </li>
                );
            })}
        </ul>
    );
};

export interface Bin {
    from: number;
    to: number;
    count: number;
}

/**
 * A distribution: equal-width bins with the range printed at both ends, and an optional marker
 * (a target) drawn where it falls.
 */
export const Histogram = ({
    bins,
    label,
    format,
    marker,
}: {
    bins: Bin[];
    label: string;
    format: (value: number) => string;
    marker?: { value: number; label: string };
}) => {
    if (bins.length === 0) return null;
    const max = Math.max(1, ...bins.map(bin => bin.count));
    const low = bins[0].from;
    const high = bins[bins.length - 1].to;
    const markerPct =
        marker && high > low && marker.value >= low && marker.value <= high
            ? ((marker.value - low) / (high - low)) * 100
            : undefined;
    return (
        <div className="flex flex-col gap-1.5">
            <div className="relative flex h-28 items-end gap-[2px]" role="img" aria-label={label}>
                {bins.map((bin, i) => (
                    <div
                        key={i}
                        className={`flex-1 rounded-t ${bin.count > 0 ? 'bg-primary/60' : 'bg-border'}`}
                        style={{ height: bin.count > 0 ? `${Math.max(3, (bin.count / max) * 100)}%` : '2px' }}
                        title={`${format(bin.from)} – ${format(bin.to)} · ${bin.count}`}
                    />
                ))}
                {markerPct !== undefined && marker && (
                    <div
                        className="pointer-events-none absolute inset-y-0 w-0.5 bg-foreground/70"
                        style={{ left: `${markerPct}%` }}
                        title={marker.label}
                    />
                )}
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>{format(low)}</span>
                {marker && markerPct !== undefined && <span>{marker.label}</span>}
                <span>{format(high)}</span>
            </div>
        </div>
    );
};

/** The table style every statistics view uses for per-group numbers. */
export const tableClass = {
    table: 'w-full text-sm',
    head: 'border-b border-border text-left text-[13px] font-medium text-muted-foreground',
    th: 'px-4 py-2.5 font-medium',
    thNum: 'px-4 py-2.5 text-right font-medium',
    row: 'border-b border-border last:border-0',
    td: 'px-4 py-3 text-foreground',
    tdNum: 'px-4 py-3 text-right tabular-nums text-foreground',
};
