/**
 * `components/report-logs/StatsPanel.tsx`
 * - Statistics over the collected rows: one statistic, read by one measure, split by one dimension.
 *
 * Computed in the browser from the rows this screen fetched, so it answers narrow questions — one
 * trace, one app version, a few days — exactly, and says when the fetch stopped at its cap and the
 * rows are only part of the period. Overviews over weeks are the server's to aggregate; this panel
 * does not pretend to be one.
 */
import { useMemo } from 'react';

import { isStatistic } from '../lib/recordKinds';
import { DURATION, groupKeysOf, histogram, measuresOf, statGroups, statTagsOf } from '../lib/traceStats';

import type { StatsView } from '../hooks/use-log-console-state';
import type { ReportLogRow } from '../lib/parseReportLog';

interface StatsPanelProps {
    /** The collected rows after every other filter except the record filter. */
    rows: ReportLogRow[];
    view: StatsView;
    onView: (patch: Partial<StatsView>) => void;
    /** The fetch stopped before it had every row of the period. */
    partial: boolean;
}

const fieldClass =
    'rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring';

const formatValue = (value: number | undefined, measure: string): string => {
    if (value === undefined) return '—';
    // Rounded for display only, so a metric below 1 still reads as more than zero.
    const shown = value.toLocaleString(undefined, { maximumFractionDigits: Math.abs(value) < 10 ? 1 : 0 });
    return measure === DURATION || measure.endsWith('_ms') ? `${shown} ms` : shown;
};

export const StatsPanel = ({ rows, view, onView, partial }: StatsPanelProps) => {
    const tags = useMemo(() => statTagsOf(rows), [rows]);
    const tag = view.tag && tags.some(t => t.tag === view.tag) ? view.tag : tags[0]?.tag;
    // A log that happens to share the tag is not one of these records.
    const picked = useMemo(() => rows.filter(row => isStatistic(row) && row.tag === tag), [rows, tag]);
    const kind = tags.find(t => t.tag === tag)?.kind;

    const measures = useMemo(() => measuresOf(picked), [picked]);
    const measure = view.measure && measures.includes(view.measure) ? view.measure : (measures[0] ?? '');
    const groupKeys = useMemo(() => groupKeysOf(picked), [picked]);
    const by = view.by && groupKeys.includes(view.by) ? view.by : '';

    const groups = useMemo(() => statGroups(picked, measure, by), [picked, measure, by]);
    const bins = useMemo(() => (measure ? histogram(picked, measure) : []), [picked, measure]);
    const tallest = Math.max(1, ...bins.map(bin => bin.count));
    const sampled = picked.some(row => row.sr !== undefined && row.sr < 1);

    // "No data" and "zero" are different answers: an empty collection says nothing about whether
    // the thing happened, only that none of it was fetched.
    if (!tags.length) {
        return (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                No statistics in the collected rows. Statistics are off until the sampling policy turns them on, and the
                date range, the pins or a report-type filter other than Log or All may leave none in view.
            </p>
        );
    }

    return (
        <div className="flex flex-col gap-4 p-4">
            <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                    Statistic
                    <select
                        value={tag}
                        onChange={e => onView({ tag: e.target.value, measure: '', by: '' })}
                        className={fieldClass}
                    >
                        {tags.map(t => (
                            <option key={t.tag} value={t.tag}>
                                {t.tag} · {t.kind} ({t.count.toLocaleString()})
                            </option>
                        ))}
                    </select>
                </label>
                {measures.length > 0 && (
                    <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                        Measure
                        <select
                            value={measure}
                            onChange={e => onView({ measure: e.target.value })}
                            className={fieldClass}
                        >
                            {measures.map(m => (
                                <option key={m} value={m}>
                                    {m === DURATION ? 'duration' : m}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
                <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                    Split by
                    <select value={by} onChange={e => onView({ by: e.target.value })} className={fieldClass}>
                        <option value="">—</option>
                        {groupKeys.map(key => (
                            <option key={key} value={key}>
                                {key.startsWith('attr:') ? key.slice(5) : key}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            <p className="text-[11px] leading-snug text-muted-foreground">
                Over the {picked.length.toLocaleString()} collected <span className="font-mono">{tag}</span> records
                {kind === 'event' ? '' : ', percentiles by nearest rank'}.{' '}
                {partial && (
                    <span className="font-semibold text-foreground">
                        Partial sample — the collection stopped at its cap; narrow the range for the whole period.{' '}
                    </span>
                )}
                {sampled && 'Some records were sampled; the estimated count weighs each by 1 / its sampling rate. '}
                Percentiles over a small n move a lot — read them with n.
            </p>

            <div className="overflow-auto">
                <table className="w-full text-sm">
                    <thead className="text-left text-[11px] uppercase text-muted-foreground">
                        <tr>
                            <th className="py-1 pr-3 font-medium">
                                {by ? (by.startsWith('attr:') ? by.slice(5) : by) : 'Group'}
                            </th>
                            <th className="py-1 pr-3 text-right font-medium">n</th>
                            <th className="py-1 pr-3 text-right font-medium">Est.</th>
                            <th className="py-1 pr-3 text-right font-medium">Users</th>
                            {measure && (
                                <>
                                    <th className="py-1 pr-3 text-right font-medium">p50</th>
                                    <th className="py-1 pr-3 text-right font-medium">p75</th>
                                    <th className="py-1 pr-3 text-right font-medium">p95</th>
                                    <th className="py-1 pr-3 text-right font-medium">p99</th>
                                    <th className="py-1 text-right font-medium">Mean</th>
                                </>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {groups.map((group, index) => (
                            <tr
                                key={group.group}
                                className={index === 0 && by ? 'border-b border-border font-medium' : ''}
                            >
                                <td className="py-1 pr-3 font-mono text-xs">{group.group}</td>
                                <td className="py-1 pr-3 whitespace-nowrap text-right tabular-nums">
                                    {group.n.toLocaleString()}
                                </td>
                                <td className="py-1 pr-3 whitespace-nowrap text-right tabular-nums">
                                    {group.estimated.toLocaleString()}
                                </td>
                                <td className="py-1 pr-3 whitespace-nowrap text-right tabular-nums">
                                    {group.users.toLocaleString()}
                                </td>
                                {measure && (
                                    <>
                                        <td className="py-1 pr-3 whitespace-nowrap text-right tabular-nums">
                                            {formatValue(group.p50, measure)}
                                        </td>
                                        <td className="py-1 pr-3 whitespace-nowrap text-right tabular-nums">
                                            {formatValue(group.p75, measure)}
                                        </td>
                                        <td className="py-1 pr-3 whitespace-nowrap text-right tabular-nums">
                                            {formatValue(group.p95, measure)}
                                        </td>
                                        <td className="py-1 pr-3 whitespace-nowrap text-right tabular-nums">
                                            {formatValue(group.p99, measure)}
                                        </td>
                                        <td className="py-1 whitespace-nowrap text-right tabular-nums">
                                            {formatValue(group.mean, measure)}
                                        </td>
                                    </>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* The policy editor belongs here once the server serves the sampling policy; until then
                there is nothing to read or change, and the screen says why instead of hiding it. */}
            <section className="rounded-md border border-dashed border-border p-3 text-[11px] leading-snug text-muted-foreground">
                <h3 className="mb-1 font-semibold uppercase tracking-wide text-foreground">Sampling policy</h3>
                Which runs record statistics, and at what rate, is a policy the server serves. It has no route yet, so
                every client runs with statistics off unless a development build overrides it locally. Viewing and
                editing the policy will live here.
            </section>

            {bins.length > 1 && (
                <figure className="flex flex-col gap-1" aria-label="Distribution">
                    <div className="flex h-32 items-end gap-px">
                        {bins.map((bin, i) => (
                            <div
                                key={i}
                                className="flex-1 rounded-t bg-primary/70"
                                style={{ height: `${(bin.count / tallest) * 100}%` }}
                                title={`${Math.round(bin.from)}–${Math.round(bin.to)}: ${bin.count}`}
                            />
                        ))}
                    </div>
                    <figcaption className="flex justify-between text-[11px] text-muted-foreground">
                        <span>{formatValue(Math.round(bins[0].from), measure)}</span>
                        <span>distribution of {measure === DURATION ? 'duration' : measure}</span>
                        <span>{formatValue(Math.round(bins[bins.length - 1].to), measure)}</span>
                    </figcaption>
                </figure>
            )}
        </div>
    );
};
