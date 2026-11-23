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

export const rowDays = (date: string): string[] => [addDays(date, -2), addDays(date, -1), date];

export const isDayOpen = (day: string, now = Date.now()): boolean => now < kstDay(day)[1] + HOUR;

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
                    queryFn: ({ signal }: { signal: AbortSignal }) =>
                        fetchMetrics(bases.goods, tenant.workspaceId ?? '', day, signal),
                    refetchInterval: isDayOpen(day) ? REFRESH_MS : (false as const),
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
