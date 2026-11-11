/**
 * `lib/report-logs/goals.ts`
 * - The performance goals the statistics tab reads against, and how one is measured from records.
 *
 * The targets are the product's own (boot 1.5 s and switches 1 s at p95, FCP 1.8 s and LCP 2.5 s at
 * p75 — the web-vitals "good" thresholds). Room entry deliberately has no target yet: its card
 * shows the numbers without a verdict rather than inventing one.
 */
import { eventAt } from './eventTime';
import type { ReportLogRow } from './parseReportLog';
import { inWindow, type ResolvedPeriod } from './period';
import { percentile } from './traceStats';

export type GoalKey = 'boot' | 'roomEntry' | 'switch' | 'fcp' | 'lcp';

export interface GoalDef {
    key: GoalKey;
    /** Statistics tags the goal is read from; fetched one by one, narrowed on the server. */
    tags: string[];
    /** Keep only these records of the tag (a web-vitals record names its vital in an attribute). */
    match?: (row: ReportLogRow) => boolean;
    /** The value of one record, in milliseconds. */
    value: (row: ReportLogRow) => number | undefined;
    /** Which percentile the target is read at. */
    p: 75 | 95;
    targetMs?: number;
}

const duration = (row: ReportLogRow) => row.durationMs;
const vitalValue = (row: ReportLogRow) => row.metrics?.value_ms;

export const GOALS: GoalDef[] = [
    { key: 'boot', tags: ['perf.boot'], value: duration, p: 95, targetMs: 1_500 },
    { key: 'roomEntry', tags: ['perf.chat_room_open'], value: duration, p: 95 },
    { key: 'switch', tags: ['perf.cloud_switch', 'perf.site_switch'], value: duration, p: 95, targetMs: 1_000 },
    {
        key: 'fcp',
        tags: ['perf.web_vitals'],
        match: row => row.attrs?.vital === 'fcp',
        value: vitalValue,
        p: 75,
        targetMs: 1_800,
    },
    {
        key: 'lcp',
        tags: ['perf.web_vitals'],
        match: row => row.attrs?.vital === 'lcp',
        value: vitalValue,
        p: 75,
        targetMs: 2_500,
    },
];

/** Every tag any goal reads, once each. */
export const GOAL_TAGS = [...new Set(GOALS.flatMap(goal => goal.tags))];

export interface GoalReading {
    /** Records measured. */
    n: number;
    /** Value at the goal's percentile. */
    value?: number;
    median?: number;
    /** `met` / `missed` against the target; `none` without one; `noData` without records. */
    verdict: 'met' | 'missed' | 'none' | 'noData';
}

/** Read one goal over the records of its tags that fall in the window. */
export const readGoal = (
    goal: GoalDef,
    rows: ReportLogRow[],
    period: Pick<ResolvedPeriod, 'fromMs' | 'toMs'>
): GoalReading => {
    const values = rows
        .filter(
            row =>
                row.tag !== undefined &&
                goal.tags.includes(row.tag) &&
                row.recordKind !== undefined &&
                row.recordKind !== 'log'
        )
        .filter(row => (goal.match ? goal.match(row) : true) && inWindow(eventAt(row), period))
        .map(goal.value)
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
        .sort((a, b) => a - b);
    if (values.length === 0) return { n: 0, verdict: 'noData' };
    const value = percentile(values, goal.p);
    const verdict =
        goal.targetMs === undefined || value === undefined ? 'none' : value <= goal.targetMs ? 'met' : 'missed';
    return { n: values.length, value, median: percentile(values, 50), verdict };
};
