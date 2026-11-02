import { describe, expect, it } from 'vitest';

import {
    actual7,
    addDays,
    DEFAULTS,
    estimate,
    kstDay,
    mergeSeries,
    sumRange,
    todayKst,
    utcDay,
    zeroUsage,
} from './cost';
import { allFactorOf, buildCostRow, calibrateRows, niceCeil, summarizeRows, type CostRow } from './costRows';

const hourPoints = (date: string) =>
    Array.from({ length: 24 }, (_, h) => ({ t: new Date(kstDay(date)[0] + h * 3_600_000).toISOString(), v: 1 }));

describe('cost', () => {
    it('applies the discount and the Lambda adjustment', () => {
        expect(estimate({ ...zeroUsage(), sqsRequests: 1e6 }, DEFAULTS).total).toBeCloseTo(0.4, 12);
        expect(estimate({ ...zeroUsage(), sqsRequests: 1e6 }, { discount: 0.1, lambdaAdj: 1 }).total).toBeCloseTo(
            0.36,
            12
        );
        expect(estimate({ ...zeroUsage(), lambdaDurationMs: 1e6 }, { discount: 0, lambdaAdj: 2 }).total).toBeCloseTo(
            1000 * 0.5 * 2 * 0.0000166667,
            12
        );
        expect(estimate(zeroUsage(), DEFAULTS).total).toBe(0);
    });

    it('cuts a UTC day out of two KST days', () => {
        const series = mergeSeries(
            { sqsRequests: hourPoints('2026-10-26') },
            { sqsRequests: hourPoints('2026-10-27') }
        );
        expect(series.sqsRequests).toHaveLength(48);
        const [from, to] = utcDay('2026-10-26');
        expect(sumRange(series, from, to).sqsRequests).toBe(24);
        expect(new Date(kstDay('2026-10-27')[0]).toISOString()).toBe('2026-10-26T15:00:00.000Z');
        expect(sumRange({}, from, to).ddbWriteUnits).toBe(0);
    });

    it('steps days in KST', () => {
        expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
        expect(todayKst(Date.parse('2026-10-26T15:30:00Z'))).toBe('2026-10-27');
    });

    it('counts only the seven usage types, discount lines included', () => {
        expect(
            actual7([
                { useType: 'APN2-ApiGatewayMessage', totCost: 0.01 },
                { useType: 'APN2-ApiGatewayMessage', totCost: -0.001 },
                { useType: 'APN2-ApiGatewayMinute', totCost: 5 },
            ])
        ).toBeCloseTo(0.009, 12);
    });

    it('builds a row with today, yesterday and the difference', () => {
        const tenant = { key: '111111111111', workspaces: [], slots: [], dou: false };
        const series = mergeSeries(
            { sqsRequests: hourPoints('2026-10-26') },
            { sqsRequests: hourPoints('2026-10-27') }
        );
        const opt = { discount: 0, lambdaAdj: 1 };
        const row = buildCostRow(
            tenant,
            { series },
            { total: 1, items: [{ useType: 'APN2-Requests-Tier1', totCost: 24 * 0.4e-6 }] },
            undefined,
            '2026-10-27',
            opt
        );
        expect(row.loading).toBe(false);
        expect(row.hours).toHaveLength(24);
        expect(row.today).toBeCloseTo(24 * 0.4e-6, 12);
        expect(row.yesterdayEstimate).toBeCloseTo(24 * 0.4e-6, 12);
        expect(row.diff).toBeCloseTo(0, 9);
        expect(buildCostRow(tenant, undefined, undefined, undefined, '2026-10-27', opt).loading).toBe(true);
    });

    it("calibrates by the account's own ratio, else by all accounts together", () => {
        const opt = { discount: 0, lambdaAdj: 1 };
        // KST 10-25 ~ 10-27: UTC 10-25 (the calibration day of 10-27) is covered whole.
        const series = mergeSeries(
            { sqsRequests: hourPoints('2026-10-25') },
            { sqsRequests: hourPoints('2026-10-26') },
            { sqsRequests: hourPoints('2026-10-27') }
        );
        const est = 24 * 0.4e-6;
        const ce = (cost: number) => ({ total: cost, items: [{ useType: 'APN2-Requests-Tier1', totCost: cost }] });
        const row = (key: string, calib?: ReturnType<typeof ce>) =>
            buildCostRow(
                { key, workspaces: [], slots: [], dou: false },
                { series },
                undefined,
                calib,
                '2026-10-27',
                opt
            );
        const [a, b, c] = calibrateRows([row('a', ce(est * 2)), row('b', ce(est * 0.5)), row('c')]);
        expect(a.calibEstimate).toBeCloseTo(est, 12);
        expect(a.factor).toBeCloseTo(2, 9);
        expect(a.factorFrom).toBe('account');
        expect(a.today).toBeCloseTo(a.rawToday * 2, 12);
        expect(a.hours[0].sqsRequests).toBeCloseTo(0.4e-6 * 2, 12);
        expect(b.factor).toBeCloseTo(0.5, 9);
        expect(c.factorFrom).toBe('all');
        expect(c.factor).toBeCloseTo(1.25, 9);
        expect(calibrateRows([row('d')])[0].factor).toBeUndefined();
    });

    it('sums the cards and compares only rows that have an actual', () => {
        const row = (over: Partial<CostRow>): CostRow =>
            ({ today: 1, rawToday: 2, yesterdayEstimate: 1, calibEstimate: 0, ...over }) as CostRow;
        const summary = summarizeRows([
            row({ actual7: 0.5, actualAll: 3, factorFrom: 'account', calibEstimate: 2, calibActual7: 1 }),
            row({ yesterdayEstimate: 9, factorFrom: 'all' }),
        ]);

        expect(summary).toMatchObject({
            today: 2,
            rawToday: 4,
            yesterdayEstimate: 10,
            withActual: 1,
            actual7: 0.5,
            actualAll: 3,
            calibratedOwn: 1,
            calibratedByAll: 1,
        });
        expect(summary.diff).toBeCloseTo(1, 9);
        expect(summarizeRows([row({})])).toMatchObject({ withActual: 0, diff: undefined });
    });

    it('takes the all-accounts ratio over every row that has both numbers', () => {
        const row = (calibEstimate: number, calibActual7?: number) => ({ calibEstimate, calibActual7 }) as CostRow;
        expect(allFactorOf([row(1, 3), row(3, 1), row(5), row(0, 9)])).toBeCloseTo(1, 9);
        expect(allFactorOf([row(5)])).toBeUndefined();
    });

    it('rounds the axis to 1 · 2 · 5', () => {
        expect(niceCeil(0)).toBe(1);
        expect(niceCeil(0.0031)).toBe(0.005);
        expect(niceCeil(120)).toBe(200);
    });
});
