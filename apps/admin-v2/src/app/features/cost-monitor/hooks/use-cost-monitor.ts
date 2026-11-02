/**
 * `hooks/cost-monitor/use-cost-monitor.ts`
 * - Loads one date: the tenants, then each tenant's metrics five at a time (three KST days: the two before
 *   cover the UTC days compared and calibrated against), and the Cost Explorer actuals of those UTC days.
 *
 * Not react-query: a load is a fan-out of one call per account whose rows fill in as they arrive, and a
 * newer load (another date, another stage) has to drop the calls the older one has not sent yet —
 * every metrics call is billed. A run id does that. Reloads every hour while the screen is open.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import {
    actualsOf,
    fetchActuals,
    fetchClouds,
    fetchMetrics,
    fetchTenants,
    runPool,
    type DouCloud,
} from '../api/costApi';
import { addDays, mergeSeries } from '../lib/cost';

import type { CostBases } from '../lib/costTarget';
import type { Actual, RowData } from '../lib/costRows';
import type { PoolStatus, Tenant } from '../lib/relations';

export const REFRESH_MS = 3_600_000;
const CONCURRENCY = 5;

export interface PoolInfo {
    pool: PoolStatus;
    fromList: boolean;
    duplicates: number;
    partial: string[];
}

export interface CostMonitorState {
    tenants: Tenant[];
    data: Map<string, RowData>;
    /** `map`: yesterday (UTC). `calib`: the day before — the calibration day. */
    actuals: { map?: Map<string, Actual>; calib?: Map<string, Actual>; error?: string };
    clouds: { map?: Map<string, DouCloud[]>; error?: string };
    poolInfo?: PoolInfo;
    error?: string;
    loading: boolean;
    lastAt?: number;
    reload: () => void;
}

export const useCostMonitor = (bases: CostBases, date: string): CostMonitorState => {
    const { goods, relay } = bases;
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [data, setData] = useState<Map<string, RowData>>(new Map());
    const [actuals, setActuals] = useState<CostMonitorState['actuals']>({});
    const [clouds, setClouds] = useState<CostMonitorState['clouds']>({});
    const [poolInfo, setPoolInfo] = useState<PoolInfo>();
    const [error, setError] = useState<string>();
    const [loading, setLoading] = useState(false);
    const [lastAt, setLastAt] = useState<number>();
    const run = useRef(0);

    const loadActuals = useCallback(
        (day: string): Promise<void> =>
            goods
                ? fetchActuals(goods, addDays(day, -1), day).then(
                      byDay => setActuals({ map: actualsOf(byDay, day), calib: actualsOf(byDay, addDays(day, -1)) }),
                      (e: Error) => setActuals({ error: e.message })
                  )
                : Promise.resolve(),
        [goods]
    );

    const load = useCallback(async (): Promise<void> => {
        const id = ++run.current;
        if (!goods) return;
        setLoading(true);
        setError(undefined);
        setData(new Map());
        setActuals({});
        const actualsDone = loadActuals(addDays(date, -1));
        const res = await fetchTenants(goods).catch((e: Error) => {
            setError(`Failed to load workspaces and slots: ${e.message}`);
            return undefined;
        });
        if (id !== run.current) return;
        const list = res?.tenants ?? [];
        setTenants(list);
        setPoolInfo(
            res && { pool: res.pool, fromList: res.poolFromList, duplicates: res.duplicates, partial: res.partial }
        );
        // A row with no workspace (slots only) has no metrics to ask for.
        setData(new Map(list.filter(t => !t.workspaceId).map(t => [t.key, {}])));
        await runPool(
            CONCURRENCY,
            list.flatMap(tenant => {
                const workspaceId = tenant.workspaceId;
                return workspaceId
                    ? [
                          async () => {
                              if (id !== run.current) return; // superseded: do not send the rest (billed)
                              // Finished days are cached in the tab, so an hourly reload pays for today only.
                              const row: RowData = await Promise.all(
                                  [-2, -1, 0].map(n => fetchMetrics(goods, workspaceId, addDays(date, n)))
                              ).then(
                                  days => ({ series: mergeSeries(...days.map(day => day.series)) }),
                                  (e: Error) => ({ error: e.message })
                              );
                              if (id === run.current) setData(prev => new Map(prev).set(tenant.key, row));
                          },
                      ]
                    : [];
            })
        );
        await actualsDone;
        if (id !== run.current) return;
        setLoading(false);
        setLastAt(Date.now());
    }, [goods, date, loadActuals]);

    useEffect(() => {
        void load();
    }, [load]);

    // Leaving the screen drops whatever has not been sent.
    useEffect(
        () => () => {
            run.current++;
        },
        []
    );

    useEffect(() => {
        const timer = setInterval(() => void load(), REFRESH_MS);
        return () => clearInterval(timer);
    }, [load, lastAt]);

    // DoU names once per relay; a failure leaves the table as it is.
    useEffect(() => {
        if (!relay) return;
        setClouds({});
        fetchClouds(relay).then(
            map => setClouds({ map }),
            (e: Error) => setClouds({ error: e.message })
        );
    }, [relay]);

    return {
        tenants,
        data,
        actuals,
        clouds,
        poolInfo,
        error,
        loading,
        lastAt,
        reload: () => void load(),
    };
};
