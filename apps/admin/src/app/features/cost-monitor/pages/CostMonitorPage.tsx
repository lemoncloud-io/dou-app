/**
 * `pages/cost-monitor/CostMonitorPage.tsx`
 * - What each subscription account costs: today by hour, yesterday's estimate against Cost Explorer,
 *   the slot pool, and how users, workspaces, slots and accounts connect.
 *
 * The page holds the picks; the numbers are pure functions in `lib/`, and the reads are the queries in
 * `api/costQuery.ts`. The one thing here that costs money is loading a date (metrics calls), and the
 * header counts it.
 */
import { useMemo, useState } from 'react';

import { Badge } from '@chatic/ui-kit/components/ui/badge';
import { Button } from '@chatic/ui-kit/components/ui/button';

import { counter } from '../api/costApi';
import { REFRESH_MS, useCostMonitor } from '../api/costQuery';
import { CostFilterBar, type KindFilter } from '../components/CostFilterBar';
import { CostSummary } from '../components/CostSummary';
import { TenantDetail } from '../components/TenantDetail';
import { TenantTable } from '../components/TenantTable';
import { DEFAULTS, kstHm, todayKst, type EstimateOptions } from '../lib/cost';
import { allFactorOf, buildCostRow, calibrateRows, summarizeRows } from '../lib/costRows';
import {
    configuredRelayEndpoint,
    COST_STAGE_LABEL,
    COST_STAGES,
    costBasesFor,
    initialCostStage,
    isCostStage,
    type CostStage,
} from '../lib/costTarget';
import { matchSlotFilter, type SlotFilter } from '../lib/relations';

export const CostMonitorPage = () => {
    const [stage, setStage] = useState<CostStage>(() => initialCostStage(configuredRelayEndpoint()));
    const bases = useMemo(() => costBasesFor(stage), [stage]);
    const [date, setDate] = useState(() => todayKst());
    const [kind, setKind] = useState<KindFilter>('all');
    const [slotFilter, setSlotFilter] = useState<SlotFilter>('all');
    const [opt, setOpt] = useState<EstimateOptions>(DEFAULTS);
    const [calibrate, setCalibrate] = useState(true);
    const [selected, setSelected] = useState<string>();
    const monitor = useCostMonitor(stage, bases, date);
    const { tenants, data, actuals, clouds } = monitor;

    const rows = useMemo(() => {
        const built = tenants.map(tenant =>
            buildCostRow(
                tenant,
                data.get(tenant.key),
                tenant.accountNo ? actuals.map?.get(tenant.accountNo) : undefined,
                tenant.accountNo ? actuals.calib?.get(tenant.accountNo) : undefined,
                date,
                opt
            )
        );
        return (calibrate ? calibrateRows(built) : built).sort((a, b) => b.today - a.today);
    }, [tenants, data, actuals.map, actuals.calib, date, opt, calibrate]);
    const byKind = rows.filter(row => kind === 'all' || row.tenant.dou);
    const shown = byKind.filter(row => matchSlotFilter(row.tenant, slotFilter));
    const summary = summarizeRows(shown);
    const sel = rows.find(row => row.tenant.key === selected);
    const done = rows.filter(row => !row.loading).length;

    const main = !bases.goods ? (
        <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            VITE_{stage.toUpperCase()}_GOODS_ENDPOINT is not set, so there is no goods service to call.
        </p>
    ) : monitor.error ? (
        <div className="flex flex-col items-center gap-3 px-4 py-16">
            <p className="max-w-2xl break-all text-sm text-red-400">
                Failed to load workspaces and slots: {monitor.error}
            </p>
            <Button size="sm" variant="outline" className="h-7" onClick={monitor.reload}>
                Try again
            </Button>
        </div>
    ) : monitor.loading && tenants.length === 0 ? (
        <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="h-3 rounded bg-muted" style={{ width: `${90 - (i % 4) * 12}%` }} />
            ))}
        </div>
    ) : (
        <TenantTable
            rows={shown}
            clouds={clouds.map}
            actualsLoaded={!!actuals.map}
            selected={selected}
            onSelect={key => setSelected(prev => (prev === key ? undefined : key))}
        />
    );

    return (
        <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
            <div className="flex flex-col gap-2 border-b border-border px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-sm font-semibold text-foreground">Cost Monitor</h1>
                    <span className="text-xs text-muted-foreground">
                        {monitor.loading
                            ? `Loading ${done}/${rows.length}…`
                            : monitor.lastAt
                              ? `Updated ${kstHm(monitor.lastAt)} KST · next ${kstHm(monitor.lastAt + REFRESH_MS)}`
                              : ''}
                        {` · metrics calls ${counter.metrics}`}
                    </span>
                    <span className="flex-1" />

                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        Stage
                        <select
                            className="h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus:border-ring"
                            value={stage}
                            onChange={event => {
                                const next = event.target.value;
                                if (!isCostStage(next)) return;
                                setStage(next);
                                setSelected(undefined);
                            }}
                        >
                            {COST_STAGES.map(value => (
                                <option key={value} value={value}>
                                    {COST_STAGE_LABEL[value]} (cgs-{value})
                                </option>
                            ))}
                        </select>
                    </label>
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-7"
                        disabled={!bases.goods}
                        onClick={monitor.reload}
                    >
                        Refresh
                    </Button>
                    <Badge variant={stage === 'v1' ? 'destructive' : 'outline'}>{COST_STAGE_LABEL[stage]}</Badge>
                    <span className="font-mono text-[10px] text-muted-foreground">
                        {bases.goods || '(not configured)'}
                    </span>
                </div>

                <CostFilterBar
                    date={date}
                    today={todayKst()}
                    onDateChange={setDate}
                    kind={kind}
                    onKindChange={setKind}
                    kindCount={{ all: rows.length, dou: rows.filter(row => row.tenant.dou).length }}
                    slotFilter={slotFilter}
                    onSlotFilterChange={setSlotFilter}
                    slotCount={filter => byKind.filter(row => matchSlotFilter(row.tenant, filter)).length}
                    opt={opt}
                    onOptChange={setOpt}
                    calibrate={calibrate}
                    onCalibrateChange={setCalibrate}
                    summary={summary}
                    allFactor={allFactorOf(rows)}
                />

                {clouds.error && (
                    <p className="break-all text-xs text-amber-400">
                        DoU cloud names could not be loaded ({clouds.error}). The table is unaffected.
                    </p>
                )}
                {actuals.error && (
                    <p className="break-all text-xs text-amber-400">
                        Actual cost could not be loaded through the goods service ({actuals.error}). Estimates are
                        unaffected.
                    </p>
                )}
                {actuals.truncated && (
                    <p className="text-xs text-amber-400">
                        The cost list came back shorter than its total; accounts past it read as not collected and take
                        the all-accounts ratio.
                    </p>
                )}
                {clouds.truncated && (
                    <p className="text-xs text-amber-400">
                        The relay&apos;s cloud list stopped at its paging cap; DoU names past it are not shown.
                    </p>
                )}
                {monitor.pool && monitor.pool.partial.length > 0 && (
                    <p className="text-xs text-amber-400">
                        A list stopped short of its total ({monitor.pool.partial.join(', ')}); accounts past it are not
                        shown.
                    </p>
                )}

                <CostSummary
                    date={date}
                    summary={summary}
                    pool={monitor.pool}
                    actualsLoaded={!!actuals.map}
                    actualsFailed={!!actuals.error}
                />
            </div>

            <div className="flex min-h-0 flex-1">
                {/* A <section>, not a <main>: `PrivateLayout` already renders the page's `main`. */}
                <section className="flex min-w-0 flex-1 flex-col overflow-auto">{main}</section>
                <aside className="w-[28rem] shrink-0 overflow-auto border-l border-border xl:w-[36rem]">
                    {sel ? (
                        <TenantDetail
                            row={sel}
                            date={date}
                            clouds={sel.tenant.accountNo ? clouds.map?.get(sel.tenant.accountNo) : undefined}
                            onClose={() => setSelected(undefined)}
                        />
                    ) : (
                        <p className="p-4 text-xs text-muted-foreground">
                            Pick an account to see its hours and relations.
                        </p>
                    )}
                </aside>
            </div>

            <div className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
                Every amount is an estimate from 7 metrics (S3, log storage and the like left out); the actual is Cost
                Explorer. Days are KST; yesterday is compared as a UTC day (KST 09:00 the day before to 09:00). Each
                metrics call makes the goods service call CloudWatch GetMetricData at least once ($0.01 per 1,000
                metrics).
            </div>
        </div>
    );
};
