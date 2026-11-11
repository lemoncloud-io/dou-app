import { isStatistic } from './recordKinds';

import type { ReportLogRow } from './parseReportLog';

/**
 * Statistics computed in the browser, over the population this screen already fetched.
 *
 * That population is a sample of the store: the server pages up to a cap and filters by date of
 * *arrival*. So every number here is "of what was fetched", and the screen says so — exact for a
 * narrow question (one trace, one version, a few days), a partial sample once the fetch hit its cap.
 * Long-range overviews and percentiles over everything are the server's job once it aggregates them.
 */

export interface StatTagSummary {
    tag: string;
    kind: 'trace' | 'sample' | 'event';
    count: number;
}

/** The statistics tags present in the rows, busiest first. */
export const statTagsOf = (rows: ReportLogRow[]): StatTagSummary[] => {
    const byTag = new Map<string, StatTagSummary>();
    for (const row of rows) {
        if (!isStatistic(row) || !row.tag) continue;
        const current = byTag.get(row.tag);
        if (current) current.count += 1;
        else byTag.set(row.tag, { tag: row.tag, kind: row.recordKind as StatTagSummary['kind'], count: 1 });
    }
    return [...byTag.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
};

/** The measure a stat can be read by: a trace's duration, or one of its metrics. */
export const DURATION = 'durationMs';

export const measuresOf = (rows: ReportLogRow[]): string[] => {
    const names = new Set<string>();
    for (const row of rows) {
        if (row.durationMs !== undefined) names.add(DURATION);
        for (const key of Object.keys(row.metrics ?? {})) names.add(key);
    }
    return [...names].sort((a, b) => (a === DURATION ? -1 : b === DURATION ? 1 : a.localeCompare(b)));
};

/** What a row can be grouped by: its attributes, and the context axes worth comparing. */
const CONTEXT_GROUPS = ['appVersion', 'webVersion', 'platform', 'host', 'os', 'model', 'routeTemplate'] as const;

export const groupKeysOf = (rows: ReportLogRow[]): string[] => {
    const keys = new Set<string>();
    for (const row of rows) for (const key of Object.keys(row.attrs ?? {})) keys.add(`attr:${key}`);
    return [...[...keys].sort(), ...CONTEXT_GROUPS];
};

const groupValueOf = (row: ReportLogRow, by: string): string => {
    if (!by) return '(all)';
    if (by.startsWith('attr:')) return row.attrs?.[by.slice(5)] ?? '(none)';
    return (row[by as (typeof CONTEXT_GROUPS)[number]] as string | undefined) ?? '(none)';
};

const measureOf = (row: ReportLogRow, measure: string): number | undefined =>
    measure === DURATION ? row.durationMs : row.metrics?.[measure];

/**
 * The value at a percentile of sorted values, by linear interpolation between the two closest ranks —
 * the definition spreadsheets use (`PERCENTILE.INC`), so a reader can check it by hand.
 *
 * Position `h = (n − 1) × p`; the value is `x[⌊h⌋] + (h − ⌊h⌋) × (x[⌊h⌋+1] − x[⌊h⌋])`. A single value is
 * every percentile of itself. Interpolating keeps a tail percentile from snapping to whichever record
 * happens to sit at the rank — on the small samples this view works with, that jump is most of the
 * difference between two runs of the same code.
 */
export const percentile = (sorted: number[], p: number): number | undefined => {
    const n = sorted.length;
    if (!n) return undefined;
    if (n === 1) return sorted[0];
    const h = (n - 1) * (p / 100);
    const low = Math.floor(h);
    const high = Math.min(n - 1, low + 1);
    return sorted[low] + (h - low) * (sorted[high] - sorted[low]);
};

export interface StatGroup {
    group: string;
    /** Records in the fetched population. */
    n: number;
    /**
     * The count weighed by each record's sampling rate (`Σ 1/sr`) — an estimate of how many happened,
     * when the policy kept only a share. Equal to `n` at 100%.
     */
    estimated: number;
    /** Distinct users among the records. */
    users: number;
    /** Records that carry the measure. Percentiles are over these. */
    measured: number;
    p50?: number;
    p75?: number;
    p95?: number;
    p99?: number;
    mean?: number;
}

const summarize = (group: string, rows: ReportLogRow[], measure: string): StatGroup => {
    const values = rows
        .map(row => measureOf(row, measure))
        .filter((v): v is number => v !== undefined)
        .sort((a, b) => a - b);
    const estimated = rows.reduce((sum, row) => sum + (row.sr && row.sr > 0 ? 1 / row.sr : 1), 0);
    return {
        group,
        n: rows.length,
        estimated: Math.round(estimated),
        users: new Set(rows.map(row => row.userId).filter(Boolean)).size,
        measured: values.length,
        p50: percentile(values, 50),
        p75: percentile(values, 75),
        p95: percentile(values, 95),
        p99: percentile(values, 99),
        mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined,
    };
};

/** One row per group value, busiest first, with an `(all)` total first when grouping. */
export const statGroups = (rows: ReportLogRow[], measure: string, by: string): StatGroup[] => {
    const total = summarize('(all)', rows, measure);
    if (!by) return [total];
    const buckets = new Map<string, ReportLogRow[]>();
    for (const row of rows) {
        const key = groupValueOf(row, by);
        const list = buckets.get(key);
        if (list) list.push(row);
        else buckets.set(key, [row]);
    }
    const groups = [...buckets].map(([key, list]) => summarize(key, list, measure));
    groups.sort((a, b) => b.n - a.n || a.group.localeCompare(b.group));
    return [total, ...groups];
};

export interface HistogramBin {
    from: number;
    to: number;
    count: number;
}

/** Equal-width bins over the measure, for the distribution chart. Empty when nothing is measured. */
export const histogram = (rows: ReportLogRow[], measure: string, bins = 20): HistogramBin[] => {
    const values = rows.map(row => measureOf(row, measure)).filter((v): v is number => v !== undefined);
    if (!values.length) return [];
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) return [{ from: min, to: max, count: values.length }];
    const width = (max - min) / bins;
    const out = Array.from({ length: bins }, (_, i) => ({
        from: min + i * width,
        to: min + (i + 1) * width,
        count: 0,
    }));
    for (const value of values) out[Math.min(bins - 1, Math.floor((value - min) / width))].count += 1;
    return out;
};
