/**
 * `lib/cost-monitor/cost.ts`
 * - Cost estimate and day arithmetic. Pure functions only.
 *
 * Cost = Σ usage × adjustment × list price × (1 − discount) — the same formula as the cost service's
 * own estimator.
 */
export type UsageKey =
    | 'logIngestBytes'
    | 'wsMessages'
    | 'lambdaDurationMs'
    | 'lambdaInvocations'
    | 'ddbReadUnits'
    | 'ddbWriteUnits'
    | 'sqsRequests';
export type Usage = Record<UsageKey, number>;
interface Point {
    t: string;
    v: number;
}
export type Series = Partial<Record<UsageKey, Point[]>>;
interface Rate {
    key: UsageKey;
    /** The Cost Explorer usage type this metric is billed as. */
    useType: string;
    unit: string;
    price: number;
    toUnit: (value: number, lambdaAdj: number) => number;
}
export interface EstimateOptions {
    discount: number;
    lambdaAdj: number;
}
/** One Cost Explorer line as the cost service stores it. */
export interface CeItem {
    useType: string;
    totCost: number;
}

/**
 * Seoul list prices, from the AWS Price List API. `ddbWriteUnits`: AmazonDynamoDB
 * `APN2-WriteRequestUnits`, "$0.68 per million write request units", effective 2026-08-01.
 * Lambda GB-seconds assume 512 MB.
 */
export const RATES: Rate[] = [
    { key: 'logIngestBytes', useType: 'APN2-VendedLog-Bytes', unit: 'GB', price: 0.76, toUnit: v => v / 1024 ** 3 },
    { key: 'wsMessages', useType: 'APN2-ApiGatewayMessage', unit: 'msgs', price: 1.14 / 1e6, toUnit: v => v },
    {
        key: 'lambdaDurationMs',
        useType: 'APN2-Lambda-GB-Second',
        unit: 'GB-s',
        price: 0.0000166667,
        toUnit: (v, adj) => (v / 1000) * 0.5 * adj,
    },
    { key: 'lambdaInvocations', useType: 'APN2-Request', unit: 'reqs', price: 0.2 / 1e6, toUnit: v => v },
    { key: 'ddbReadUnits', useType: 'APN2-ReadRequestUnits', unit: 'RRU', price: 0.1355 / 1e6, toUnit: v => v },
    { key: 'ddbWriteUnits', useType: 'APN2-WriteRequestUnits', unit: 'WRU', price: 0.68 / 1e6, toUnit: v => v },
    { key: 'sqsRequests', useType: 'APN2-Requests-Tier1', unit: 'reqs', price: 0.4 / 1e6, toUnit: v => v },
];
export const KEYS: UsageKey[] = RATES.map(rate => rate.key);

export const isUsageKey = (value: string): value is UsageKey => KEYS.some(key => key === value);
const USE_TYPES = new Set(RATES.map(rate => rate.useType));

/**
 * No discount and no Lambda adjustment by default. The account's real discount is not a constant to
 * keep in source: calibration to Cost Explorer carries it, and an operator can type one in.
 */
export const DEFAULTS: EstimateOptions = { discount: 0, lambdaAdj: 1 };

export const zeroUsage = (): Usage => Object.fromEntries(KEYS.map(key => [key, 0])) as Usage;

export const estimate = (usage: Usage, opt: EstimateOptions): { total: number; byKey: Usage } => {
    const byKey = Object.fromEntries(
        RATES.map(rate => [
            rate.key,
            rate.toUnit(usage[rate.key] ?? 0, opt.lambdaAdj) * rate.price * (1 - opt.discount),
        ])
    ) as Usage;
    return { total: KEYS.reduce((sum, key) => sum + byKey[key], 0), byKey };
};

/** Sums each metric's points inside [from, to). */
export const sumRange = (series: Series, from: number, to: number): Usage =>
    Object.fromEntries(
        KEYS.map(key => [
            key,
            (series[key] ?? []).reduce((sum, point) => {
                const t = Date.parse(point.t);
                return t >= from && t < to ? sum + point.v : sum;
            }, 0),
        ])
    ) as Usage;

/** Joins several days of series per metric; a later point at the same time wins. */
export const mergeSeries = (...list: Series[]): Series =>
    Object.fromEntries(
        KEYS.map(key => [
            key,
            [...new Map(list.flatMap(series => series[key] ?? []).map(point => [point.t, point] as const)).values()],
        ])
    ) as Series;

export const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const KST = 9 * HOUR;
/** A KST day `YYYY-MM-DD` as [start, end) epoch ms. */
export const kstDay = (date: string): [number, number] => {
    const start = Date.parse(`${date}T00:00:00Z`) - KST;
    return [start, start + DAY];
};
/** A UTC day `YYYY-MM-DD` as [start, end) epoch ms — Cost Explorer's day. */
export const utcDay = (date: string): [number, number] => {
    const start = Date.parse(`${date}T00:00:00Z`);
    return [start, start + DAY];
};
export const addDays = (date: string, n: number): string =>
    new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const todayKst = (now = Date.now()): string => new Date(now + KST).toISOString().slice(0, 10);
export const kstHm = (t: number): string => new Date(t + KST).toISOString().slice(11, 16);

/** Cost Explorer lines of the seven usage types only — discount lines (negative) included. */
export const actual7 = (items: CeItem[]): number =>
    items.reduce((sum, item) => (USE_TYPES.has(item.useType) ? sum + item.totCost : sum), 0);
