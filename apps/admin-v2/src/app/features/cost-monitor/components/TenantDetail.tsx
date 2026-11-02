/**
 * `components/cost-monitor/TenantDetail.tsx`
 * - One account in full: how its user, workspaces and slots connect, and its day by hour and by metric.
 */
import { useState, type JSX, type ReactNode } from 'react';

import { Button } from '@chatic/ui-kit/components/ui/button';

import { KEYS, RATES, type UsageKey } from '../lib/cost';
import { num, pct, usd, type CostRow } from '../lib/costRows';
import { cloudLabel, METRIC_COLORS, SLOT_LABEL, SLOT_TONE, tenantKind, tenantTitle } from '../lib/display';
import { HourChart, type ChartMode } from './HourChart';
import { KindTag } from './TenantTable';

import type { DouCloud } from '../api/costApi';
import type { SlotInfo, Tenant } from '../lib/relations';

const Node = ({ tone = '', children, title }: { tone?: string; children: ReactNode; title?: string }): JSX.Element => (
    <span className={`rounded border px-1.5 py-0.5 ${tone || 'border-border text-foreground'}`} title={title}>
        {children}
    </span>
);
const Arrow = (): JSX.Element => <span className="text-muted-foreground">→</span>;

const SlotNode = ({ slot }: { slot?: SlotInfo }): JSX.Element =>
    slot ? (
        <Node tone={slot.problem ? 'border-red-500/50 text-red-400' : ''} title={slot.problem}>
            slot {slot.name || `#${slot.id}`}{' '}
            <span className={`rounded border px-1 text-[10px] ${SLOT_TONE[slot.state]}`}>
                {SLOT_LABEL[slot.state] ?? slot.state}
            </span>
            {slot.problem && <em> ⚠ {slot.problem}</em>}
        </Node>
    ) : (
        <Node tone="border-dashed border-border text-muted-foreground">no slot</Node>
    );

/** User → workspace → slot → AWS account, one line per workspace, then the slots no workspace points at. */
const Relations = ({ tenant }: { tenant: Tenant }): JSX.Element => {
    const slotById = new Map(tenant.slots.map(slot => [slot.id, slot]));
    const linked = new Set(tenant.workspaces.flatMap(ws => (ws.slotId ? [ws.slotId] : [])));
    const free = tenant.slots.filter(slot => !linked.has(slot.id));
    const account = <Node>AWS {tenant.accountNo ?? 'no account'}</Node>;
    return (
        <div className="flex flex-col gap-1.5 text-[11px]">
            {tenant.workspaces.map(ws => (
                <div key={ws.id} className="flex flex-wrap items-center gap-1.5">
                    <Node>user {ws.ownerName || (ws.ownerId ? `#${ws.ownerId}` : 'none')}</Node>
                    <Arrow />
                    <Node>
                        workspace {ws.name} <span className="text-muted-foreground">#{ws.id}</span>{' '}
                        <KindTag kind={ws.dou ? 'DoU' : 'general'} />
                        {ws.id === tenant.workspaceId && <span className="text-muted-foreground"> · metrics</span>}
                    </Node>
                    <Arrow />
                    {ws.slotId && !slotById.has(ws.slotId) ? (
                        <Node tone="border-red-500/50 text-red-400">
                            slot #{ws.slotId} <em>⚠ not in the slot list</em>
                        </Node>
                    ) : (
                        <SlotNode slot={ws.slotId ? slotById.get(ws.slotId) : undefined} />
                    )}
                    <Arrow />
                    {account}
                </div>
            ))}
            {free.map(slot => (
                <div key={slot.id} className="flex flex-wrap items-center gap-1.5">
                    <Node tone="border-dashed border-border text-muted-foreground">no user</Node>
                    <Arrow />
                    <Node tone="border-dashed border-border text-muted-foreground">no workspace</Node>
                    <Arrow />
                    <SlotNode slot={slot} />
                    <Arrow />
                    {account}
                </div>
            ))}
        </div>
    );
};

const price = (rate: { price: number; unit: string }): string =>
    rate.price < 0.01 ? `$${+(rate.price * 1e6).toPrecision(6)} / million` : `$${rate.price} / ${rate.unit}`;

const SUB = 'mt-4 mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground';

interface TenantDetailProps {
    row: CostRow;
    date: string;
    clouds?: DouCloud[];
    onClose: () => void;
}

export const TenantDetail = ({ row, date, clouds, onClose }: TenantDetailProps): JSX.Element => {
    const [mode, setMode] = useState<ChartMode>('cost');
    const [metric, setMetric] = useState<UsageKey>('sqsRequests');
    const { tenant } = row;

    return (
        <div className="p-4 text-xs">
            <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                    <h2 className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-foreground">
                        {tenantTitle(tenant)} <KindTag kind={tenantKind(tenant)} />
                    </h2>
                    <p className="text-[10px] text-muted-foreground">
                        account <span className="font-mono">{tenant.accountNo ?? 'none'}</span> ·{' '}
                        {tenant.workspaces.length} workspace(s) · {tenant.slots.length} slot(s)
                        {clouds?.length ? ` · DoU cloud: ${cloudLabel(clouds)}` : ''}
                    </p>
                </div>
                <Button size="sm" variant="outline" className="h-7" onClick={onClose}>
                    Close
                </Button>
            </div>

            <h3 className={SUB}>Relations</h3>
            <Relations tenant={tenant} />

            {!tenant.workspaceId ? (
                <p className="mt-4 text-muted-foreground">
                    No workspace, so no metrics: the goods service relays them only through{' '}
                    <code>workspaces/{'{id}'}/metrics</code>.
                </p>
            ) : (
                <>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                        {[
                            [
                                'Today',
                                row.factor === undefined
                                    ? usd(row.today)
                                    : `${usd(row.today)} · raw ${usd(row.rawToday)} ×${row.factor.toFixed(3)}${row.factorFrom === 'all' ? ' (all accounts)' : ''}`,
                            ],
                            ['Yesterday est.', usd(row.yesterdayEstimate)],
                            ['Yesterday actual (7)', `${usd(row.actual7)} · all ${usd(row.actualAll)}`],
                            ['Diff', pct(row.diff)],
                        ].map(([label, value]) => (
                            <div key={label} className="rounded-md border border-border px-2 py-1.5">
                                <p className="text-[10px] text-muted-foreground">{label}</p>
                                <p className="tabular-nums text-foreground">{value}</p>
                            </div>
                        ))}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground">{date} by hour (KST)</span>
                        {(['cost', 'usage'] as const).map(value => (
                            <Button
                                key={value}
                                size="sm"
                                className="h-7"
                                variant={mode === value ? 'default' : 'outline'}
                                aria-pressed={mode === value}
                                onClick={() => setMode(value)}
                            >
                                {value === 'cost' ? 'Cost' : 'Usage'}
                            </Button>
                        ))}
                        {mode === 'usage' && (
                            <select
                                aria-label="Metric"
                                className="h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus:border-ring"
                                value={metric}
                                onChange={event => setMetric(event.target.value as UsageKey)}
                            >
                                {RATES.map(rate => (
                                    <option key={rate.key} value={rate.key}>
                                        {rate.key} ({rate.unit})
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>
                    <HourChart row={row} mode={mode} metric={metric} />
                    {mode === 'cost' && (
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                            {KEYS.map(key => (
                                <span key={key}>
                                    <i
                                        className="mr-1 inline-block size-2 rounded-sm"
                                        style={{ background: METRIC_COLORS[key] }}
                                    />
                                    {key}
                                </span>
                            ))}
                        </div>
                    )}

                    <h3 className={SUB}>By metric</h3>
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                <th className="border-b border-border py-1 text-left">Metric · usage type</th>
                                <th className="border-b border-border py-1 text-right">Usage ({date} KST)</th>
                                <th className="border-b border-border py-1 text-right">List price (Seoul)</th>
                                <th className="border-b border-border py-1 text-right">Estimate</th>
                            </tr>
                        </thead>
                        <tbody>
                            {RATES.map(rate => (
                                <tr key={rate.key} className="border-b border-border">
                                    <td className="py-1">
                                        <i
                                            className="mr-1 inline-block size-2 rounded-sm"
                                            style={{ background: METRIC_COLORS[rate.key] }}
                                        />
                                        <code>{rate.key}</code>
                                        <div className="text-[10px] text-muted-foreground">{rate.useType}</div>
                                    </td>
                                    <td className="py-1 text-right tabular-nums">
                                        {num(rate.toUnit(row.dayUsage[rate.key], 1))} {rate.unit}
                                    </td>
                                    <td className="py-1 text-right tabular-nums">{price(rate)}</td>
                                    <td className="py-1 text-right tabular-nums">{usd(row.dayCost[rate.key])}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p className="mt-2 text-[10px] text-muted-foreground">
                        Lambda GB-s in the usage column is before the adjustment (512 MB assumed). The estimates include
                        the discount and the adjustment set above, and the Cost Explorer factor when calibration is on.
                    </p>
                </>
            )}
        </div>
    );
};
