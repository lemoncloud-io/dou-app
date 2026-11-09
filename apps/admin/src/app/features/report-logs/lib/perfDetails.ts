/**
 * `lib/report-logs/perfDetails.ts`
 * - The numbers behind the statistics tab's "performance details" view: where exactly it is slow or
 *   failing — room entry, server requests, message sends, stalls per screen, the other web vitals.
 *
 * Every function takes one statistic's records (already narrowed to its tag and the window) and is
 * pure, so the view only lays the answers out. Counts of the sampled statistics (`api_request`,
 * `chat_send`, `long_tasks`) are weighed by `1 / sr` like `statGroups` does, so they estimate how
 * many happened rather than how many were kept; room entry and the web vitals are kept from every
 * run, where the two are the same.
 *
 * Attribute values are read as they come: a value this file does not know is shown as itself, and
 * a missing one groups under `(none)` — the same key `statGroups` uses.
 */
import type { ReportLogRow } from './parseReportLog';
import { DURATION, percentile, statGroups } from './traceStats';

/** The group key for a record without the attribute. */
export const NONE = '(none)';

const attrOf = (row: ReportLogRow, name: string): string => {
    const value = row.attrs?.[name]?.trim();
    return value ? value : NONE;
};

/** How many records one record stands for under the sampling policy. */
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

// ── Room entry ──

/** How a room entry ended, in the order the view lists them: the good ending first. */
export const ROOM_OUTCOMES = ['shown', 'empty', 'timeout', 'background', 'left'] as const;

export interface CountShare {
    key: string;
    count: number;
}

/** Room entries per outcome: the known ones in their order (absent ones left out), then the rest. */
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
    /** Median entry time of the records with this cache value. */
    median?: number;
}

/** Room entries per `cache` value, busiest first, each with its median entry time. */
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
    /** Records in the group (fetched). */
    n: number;
    /** Estimated occurrences (`Σ 1/sr`). */
    estimated: number;
    p50?: number;
    p95?: number;
}

/** Median and p95 entry time per entry path (`entry`), busiest first. */
export const roomEntryPaths = (rows: ReportLogRow[]): TimedGroup[] =>
    statGroups(rows, DURATION, 'attr:entry')
        .slice(1)
        .map(group => ({ key: group.group, n: group.n, estimated: group.estimated, p50: group.p50, p95: group.p95 }));

// ── Failures ──

const OK_OUTCOMES = new Set(['ok', 'success']);

/**
 * Whether a request or a send failed: a 4xx/5xx status class, or an outcome other than ok/success.
 * A missing value says nothing, so a record carrying neither counts as not failed.
 */
export const isFailed = (row: ReportLogRow): boolean => {
    const status = row.attrs?.status_class?.trim().toLowerCase();
    if (status && /^[45]/.test(status)) return true;
    const outcome = row.attrs?.outcome?.trim().toLowerCase();
    return !!outcome && !OK_OUTCOMES.has(outcome);
};

/** The estimated share of failures among the records, 0–1; undefined without records. */
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

// ── Server requests ──

/** A failure rate at or above this is highlighted. */
export const FAILURE_ALERT = 0.05;

/** Records a group needs before it is highlighted: one sampled failure is not a 100% failure rate. */
export const MIN_TO_ALERT = 5;
/** A p95 response time at or above this is highlighted. */
export const SLOW_ALERT_MS = 1_000;
/** Endpoints shown before "show all". */
export const TOP_ENDPOINTS = 15;

export interface EndpointStat extends TimedGroup {
    endpoint: string;
    method: string;
    /** Estimated failure share, 0–1. */
    failureRate?: number;
    /** The backends the endpoint was called on (`relay`, `cloud`), as they came. */
    backends: string[];
    failing: boolean;
    slow: boolean;
}

/** One row per endpoint and method, by estimated requests (most first), with `rtt_ms` percentiles. */
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

// ── Message send ──

export const SEND_GROUPS = ['thread', 'kind'] as const;

export type SendGroupBy = (typeof SEND_GROUPS)[number];

export interface SendStat extends TimedGroup {
    failureRate?: number;
}

/** Message sends per `thread` or `kind`, by estimated count, with duration percentiles and failures. */
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

// ── Stalls per screen ──

export interface StallScreen {
    screen: string;
    /** Screen visits with stalls, estimated. Only visits that had a long task send a record. */
    estimated: number;
    n: number;
    /** Median of the stalled time per visit (`total_ms`). */
    medianTotalMs?: number;
    /** The longest single stall seen (`max_ms`); 0 means "not this screen's own", so it is skipped. */
    worstMaxMs?: number;
}

/** Stalls per screen (`screen`), by estimated visits with stalls. */
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

// ── Other web vitals ──

export type OtherVital = 'inp' | 'cls' | 'ttfb';

export const OTHER_VITALS: OtherVital[] = ['inp', 'cls', 'ttfb'];

/**
 * Each vital's reference: INP's is the product's own; CLS and TTFB carry the web-vitals "good"
 * thresholds, shown as a reference rather than a goal. CLS is unitless — stored ×1000 to stay an
 * integer — so its values here are divided back.
 */
export const VITAL_REFERENCE: Record<OtherVital, number> = { inp: 200, cls: 0.1, ttfb: 800 };

export interface VitalReading {
    vital: OtherVital;
    n: number;
    /** The value at p75, in milliseconds (INP, TTFB) or as the plain score (CLS). */
    p75?: number;
    within?: boolean;
}

/** p75 of INP, CLS and TTFB over the `web_vitals` records. */
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
