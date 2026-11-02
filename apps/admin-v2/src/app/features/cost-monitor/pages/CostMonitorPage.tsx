/**
 * `pages/cost-monitor/CostMonitorPage.tsx`
 * - What each subscription account costs: today's estimate by hour, yesterday's estimate against Cost
 *   Explorer, the slot pool, and how users, workspaces, slots and accounts connect.
 *
 * Estimates are built from the seven CloudWatch metrics the goods service relays; actuals are what the
 * cost service (bespin) collects from Cost Explorer every night, read through the goods service. The one
 * thing here that costs money is loading a date (metrics calls), and the header counts it.
 */
import { useMemo, useState } from 'react';

import { Badge } from '@chatic/ui-kit/components/ui/badge';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Switch } from '@chatic/ui-kit/components/ui/switch';

import { counter } from '../api/costApi';
import { TenantDetail } from '../components/TenantDetail';
import { TenantTable } from '../components/TenantTable';
import { REFRESH_MS, useCostMonitor } from '../hooks/use-cost-monitor';
import { addDays, DEFAULTS, HOUR, kstHm, todayKst, utcDay, type EstimateOptions } from '../lib/cost';
import { buildCostRow, calibrateRows, pct, ratio, usd, type CostRow } from '../lib/costRows';
import {
    configuredRelayEndpoint,
    COST_STAGE_LABEL,
    COST_STAGES,
    costBasesFor,
    initialCostStage,
    isCostStage,
    type CostStage,
} from '../lib/costTarget';
import { POOL_KEYS } from '../lib/display';
import { matchSlotFilter, type SlotFilter } from '../lib/relations';

const SLOT_FILTERS: [SlotFilter, string][] = [
    ['all', 'All slots'],
    ['assigned', 'In use'],
    ['idle', 'Idle'],
    ['problem', 'Problem'],
];

const Card = ({ label, value, note }: { label: string; value: string; note: string }) => (
    <div className="min-w-0 flex-1 rounded-md border border-border bg-card px-3 py-2">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold tabular-nums text-foreground">{value}</p>
        <p className="text-[10px] text-muted-foreground">{note}</p>
    </div>
);

export const CostMonitorPage = () => {
    const endpoint = configuredRelayEndpoint();
    const [stage, setStage] = useState<CostStage>(() => initialCostStage(endpoint));
    const bases = useMemo(() => costBasesFor(stage), [stage]);
    const [date, setDate] = useState(() => todayKst());
    const [kind, setKind] = useState<'all' | 'dou'>('all');
    const [slotFilter, setSlotFilter] = useState<SlotFilter>('all');
    const [opt, setOpt] = useState<EstimateOptions>(DEFAULTS);
    const [calibrate, setCalibrate] = useState(true);
    const [selected, setSelected] = useState<string>();
    const monitor = useCostMonitor(bases, date);
    const { tenants, data, actuals, clouds } = monitor;

    const now = Date.now();
    const today = todayKst(now);
    const yday = addDays(date, -1);
    const calibDay = addDays(date, -2);
    const ydayOpen = now < utcDay(yday)[1];
    // Cost Explorer fills the latest day late: 10-26 collected at 10-27 15:00 was about 17% short.
    const ydayFresh = now < utcDay(yday)[1] + 48 * HOUR;
    const isProd = stage === 'v1';

    const rows = useMemo(
        () =>
            (calibrate ? calibrateRows : (list: CostRow[]) => list)(
                tenants.map(tenant =>
                    buildCostRow(
                        tenant,
                        data.get(tenant.key),
                        tenant.accountNo ? actuals.map?.get(tenant.accountNo) : undefined,
                        tenant.accountNo ? actuals.calib?.get(tenant.accountNo) : undefined,
                        date,
                        opt
                    )
                )
            ).sort((a, b) => b.today - a.today),
        [tenants, data, actuals, date, opt, calibrate]
    );
    const byKind = rows.filter(row => kind === 'all' || row.tenant.dou);
    const shown = byKind.filter(row => matchSlotFilter(row.tenant, slotFilter));
    const sum = (pick: (row: CostRow) => number | undefined, list: CostRow[] = shown): number =>
        list.reduce((total, row) => total + (pick(row) ?? 0), 0);
    const withActual = shown.filter(row => row.actual7 !== undefined);
    const calibrated = shown.filter(row => row.factor !== undefined);
    const knownCalib = shown.filter(row => row.calibActual7 !== undefined && row.calibEstimate > 0);
    const allFactor = knownCalib.length
        ? sum(row => row.calibActual7, knownCalib) / sum(row => row.calibEstimate, knownCalib)
        : undefined;
    const done = rows.filter(row => !row.loading).length;
    const sel = rows.find(row => row.tenant.key === selected);

    const changeStage = (next: CostStage) => {
        setStage(next);
        setSelected(undefined);
    };

    const main = !bases.goods ? (
        <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            VITE_DOU_ENDPOINT is not set, so there is no goods service to call.
        </p>
    ) : monitor.error ? (
        <div className="flex flex-col items-center gap-3 px-4 py-16">
            <p className="max-w-2xl break-all text-sm text-red-400">{monitor.error}</p>
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
                        {` · metrics calls ${counter.metrics} (cached ${counter.cached})`}
                    </span>
                    <span className="flex-1" />

                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        Stage
                        <select
                            className="h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus:border-ring disabled:opacity-50"
                            value={stage}
                            onChange={event => {
                                const next = event.target.value;
                                if (isCostStage(next)) changeStage(next);
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
                        disabled={!bases.goods || monitor.loading}
                        onClick={monitor.reload}
                    >
                        Refresh
                    </Button>
                    <Badge variant={isProd ? 'destructive' : 'outline'}>{COST_STAGE_LABEL[stage]}</Badge>
                    <span className="font-mono text-[10px] text-muted-foreground">
                        {bases.goods || '(not configured)'}
                    </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
                    <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">Date (KST)</span>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2"
                            aria-label="Previous day"
                            onClick={() => setDate(addDays(date, -1))}
                        >
                            ◀
                        </Button>
                        <Input
                            type="date"
                            aria-label="Date"
                            className="h-7 w-36 px-2 py-0 text-xs"
                            value={date}
                            max={today}
                            onChange={event => event.target.value && setDate(event.target.value)}
                        />
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2"
                            aria-label="Next day"
                            disabled={date >= today}
                            onClick={() => setDate(addDays(date, 1))}
                        >
                            ▶
                        </Button>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">Kind</span>
                        {(['all', 'dou'] as const).map(value => (
                            <Button
                                key={value}
                                size="sm"
                                className="h-7"
                                variant={kind === value ? 'default' : 'outline'}
                                aria-pressed={kind === value}
                                onClick={() => setKind(value)}
                            >
                                {value === 'all'
                                    ? `All ${rows.length}`
                                    : `DoU only ${rows.filter(row => row.tenant.dou).length}`}
                            </Button>
                        ))}
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">Slots</span>
                        {SLOT_FILTERS.map(([value, label]) => (
                            <Button
                                key={value}
                                size="sm"
                                className="h-7"
                                variant={slotFilter === value ? 'default' : 'outline'}
                                aria-pressed={slotFilter === value}
                                onClick={() => setSlotFilter(value)}
                            >
                                {label} {byKind.filter(row => matchSlotFilter(row.tenant, value)).length}
                            </Button>
                        ))}
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span
                            className="text-muted-foreground"
                            title="8.4% is September's measured Cost Explorer discount"
                        >
                            Discount %
                        </span>
                        <Input
                            type="number"
                            step="0.1"
                            aria-label="Discount percent"
                            className="h-7 w-20 px-2 py-0 text-xs"
                            value={+(opt.discount * 100).toFixed(2)}
                            onChange={event => setOpt({ ...opt, discount: Number(event.target.value) / 100 })}
                        />
                        <span
                            className="text-muted-foreground"
                            title="1 is no adjustment. 1.098 was a one-day optimistic figure, so it is not the default. 512 MB assumed."
                        >
                            Lambda adj.
                        </span>
                        <Input
                            type="number"
                            step="0.001"
                            aria-label="Lambda adjustment"
                            className="h-7 w-20 px-2 py-0 text-xs"
                            value={opt.lambdaAdj}
                            onChange={event => setOpt({ ...opt, lambdaAdj: Number(event.target.value) })}
                        />
                        <Button size="sm" variant="outline" className="h-7" onClick={() => setOpt(DEFAULTS)}>
                            Defaults
                        </Button>
                    </div>
                    <div
                        className="flex items-center gap-1.5"
                        title={`Scales each account's estimate by Cost Explorer ÷ estimate of UTC ${calibDay}, the latest day Cost Explorer has finished`}
                    >
                        <Switch id="cost-calibrate" checked={calibrate} onCheckedChange={setCalibrate} />
                        <label htmlFor="cost-calibrate" className="text-muted-foreground">
                            Cost Explorer calibration
                        </label>
                        <span className="tabular-nums text-foreground">
                            {!calibrate
                                ? 'off'
                                : calibrated.length
                                  ? `${calibrated.filter(row => row.factorFrom === 'account').length} own · ${calibrated.filter(row => row.factorFrom === 'all').length} by all${allFactor !== undefined ? ` (×${allFactor.toFixed(3)})` : ''}`
                                  : `no actuals for UTC ${calibDay} yet`}
                        </span>
                    </div>
                </div>

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
                {monitor.poolInfo && monitor.poolInfo.partial.length > 0 && (
                    <p className="text-xs text-amber-400">
                        A list stopped short of its total ({monitor.poolInfo.partial.join(', ')}); accounts past it are
                        not shown.
                    </p>
                )}

                {monitor.poolInfo && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                        <span className="font-semibold text-foreground">Slot pool {monitor.poolInfo.pool.total}</span>
                        {POOL_KEYS.map(([key, label]) => (
                            <span
                                key={key}
                                className={
                                    key === 'errorCount' && monitor.poolInfo?.pool[key]
                                        ? 'text-red-400'
                                        : 'text-muted-foreground'
                                }
                            >
                                {label} <b className="tabular-nums text-foreground">{monitor.poolInfo?.pool[key]}</b>
                            </span>
                        ))}
                        <span className="text-[10px] text-muted-foreground">
                            {monitor.poolInfo.fromList
                                ? 'counted from the list (view=status gave nothing)'
                                : 'view=status'}
                            {monitor.poolInfo.duplicates
                                ? ` · ${monitor.poolInfo.duplicates} slot(s) listed twice, latest kept`
                                : ''}
                        </span>
                    </div>
                )}

                <div className="flex flex-wrap gap-2">
                    <Card
                        label={`Today · KST ${date} from 00:00`}
                        value={usd(sum(row => row.today))}
                        note={
                            calibrated.length
                                ? `7 metrics · calibrated to Cost Explorer · raw estimate ${usd(sum(row => row.rawToday))}`
                                : '7 metrics · estimate'
                        }
                    />
                    <Card
                        label={`Yesterday est. · UTC ${yday}`}
                        value={usd(sum(row => row.yesterdayEstimate))}
                        note={`7 metrics · estimate${ydayOpen ? ' · day still running' : ''}`}
                    />
                    <Card
                        label={`Yesterday actual · Cost Explorer UTC ${yday}`}
                        value={
                            actuals.map
                                ? withActual.length
                                    ? usd(sum(row => row.actual7, withActual))
                                    : 'not collected'
                                : actuals.error
                                  ? 'error'
                                  : '…'
                        }
                        note={
                            withActual.length
                                ? `7 metrics · all ${usd(sum(row => row.actualAll, withActual))} · ${withActual.length} account(s)${ydayFresh ? ' · not final within 2 days, collect again' : ''}`
                                : 'Collected nightly at 22:40 KST'
                        }
                    />
                    <Card
                        label="Yesterday diff · estimate vs actual (7)"
                        value={
                            withActual.length
                                ? pct(
                                      ratio(
                                          sum(row => row.yesterdayEstimate, withActual),
                                          sum(row => row.actual7, withActual)
                                      )
                                  )
                                : '—'
                        }
                        note={`Accounts with an actual only · UTC${ydayFresh && withActual.length ? ' · actual not final yet' : ''}`}
                    />
                </div>
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
