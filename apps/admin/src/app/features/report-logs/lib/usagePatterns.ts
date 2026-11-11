/**
 * `lib/report-logs/usagePatterns.ts`
 * - The arithmetic behind the "usage patterns" view: the server's time buckets laid out for a chart,
 *   opens folded into hours of the day, and what the usage events say about sessions and screens.
 *
 * Two sources, and the view never mixes them in one number. The server counts the whole match in
 * time buckets (by arrival, Korean boundaries); the usage events fetched as rows (the newest page
 * of each) carry what the server cannot count — how long a session lasted, which screen was open
 * and for how long, how a session started.
 */
import type { ReportLogRow } from './parseReportLog';
import { kstDate, kstDayStart, type ResolvedPeriod } from './period';
import { percentile } from './traceStats';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const KST_OFFSET_MS = 9 * HOUR_MS;

export type TrendUnit = 'hour' | 'day';

export interface TrendBucket {
    /** Bucket start, epoch ms. */
    key: number;
    val: number;
    users?: number;
}

/** Days for a period longer than two days, hours otherwise — a two-day chart of two columns says nothing. */
export const trendUnitOf = (period: Pick<ResolvedPeriod, 'fromMs' | 'toMs'>): TrendUnit =>
    period.toMs - period.fromMs <= 2 * DAY_MS ? 'hour' : 'day';

/**
 * The server's buckets with the empty ones filled in, from the first covered day up to the end of
 * the window, so a quiet day reads as a short column rather than a missing one.
 *
 * The server may leave empty buckets out. When a bucket it sent does not sit on the expected
 * boundary, the buckets are returned as they came: filling would then misplace them.
 */
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

/** The Korean hour of the day (0–23) an instant falls in. */
export const kstHourOf = (ms: number): number => new Date(ms + KST_OFFSET_MS).getUTCHours();

/**
 * Hourly buckets folded into 24 hours of the day: the sum of the counts that fell in each hour,
 * across every day of the period. Counts add up; distinct users do not, so only counts are folded.
 */
export const foldByHourOfDay = (trend: TrendBucket[]): number[] => {
    const slots = Array.from({ length: 24 }, () => 0);
    for (const bucket of trend) slots[kstHourOf(bucket.key)] += bucket.val;
    return slots;
};

/** The hour with the most, the earliest on a tie; `undefined` when every hour is empty. */
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
    /** Session-end records read. */
    sessions: number;
    medianDurationMs?: number;
    medianScreens?: number;
}

/** Median length and median screens per session, from `usage.session_end` records. */
export const summarizeSessions = (rows: ReportLogRow[]): SessionSummary => {
    const durations = rows.map(row => metricOf(row, 'duration_ms')).filter((v): v is number => v !== undefined);
    const screens = rows.map(row => metricOf(row, 'screens')).filter((v): v is number => v !== undefined);
    return { sessions: rows.length, medianDurationMs: median(durations), medianScreens: median(screens) };
};

export interface ScreenUsage {
    /** The route template, e.g. `/channels/:id/room`. */
    screen: string;
    views: number;
    /** Median time spent on the screen, when any later view reported it. */
    medianDwellMs?: number;
    /** How many times the time spent was reported. */
    dwellCount: number;
}

export interface ScreenSummary {
    /** The most viewed screens, busiest first. */
    screens: ScreenUsage[];
    /** Every view read, including screens past the top. */
    totalViews: number;
    /** Distinct screens seen. */
    distinct: number;
}

/**
 * Views per screen from `usage.screen_view` records, and the time spent on each.
 *
 * A view does not know how long it will last; the next view reports it, as `prev_dwell_ms` for
 * `prev_screen`. So a screen's time is read from the views that followed it — and the last screen
 * of a session has none, which is why `dwellCount` can be below `views`.
 */
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
    /** `cold` · `warm` · `resume`, most first. */
    start: Count[];
    /** `icon` · `push` · `deeplink` · `browser`, most first. */
    entry: Count[];
    /** Session-start records read. */
    sessions: number;
}

/** How sessions began, from `usage.session_start` records. */
export const summarizeStarts = (rows: ReportLogRow[]): StartSummary => ({
    start: countBy(rows, 'start'),
    entry: countBy(rows, 'entry'),
    sessions: rows.length,
});
