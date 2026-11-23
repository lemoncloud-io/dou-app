import { eventAt } from './eventTime';
import type { GoalDef } from './goals';
import type { ReportLogRow } from './parseReportLog';
import { inWindow, kstDate, kstDayStart, type ResolvedPeriod } from './period';
import { percentile } from './traceStats';

export const PERF_SPLITS = ['appVersion', 'os', 'model', 'platform'] as const;

export type PerfSplit = (typeof PERF_SPLITS)[number];

export const MIN_TO_JUDGE = 5;

export const NO_VALUE = '(none)';

export interface GoalSample {
    row: ReportLogRow;
    at: number;
    value: number;
}

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

import { compareVersions } from './versionAdoption';

export { compareVersions };

export interface SplitGroup {
    group: string;
    n: number;
    p50?: number;
    p75?: number;
    p95?: number;
    atGoal?: number;
    verdict: Verdict;
    tooFew: boolean;
    newest: boolean;
}

const valueOfSplit = (row: ReportLogRow, by: PerfSplit): string => row[by] || NO_VALUE;

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
    day: string;
    dayStart: number;
    n: number;
    value: number;
    over: boolean;
    tooFew: boolean;
}

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
    clipped: number;
    max?: number;
}

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

export const slowestSamples = (samples: GoalSample[], limit = 10): GoalSample[] =>
    [...samples].sort((a, b) => b.value - a.value || b.at - a.at).slice(0, limit);
