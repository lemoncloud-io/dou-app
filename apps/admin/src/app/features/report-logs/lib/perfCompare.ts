/**
 * `lib/report-logs/perfCompare.ts`
 * - The numbers behind "did the new version get slower, and for whom?": one goal's measurements
 *   split by app version, OS, device or platform, per day, as a distribution, and the slowest cases.
 *
 * Everything reads the goal's own value (a trace's duration, a vital's `value_ms`) at the goal's own
 * percentile, so a group's verdict means the same as the overview card's. Goal records are kept from
 * every run, so counts here are real counts, not estimates.
 *
 * A percentile over a handful of measurements is mostly noise — one slow launch moves a p95 of four
 * values by seconds — so a group under `MIN_TO_JUDGE` measurements gets no verdict and is shown as
 * too few to judge rather than as a regression.
 */
import { eventAt } from './eventTime';
import type { GoalDef } from './goals';
import type { ReportLogRow } from './parseReportLog';
import { inWindow, kstDate, kstDayStart, type ResolvedPeriod } from './period';
import { percentile } from './traceStats';

export const PERF_SPLITS = ['appVersion', 'os', 'model', 'platform'] as const;

export type PerfSplit = (typeof PERF_SPLITS)[number];

/** Fewer measurements than this and a group's percentiles are shown without a verdict. */
export const MIN_TO_JUDGE = 5;

/** The group a record without the split's value falls into. */
export const NO_VALUE = '(none)';

/** One measurement of a goal: the record, when it happened and its value in milliseconds. */
export interface GoalSample {
    row: ReportLogRow;
    at: number;
    value: number;
}

/** The goal's measurements among the rows: its tags, its match, a finite value and a time. */
export const goalSamples = (
    goal: GoalDef,
    rows: ReportLogRow[],
    period?: Pick<ResolvedPeriod, 'fromMs' | 'toMs'>
): GoalSample[] => {
    const out: GoalSample[] = [];
    for (const row of rows) {
        if (!row.tag || !goal.tags.includes(row.tag) || (goal.match && !goal.match(row))) continue;
        const value = goal.value(row);
        const at = eventAt(row);
        if (typeof value !== 'number' || !Number.isFinite(value) || at === undefined) continue;
        if (period && !inWindow(at, period)) continue;
        out.push({ row, at, value });
    }
    return out;
};

export type Verdict = 'met' | 'missed' | 'none';

const verdictOf = (goal: GoalDef, value: number | undefined, n: number): Verdict =>
    goal.targetMs === undefined || value === undefined || n < MIN_TO_JUDGE
        ? 'none'
        : value <= goal.targetMs
          ? 'met'
          : 'missed';

/**
 * Version order, oldest first — the same rule the adoption view uses (`x.y.z`, a pre-release or
 * build suffix ignored), so the two views never disagree about which version is newest.
 */
import { compareVersions } from './versionAdoption';

export { compareVersions };

export interface SplitGroup {
    group: string;
    n: number;
    p50?: number;
    p75?: number;
    p95?: number;
    /** The value at the goal's percentile. */
    atGoal?: number;
    /** `none` without a target, or with too few measurements to judge. */
    verdict: Verdict;
    tooFew: boolean;
    /** The newest app version among the groups (only when splitting by app version). */
    newest: boolean;
}

const valueOfSplit = (row: ReportLogRow, by: PerfSplit): string => row[by] || NO_VALUE;

/**
 * One row per value of the split, most measurements first; app versions tie-break newest first so
 * the release under question sits near the top.
 */
export const compareBy = (samples: GoalSample[], goal: GoalDef, by: PerfSplit): SplitGroup[] => {
    const buckets = new Map<string, number[]>();
    for (const sample of samples) {
        const key = valueOfSplit(sample.row, by);
        const list = buckets.get(key);
        if (list) list.push(sample.value);
        else buckets.set(key, [sample.value]);
    }
    const versions = by === 'appVersion' ? [...buckets.keys()].filter(key => key !== NO_VALUE) : [];
    const newest = versions.length ? versions.reduce((a, b) => (compareVersions(b, a) > 0 ? b : a)) : undefined;
    const groups = [...buckets].map(([group, values]): SplitGroup => {
        values.sort((a, b) => a - b);
        const atGoal = percentile(values, goal.p);
        return {
            group,
            n: values.length,
            p50: percentile(values, 50),
            p75: percentile(values, 75),
            p95: percentile(values, 95),
            atGoal,
            verdict: verdictOf(goal, atGoal, values.length),
            tooFew: values.length < MIN_TO_JUDGE,
            newest: group === newest,
        };
    });
    return groups.sort(
        (a, b) =>
            b.n - a.n || (by === 'appVersion' ? compareVersions(b.group, a.group) : 0) || a.group.localeCompare(b.group)
    );
};

export interface DayReading {
    /** `YYYY-MM-DD`, a Korean calendar day. */
    day: string;
    /** That day's 00:00 KST, for formatting. */
    dayStart: number;
    n: number;
    /** The value at the goal's percentile over that day's measurements. */
    value: number;
    over: boolean;
    /** Fewer measurements than `MIN_TO_JUDGE`: shown, but given no verdict — as in the table. */
    tooFew: boolean;
}

/** The goal's value per Korean day, by occurrence time, oldest first; days without data are left out. */
export const dailyReadings = (samples: GoalSample[], goal: GoalDef): DayReading[] => {
    const byDay = new Map<string, number[]>();
    for (const sample of samples) {
        const day = kstDate(sample.at);
        const list = byDay.get(day);
        if (list) list.push(sample.value);
        else byDay.set(day, [sample.value]);
    }
    return [...byDay]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, values]) => {
            values.sort((a, b) => a - b);
            const value = percentile(values, goal.p) ?? 0;
            return {
                day,
                dayStart: kstDayStart(day),
                n: values.length,
                value,
                over: values.length >= MIN_TO_JUDGE && goal.targetMs !== undefined && value > goal.targetMs,
                tooFew: values.length < MIN_TO_JUDGE,
            };
        });
};

export interface Distribution {
    bins: Array<{ from: number; to: number; count: number }>;
    /** Measurements above the drawn range (the slowest 1%), left out so the tail does not flatten it. */
    clipped: number;
    max?: number;
}

/**
 * Equal-width bins from the fastest measurement to the 99th percentile. One stray minute-long
 * launch would otherwise stretch the axis until every other measurement sits in the first bar; the
 * slowest 1% is counted in `clipped` instead and named under the chart. Under 20 measurements
 * nothing is clipped — the 99th percentile of so few is just the maximum.
 */
export const distribution = (samples: GoalSample[], bins = 20): Distribution => {
    const values = samples.map(sample => sample.value).sort((a, b) => a - b);
    if (!values.length) return { bins: [], clipped: 0 };
    const max = values[values.length - 1];
    const high = values.length >= 20 ? (percentile(values, 99) ?? max) : max;
    const low = values[0];
    const drawn = values.filter(value => value <= high);
    const clipped = values.length - drawn.length;
    if (high === low) return { bins: [{ from: low, to: high, count: drawn.length }], clipped, max };
    const width = (high - low) / bins;
    const out = Array.from({ length: bins }, (_, i) => ({
        from: low + i * width,
        to: low + (i + 1) * width,
        count: 0,
    }));
    for (const value of drawn) out[Math.min(bins - 1, Math.floor((value - low) / width))].count += 1;
    return { bins: out, clipped, max };
};

/** The slowest measurements, slowest first. */
export const slowestSamples = (samples: GoalSample[], limit = 10): GoalSample[] =>
    [...samples].sort((a, b) => b.value - a.value || b.at - a.at).slice(0, limit);
