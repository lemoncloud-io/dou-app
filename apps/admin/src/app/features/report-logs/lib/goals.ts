import { eventAt } from './eventTime';
import type { ReportLogRow } from './parseReportLog';
import { inWindow, type ResolvedPeriod } from './period';
import { percentile } from './traceStats';

export type GoalKey = 'boot' | 'roomEntry' | 'switch' | 'fcp' | 'lcp';

export interface GoalDef {
    key: GoalKey;
    tags: string[];
    match?: (row: ReportLogRow) => boolean;
    value: (row: ReportLogRow) => number | undefined;
    p: 75 | 95;
    targetMs?: number;
}

const duration = (row: ReportLogRow) => row.durationMs;
const vitalValue = (row: ReportLogRow) => row.metrics?.value_ms;

export const GOALS: GoalDef[] = [
    {
        key: 'boot',
        tags: ['perf.boot'],
        match: row => row.attrs?.boot_type !== 'restart',
        value: duration,
        p: 95,
        targetMs: 1_500,
    },
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

export const GOAL_TAGS = [...new Set(GOALS.flatMap(goal => goal.tags))];

export interface GoalReading {
    n: number;
    value?: number;
    median?: number;
    verdict: 'met' | 'missed' | 'none' | 'noData';
}

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
