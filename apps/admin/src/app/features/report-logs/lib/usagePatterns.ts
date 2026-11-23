import type { ReportLogRow } from './parseReportLog';
import { kstDate, kstDayStart, type ResolvedPeriod } from './period';
import { percentile } from './traceStats';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const KST_OFFSET_MS = 9 * HOUR_MS;

export type TrendUnit = 'hour' | 'day';

export interface TrendBucket {
    key: number;
    val: number;
    users?: number;
}

export const trendUnitOf = (period: Pick<ResolvedPeriod, 'fromMs' | 'toMs'>): TrendUnit =>
    period.toMs - period.fromMs <= 2 * DAY_MS ? 'hour' : 'day';

export const fillTrend = (
    trend: TrendBucket[],
    unit: TrendUnit,
    period: Pick<ResolvedPeriod, 'fromMs' | 'toMs'>
): TrendBucket[] => {
    const step = unit === 'hour' ? HOUR_MS : DAY_MS;
    const start = kstDayStart(kstDate(period.fromMs));
    const last = Math.max(period.toMs, ...trend.map(bucket => bucket.key));
    if (trend.some(bucket => bucket.key < start || (bucket.key - start) % step !== 0)) return trend;
    const byKey = new Map(trend.map(bucket => [bucket.key, bucket]));
    const out: TrendBucket[] = [];
    for (let key = start; key <= last; key += step) out.push(byKey.get(key) ?? { key, val: 0, users: 0 });
    return out;
};

export const kstHourOf = (ms: number): number => new Date(ms + KST_OFFSET_MS).getUTCHours();

export const foldByHourOfDay = (trend: TrendBucket[]): number[] => {
    const slots = Array.from({ length: 24 }, () => 0);
    for (const bucket of trend) slots[kstHourOf(bucket.key)] += bucket.val;
    return slots;
};

export const busiestHour = (slots: number[]): number | undefined => {
    let best: number | undefined;
    slots.forEach((value, hour) => {
        if (value > 0 && (best === undefined || value > slots[best])) best = hour;
    });
    return best;
};

const median = (values: number[]): number | undefined =>
    percentile(
        [...values].sort((a, b) => a - b),
        50
    );

const metricOf = (row: ReportLogRow, name: string): number | undefined => {
    const value = row.metrics?.[name];
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
};

export interface SessionSummary {
    sessions: number;
    medianDurationMs?: number;
    medianScreens?: number;
}

export const summarizeSessions = (rows: ReportLogRow[]): SessionSummary => {
    const durations = rows.map(row => metricOf(row, 'duration_ms')).filter((v): v is number => v !== undefined);
    const screens = rows.map(row => metricOf(row, 'screens')).filter((v): v is number => v !== undefined);
    return { sessions: rows.length, medianDurationMs: median(durations), medianScreens: median(screens) };
};

export interface ScreenUsage {
    screen: string;
    views: number;
    medianDwellMs?: number;
    dwellCount: number;
}

export interface ScreenSummary {
    screens: ScreenUsage[];
    totalViews: number;
    distinct: number;
}

export const summarizeScreens = (rows: ReportLogRow[], limit = 10): ScreenSummary => {
    const views = new Map<string, number>();
    const dwell = new Map<string, number[]>();
    for (const row of rows) {
        const screen = row.attrs?.screen ?? row.routeTemplate;
        if (screen) views.set(screen, (views.get(screen) ?? 0) + 1);
        const prev = row.attrs?.prev_screen;
        const spent = metricOf(row, 'prev_dwell_ms');
        if (prev && spent !== undefined) {
            const list = dwell.get(prev);
            if (list) list.push(spent);
            else dwell.set(prev, [spent]);
        }
    }
    const screens = [...views]
        .map(([screen, count]) => ({
            screen,
            views: count,
            medianDwellMs: median(dwell.get(screen) ?? []),
            dwellCount: dwell.get(screen)?.length ?? 0,
        }))
        .sort((a, b) => b.views - a.views || a.screen.localeCompare(b.screen));
    const totalViews = screens.reduce((sum, screen) => sum + screen.views, 0);
    return { screens: screens.slice(0, limit), totalViews, distinct: screens.length };
};

export interface Count {
    key: string;
    count: number;
}

const countBy = (rows: ReportLogRow[], attr: string): Count[] => {
    const counts = new Map<string, number>();
    for (const row of rows) {
        const value = row.attrs?.[attr];
        if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return [...counts]
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
};

export interface StartSummary {
    start: Count[];
    entry: Count[];
    sessions: number;
}

export const summarizeStarts = (rows: ReportLogRow[]): StartSummary => ({
    start: countBy(rows, 'start'),
    entry: countBy(rows, 'entry'),
    sessions: rows.length,
});
