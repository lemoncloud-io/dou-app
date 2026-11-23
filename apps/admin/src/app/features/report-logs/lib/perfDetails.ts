import type { ReportLogRow } from './parseReportLog';
import { DURATION, percentile, statGroups } from './traceStats';

export const NONE = '(none)';

const attrOf = (row: ReportLogRow, name: string): string => {
    const value = row.attrs?.[name]?.trim();
    return value ? value : NONE;
};

const weightOf = (row: ReportLogRow): number => (row.sr && row.sr > 0 ? 1 / row.sr : 1);

const groupBy = (rows: ReportLogRow[], keyOf: (row: ReportLogRow) => string): Map<string, ReportLogRow[]> => {
    const groups = new Map<string, ReportLogRow[]>();
    for (const row of rows) {
        const key = keyOf(row);
        const list = groups.get(key);
        if (list) list.push(row);
        else groups.set(key, [row]);
    }
    return groups;
};

const sortedValues = (rows: ReportLogRow[], read: (row: ReportLogRow) => number | undefined): number[] =>
    rows
        .map(read)
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
        .sort((a, b) => a - b);

export const ROOM_OUTCOMES = ['shown', 'empty', 'timeout', 'background', 'left'] as const;

export interface CountShare {
    key: string;
    count: number;
}

export const roomOutcomes = (rows: ReportLogRow[]): CountShare[] => {
    const counts = new Map<string, number>();
    for (const row of rows) {
        const key = attrOf(row, 'outcome');
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const known = ROOM_OUTCOMES.filter(key => counts.has(key)).map(key => ({ key, count: counts.get(key) ?? 0 }));
    const rest = [...counts]
        .filter(([key]) => !(ROOM_OUTCOMES as readonly string[]).includes(key))
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
    return [...known, ...rest];
};

export interface CacheUse extends CountShare {
    median?: number;
}

export const roomCacheUse = (rows: ReportLogRow[]): CacheUse[] =>
    [...groupBy(rows, row => attrOf(row, 'cache'))]
        .map(([key, list]) => ({
            key,
            count: list.length,
            median: percentile(
                sortedValues(list, row => row.durationMs),
                50
            ),
        }))
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

export interface TimedGroup {
    key: string;
    n: number;
    estimated: number;
    p50?: number;
    p95?: number;
}

export const roomEntryPaths = (rows: ReportLogRow[]): TimedGroup[] =>
    statGroups(rows, DURATION, 'attr:entry')
        .slice(1)
        .map(group => ({ key: group.group, n: group.n, estimated: group.estimated, p50: group.p50, p95: group.p95 }));

const OK_OUTCOMES = new Set(['ok', 'success']);

export const isFailed = (row: ReportLogRow): boolean => {
    const status = row.attrs?.status_class?.trim().toLowerCase();
    if (status && /^[45]/.test(status)) return true;
    const outcome = row.attrs?.outcome?.trim().toLowerCase();
    return !!outcome && !OK_OUTCOMES.has(outcome);
};

export const failureShare = (rows: ReportLogRow[]): number | undefined => {
    let all = 0;
    let failed = 0;
    for (const row of rows) {
        const weight = weightOf(row);
        all += weight;
        if (isFailed(row)) failed += weight;
    }
    return all > 0 ? failed / all : undefined;
};

export const FAILURE_ALERT = 0.05;

export const MIN_TO_ALERT = 5;
export const SLOW_ALERT_MS = 1_000;
export const TOP_ENDPOINTS = 15;

export interface EndpointStat extends TimedGroup {
    endpoint: string;
    method: string;
    failureRate?: number;
    backends: string[];
    failing: boolean;
    slow: boolean;
}

export const endpointStats = (rows: ReportLogRow[]): EndpointStat[] =>
    [...groupBy(rows, row => `${attrOf(row, 'method')} ${attrOf(row, 'endpoint')}`)]
        .map(([key, list]) => {
            const total = statGroups(list, 'rtt_ms', '')[0];
            const failureRate = failureShare(list);
            const backends = [...new Set(list.map(row => row.attrs?.backend?.trim()).filter(Boolean) as string[])];
            return {
                key,
                endpoint: attrOf(list[0], 'endpoint'),
                method: attrOf(list[0], 'method'),
                n: total.n,
                estimated: total.estimated,
                p50: total.p50,
                p95: total.p95,
                failureRate,
                backends: backends.sort(),
                failing: total.n >= MIN_TO_ALERT && failureRate !== undefined && failureRate >= FAILURE_ALERT,
                slow: total.n >= MIN_TO_ALERT && total.p95 !== undefined && total.p95 >= SLOW_ALERT_MS,
            };
        })
        .sort((a, b) => b.estimated - a.estimated || a.key.localeCompare(b.key));

export const SEND_GROUPS = ['thread', 'kind'] as const;

export type SendGroupBy = (typeof SEND_GROUPS)[number];

export interface SendStat extends TimedGroup {
    failureRate?: number;
}

export const sendStats = (rows: ReportLogRow[], by: SendGroupBy): SendStat[] =>
    [...groupBy(rows, row => attrOf(row, by))]
        .map(([key, list]) => {
            const total = statGroups(list, DURATION, '')[0];
            return {
                key,
                n: total.n,
                estimated: total.estimated,
                p50: total.p50,
                p95: total.p95,
                failureRate: failureShare(list),
            };
        })
        .sort((a, b) => b.estimated - a.estimated || a.key.localeCompare(b.key));

export interface StallScreen {
    screen: string;
    estimated: number;
    n: number;
    medianTotalMs?: number;
    worstMaxMs?: number;
}

export const stallScreens = (rows: ReportLogRow[]): StallScreen[] =>
    [...groupBy(rows, row => attrOf(row, 'screen'))]
        .map(([screen, list]) => {
            const maxes = sortedValues(list, row => row.metrics?.max_ms).filter(value => value > 0);
            return {
                screen,
                n: list.length,
                estimated: Math.round(list.reduce((sum, row) => sum + weightOf(row), 0)),
                medianTotalMs: percentile(
                    sortedValues(list, row => row.metrics?.total_ms),
                    50
                ),
                worstMaxMs: maxes.length ? maxes[maxes.length - 1] : undefined,
            };
        })
        .sort((a, b) => b.estimated - a.estimated || a.screen.localeCompare(b.screen));

export type OtherVital = 'inp' | 'cls' | 'ttfb';

export const OTHER_VITALS: OtherVital[] = ['inp', 'cls', 'ttfb'];

export const VITAL_REFERENCE: Record<OtherVital, number> = { inp: 200, cls: 0.1, ttfb: 800 };

export interface VitalReading {
    vital: OtherVital;
    n: number;
    p75?: number;
    within?: boolean;
}

export const otherVitals = (rows: ReportLogRow[]): VitalReading[] =>
    OTHER_VITALS.map(vital => {
        const values = sortedValues(
            rows.filter(row => row.attrs?.vital?.trim().toLowerCase() === vital),
            row => row.metrics?.value_ms
        ).map(value => (vital === 'cls' ? value / 1000 : value));
        const p75 = percentile(values, 75);
        return {
            vital,
            n: values.length,
            p75,
            within: p75 === undefined ? undefined : p75 <= VITAL_REFERENCE[vital],
        };
    });
