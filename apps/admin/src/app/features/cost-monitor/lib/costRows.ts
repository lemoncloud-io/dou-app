import {
    actual7,
    addDays,
    estimate,
    HOUR,
    kstDay,
    sumRange,
    utcDay,
    type CeItem,
    type EstimateOptions,
    type Series,
    type Usage,
} from './cost';

import type { Tenant } from './relations';

export interface RowData {
    series?: Series;
    error?: string;
}
export interface Actual {
    total: number;
    items: CeItem[];
}
export interface CostRow {
    tenant: Tenant;
    error?: string;
    loading: boolean;
    today: number;
    yesterdayEstimate: number;
    actual7?: number;
    actualAll?: number;
    diff?: number;
    calibEstimate: number;
    calibActual7?: number;
    factor?: number;
    factorFrom?: 'account' | 'all';
    rawToday: number;
    hours: Usage[];
    hourUsage: Usage[];
    dayUsage: Usage;
    dayCost: Usage;
}

export const ratio = (a: number, b: number | undefined): number | undefined => (b ? (a - b) / b : undefined);

export const buildCostRow = (
    tenant: Tenant,
    data: RowData | undefined,
    actual: Actual | undefined,
    calibActual: Actual | undefined,
    date: string,
    opt: EstimateOptions
): CostRow => {
    const series = data?.series ?? {};
    const [kstFrom] = kstDay(date);
    const [utcFrom, utcTo] = utcDay(addDays(date, -1));
    const [calibFrom, calibTo] = utcDay(addDays(date, -2));
    const hourUsage = Array.from({ length: 24 }, (_, h) =>
        sumRange(series, kstFrom + h * HOUR, kstFrom + (h + 1) * HOUR)
    );
    const dayUsage = sumRange(series, kstFrom, kstFrom + 24 * HOUR);
    const day = estimate(dayUsage, opt);
    const yesterdayEstimate = estimate(sumRange(series, utcFrom, utcTo), opt).total;
    const a7 = actual && actual7(actual.items);
    return {
        tenant,
        error: data?.error,
        loading: !data,
        today: day.total,
        yesterdayEstimate,
        actual7: a7,
        actualAll: actual?.total,
        diff: ratio(yesterdayEstimate, a7),
        calibEstimate: estimate(sumRange(series, calibFrom, calibTo), opt).total,
        calibActual7: calibActual && actual7(calibActual.items),
        rawToday: day.total,
        hours: hourUsage.map(usage => estimate(usage, opt).byKey),
        hourUsage,
        dayUsage,
        dayCost: day.byKey,
    };
};

const scale = (usage: Usage, f: number): Usage =>
    Object.fromEntries(Object.entries(usage).map(([key, v]) => [key, v * f])) as Usage;

const hasCalibration = (row: CostRow): boolean => row.calibActual7 !== undefined && row.calibEstimate > 0;

export const allFactorOf = (rows: CostRow[]): number | undefined => {
    const known = rows.filter(hasCalibration);
    const estimate = known.reduce((sum, row) => sum + row.calibEstimate, 0);
    return estimate > 0 ? known.reduce((sum, row) => sum + (row.calibActual7 ?? 0), 0) / estimate : undefined;
};

export const calibrateRows = (rows: CostRow[]): CostRow[] => {
    const all = allFactorOf(rows);
    return rows.map(row => {
        const own = hasCalibration(row) ? (row.calibActual7 ?? 0) / row.calibEstimate : undefined;
        const factor = own ?? all;
        if (factor === undefined) return row;
        return {
            ...row,
            factor,
            factorFrom: own !== undefined ? 'account' : 'all',
            today: row.rawToday * factor,
            hours: row.hours.map(hour => scale(hour, factor)),
            dayCost: scale(row.dayCost, factor),
        };
    });
};

export interface CostSummary {
    today: number;
    rawToday: number;
    yesterdayEstimate: number;
    withActual: number;
    actual7: number;
    actualAll: number;
    diff?: number;
    calibratedOwn: number;
    calibratedByAll: number;
}

export const summarizeRows = (rows: CostRow[]): CostSummary => {
    const sum = (list: CostRow[], pick: (row: CostRow) => number | undefined): number =>
        list.reduce((total, row) => total + (pick(row) ?? 0), 0);
    const withActual = rows.filter(row => row.actual7 !== undefined);
    return {
        today: sum(rows, row => row.today),
        rawToday: sum(rows, row => row.rawToday),
        yesterdayEstimate: sum(rows, row => row.yesterdayEstimate),
        withActual: withActual.length,
        actual7: sum(withActual, row => row.actual7),
        actualAll: sum(withActual, row => row.actualAll),
        diff: withActual.length
            ? ratio(
                  sum(withActual, row => row.yesterdayEstimate),
                  sum(withActual, row => row.actual7)
              )
            : undefined,
        calibratedOwn: rows.filter(row => row.factorFrom === 'account').length,
        calibratedByAll: rows.filter(row => row.factorFrom === 'all').length,
    };
};

export const niceCeil = (max: number): number => {
    if (!(max > 0)) return 1;
    const p = 10 ** Math.floor(Math.log10(max));
    return [1, 2, 5, 10].map(m => m * p).find(v => v >= max) ?? 10 * p;
};

export const usd = (v: number | undefined): string => (v === undefined ? '—' : `$${v.toFixed(4)}`);
export const pct = (v: number | undefined): string =>
    v === undefined || !isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
export const num = (v: number): string =>
    v >= 1000
        ? v.toLocaleString('en-US', { maximumFractionDigits: 0 })
        : v.toLocaleString('en-US', { maximumSignificantDigits: 4 });
