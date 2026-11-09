/**
 * `api/cost-monitor/costQuery.ts`
 * - The cost monitor's reads as react-query queries, folded into what the page draws.
 *
 * Metrics are one query per workspace per KST day, so a finished day is fetched once and kept (the
 * client never goes stale), while a day still filling refetches every hour with the rest of the screen.
 * Three days per row: today, plus the two UTC days the screen compares and calibrates against.
 */
import { useCallback } from 'react';

import { useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { createQueryKeys } from '@chatic/shared';

import { actualsOf, fetchActuals, fetchClouds, fetchMetrics, fetchTenants, type Metrics } from './costApi';
import { addDays, HOUR, kstDay, mergeSeries } from '../lib/cost';

import type { CostBases, CostStage } from '../lib/costTarget';
import type { RowData } from '../lib/costRows';
import type { Tenant } from '../lib/relations';

export const costKeys = createQueryKeys('cost-monitor');

export const REFRESH_MS = HOUR;

const NO_TENANTS: Tenant[] = [];

/** The KST days a row needs for `date`: two before it, then the day itself. */
export const rowDays = (date: string): string[] => [addDays(date, -2), addDays(date, -1), date];

/** CloudWatch lags, so a KST day keeps refetching until an hour after it ends. */
export const isDayOpen = (day: string, now = Date.now()): boolean => now < kstDay(day)[1] + HOUR;

/**
 * Folds the per-day results into one entry per row. A row shows only once all of its days are in (a
 * partial series would read as a cheap day). A day that failed with nothing to show stands for the row;
 * a failed hourly refetch of a day that already has data keeps that data.
 */
export const foldRows = (
    tenants: Tenant[],
    days: string[],
    results: Pick<UseQueryResult<Metrics>, 'data' | 'error'>[]
): Map<string, RowData> => {
    const withMetrics = tenants.filter(tenant => tenant.workspaceId);
    const rows = withMetrics.flatMap((tenant, i): [string, RowData][] => {
        const own = results.slice(i * days.length, (i + 1) * days.length);
        const failed = own.find(result => result.error && !result.data);
        if (failed?.error) return [[tenant.key, { error: failed.error.message }]];
        const series = own.map(result => result.data?.series);
        return series.every(Boolean)
            ? [[tenant.key, { series: mergeSeries(...series.flatMap(s => (s ? [s] : []))) }]]
            : [];
    });
    // A row with no workspace has no metrics to ask for: it is done, and empty.
    const empty = tenants.filter(tenant => !tenant.workspaceId).map((tenant): [string, RowData] => [tenant.key, {}]);
    return new Map([...empty, ...rows]);
};

export const useCostMonitor = (stage: CostStage, bases: CostBases, date: string) => {
    const tenantsQuery = useQuery({
        queryKey: costKeys.list({ stage, source: 'tenants' }),
        queryFn: () => fetchTenants(bases.goods),
        enabled: !!bases.goods,
        refetchInterval: REFRESH_MS,
        refetchOnWindowFocus: false,
    });
    // DoU names are decoration: one try, never refetched by itself.
    const cloudsQuery = useQuery({
        queryKey: costKeys.list({ stage, source: 'clouds' }),
        queryFn: () => fetchClouds(bases.relay),
        enabled: !!bases.relay,
        refetchOnWindowFocus: false,
        retry: false,
    });
    const actualsQuery = useQuery({
        queryKey: costKeys.list({ stage, source: 'actuals', date }),
        queryFn: () => fetchActuals(bases.goods, addDays(date, -2), addDays(date, -1)),
        enabled: !!bases.goods,
        refetchInterval: REFRESH_MS,
        refetchOnWindowFocus: false,
        retry: false,
    });

    const tenants = tenantsQuery.data?.tenants ?? NO_TENANTS;
    const days = rowDays(date);
    const fold = useCallback(
        (results: UseQueryResult<Metrics>[]) => {
            const ofDate = rowDays(date);
            return {
                data: foldRows(tenants, ofDate, results),
                // Refresh pays for the days still filling; a finished day is already final.
                refetchOpen: (): void =>
                    results.forEach((result, i) => isDayOpen(ofDate[i % ofDate.length]) && void result.refetch()),
            };
        },
        [tenants, date]
    );
    const metrics = useQueries({
        combine: fold,
        queries: tenants
            .filter(tenant => tenant.workspaceId)
            .flatMap(tenant =>
                days.map(day => ({
                    queryKey: costKeys.detail(`${stage}:${tenant.workspaceId}:${day}`),
                    // `signal` is read so a dropped query's call is skipped before it is sent.
                    queryFn: ({ signal }: { signal: AbortSignal }) =>
                        fetchMetrics(bases.goods, tenant.workspaceId ?? '', day, signal),
                    refetchInterval: isDayOpen(day) ? REFRESH_MS : (false as const),
                    // A finished day is final: keep it for the life of the tab, not the 5-minute default.
                    gcTime: isDayOpen(day) ? undefined : Infinity,
                    refetchOnWindowFocus: false,
                    retry: false,
                }))
            ),
    });

    const { data } = metrics;
    const byDay = actualsQuery.data?.byDay;
    return {
        tenants,
        data,
        actuals: {
            map: byDay && actualsOf(byDay, addDays(date, -1)),
            calib: byDay && actualsOf(byDay, addDays(date, -2)),
            error: actualsQuery.error?.message,
            truncated: !!actualsQuery.data?.truncated,
        },
        clouds: {
            map: cloudsQuery.data?.byAccount,
            error: cloudsQuery.error?.message,
            truncated: !!cloudsQuery.data?.truncated,
        },
        pool: tenantsQuery.data,
        error: tenantsQuery.error?.message,
        loading: tenantsQuery.isLoading || data.size < tenants.length,
        lastAt: tenantsQuery.dataUpdatedAt || undefined,
        reload: (): void => {
            void tenantsQuery.refetch();
            void actualsQuery.refetch();
            metrics.refetchOpen();
        },
    };
};
