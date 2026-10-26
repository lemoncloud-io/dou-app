/**
 * `lib/report-logs/errorGroups.ts`
 * - Errors grouped into incidents (one per tag), with how often, for how many people, since when.
 *
 * Two sources can answer "how many", and the honest answer depends on which one covers the period:
 *
 * - **The fetched rows**, when they hold the whole period. The fetch stops at one page, newest
 *   first, so it holds the whole period exactly when it was not cut short, or when it reaches back
 *   past the period's start. Then every number — count, people, first and last time, the trend — is
 *   exact for the window, at the minute, by occurrence time.
 * - **The server's aggregation** otherwise. It counts the whole match whatever the page size, but
 *   only over whole days by arrival time. Per-incident people and first/last times are not something
 *   it can give per tag, so those still come from the fetched rows and are marked partial.
 *
 * When the period is narrower than a day (`1h`, `24h`), the server's days are wider than the window,
 * and `wideSpan` says so rather than presenting a day's count as an hour's.
 */
import type { LogListStats } from '../api/reportLogApi';
import { eventAt } from './eventTime';
import type { ReportLogRow } from './parseReportLog';
import { inWindow, type ResolvedPeriod } from './period';

export interface ErrorGroup {
    tag: string;
    count: number;
    /** Distinct users among the fetched rows of this incident. */
    users: number;
    firstAt?: number;
    lastAt?: number;
    /** Counts per equal slice of the window, for a sparkline. */
    spark: number[];
    /** The newest fetched row of the incident. */
    latest?: ReportLogRow;
}

export interface TrendBucket {
    start: number;
    count: number;
}

export interface ErrorOverview {
    groups: ErrorGroup[];
    total: number;
    users?: number;
    trend: TrendBucket[];
    /** Where `count`, `total` and `users` come from. */
    source: 'rows' | 'server';
    /** Per-incident people, first/last and sparklines are from part of the period only. */
    partial: boolean;
    /** Server numbers cover whole days wider than the window. */
    wideSpan: boolean;
}

export interface ErrorOverviewInput {
    /** Fetched error rows, newest arrival first. */
    rows: ReportLogRow[];
    /** The fetch stopped before the end of the match. */
    truncated: boolean;
    period: Pick<ResolvedPeriod, 'fromMs' | 'toMs' | 'exact'>;
    /** The server's aggregation, when it answered with one. */
    stats?: LogListStats;
    /** Size of the whole match, from the server. */
    serverTotal?: number;
    sparkBuckets?: number;
}

/** True when the fetched rows hold every record of the window. */
export const coversWindow = (rows: ReportLogRow[], truncated: boolean, fromMs: number): boolean =>
    !truncated || rows.some(row => row.createdAt !== undefined && row.createdAt <= fromMs);

const slices = (times: number[], fromMs: number, toMs: number, count: number): number[] => {
    const out = new Array<number>(count).fill(0);
    const width = Math.max(1, (toMs - fromMs) / count);
    for (const at of times) {
        const index = Math.min(count - 1, Math.max(0, Math.floor((at - fromMs) / width)));
        out[index] += 1;
    }
    return out;
};

/** Trend buckets for the window from the rows: hourly up to two days, daily beyond. */
const rowTrend = (times: number[], fromMs: number, toMs: number): TrendBucket[] => {
    const hour = 3_600_000;
    const width = toMs - fromMs <= 2 * 24 * hour ? hour : 24 * hour;
    const count = Math.max(1, Math.ceil((toMs - fromMs) / width));
    return slices(times, fromMs, fromMs + count * width, count).map((value, i) => ({
        start: fromMs + i * width,
        count: value,
    }));
};

export const buildErrorOverview = ({
    rows,
    truncated,
    period,
    stats,
    serverTotal,
    sparkBuckets = 24,
}: ErrorOverviewInput): ErrorOverview => {
    const inPeriod = rows.filter(row => inWindow(eventAt(row), period));
    const byTag = new Map<string, ReportLogRow[]>();
    for (const row of inPeriod) {
        const tag = row.tag ?? row.title;
        const list = byTag.get(tag);
        if (list) list.push(row);
        else byTag.set(tag, [row]);
    }

    const fromRows = (tag: string, list: ReportLogRow[] = []): ErrorGroup => {
        const times = list.map(eventAt).filter((ms): ms is number => ms !== undefined);
        const latest = list.reduce<ReportLogRow | undefined>(
            (best, row) => ((eventAt(row) ?? 0) > (best ? (eventAt(best) ?? 0) : -1) ? row : best),
            undefined
        );
        return {
            tag,
            count: list.length,
            users: new Set(list.map(row => row.userId).filter(Boolean)).size,
            firstAt: times.length ? Math.min(...times) : undefined,
            lastAt: times.length ? Math.max(...times) : undefined,
            spark: slices(times, period.fromMs, period.toMs, sparkBuckets),
            latest,
        };
    };

    const allTimes = inPeriod.map(eventAt).filter((ms): ms is number => ms !== undefined);
    const covered = coversWindow(rows, truncated, period.fromMs);
    const serverGroups = stats?.groups?.tag;

    if (covered || !serverGroups) {
        const groups = [...byTag.entries()]
            .map(([tag, list]) => fromRows(tag, list))
            .sort((a, b) => b.count - a.count || (b.lastAt ?? 0) - (a.lastAt ?? 0));
        return {
            groups,
            total: inPeriod.length,
            users: new Set(inPeriod.map(row => row.userId).filter(Boolean)).size,
            trend: rowTrend(allTimes, period.fromMs, period.toMs),
            source: 'rows',
            partial: !covered,
            wideSpan: false,
        };
    }

    const groups = serverGroups.map(bucket => ({ ...fromRows(bucket.key, byTag.get(bucket.key)), count: bucket.val }));
    const trend = (stats?.trend ?? []).map(bucket => ({ start: bucket.key, count: bucket.val }));
    return {
        groups,
        total: serverTotal ?? groups.reduce((sum, group) => sum + group.count, 0),
        users: stats?.users,
        trend,
        source: 'server',
        partial: true,
        wideSpan: !period.exact,
    };
};
