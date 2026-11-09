/**
 * `components/cost-monitor/TenantTable.tsx`
 * - One row per AWS account: who it belongs to, its slots, the day in hours, and the four amounts.
 */
import { KEYS } from '../lib/cost';
import { pct, usd, type CostRow } from '../lib/costRows';
import { cloudLabel, ownersOf, SLOT_LABEL, SLOT_TONE, tenantKind, tenantTitle } from '../lib/display';
import { MiniBars } from './HourChart';

import type { DouCloud } from '../api/costApi';
import type { SlotInfo } from '../lib/relations';
import type { JSX } from 'react';

const HEAD_CLASS =
    'sticky top-0 z-10 whitespace-nowrap border-b border-border bg-card px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground';
const NUM_HEAD = `${HEAD_CLASS} text-right`;
const NUM_CELL = 'whitespace-nowrap px-3 py-2 text-right align-top tabular-nums text-foreground';

export const SlotChips = ({ slots }: { slots: SlotInfo[] }): JSX.Element => (
    <span className="flex flex-wrap gap-1">
        {slots.length ? (
            slots.map(slot => (
                <span
                    key={slot.id}
                    className={`rounded border px-1 py-px text-[10px] ${slot.problem ? 'border-red-500/50 text-red-400' : SLOT_TONE[slot.state]}`}
                    title={`slot #${slot.id}${slot.name ? ` ${slot.name}` : ''} · ${slot.state}${slot.problem ? ` · problem: ${slot.problem}` : ''}`}
                >
                    {slot.problem ? '⚠ ' : ''}
                    {SLOT_LABEL[slot.state] ?? slot.state}
                </span>
            ))
        ) : (
            <span className="text-[10px] text-muted-foreground">no slot</span>
        )}
    </span>
);

export const KindTag = ({ kind }: { kind: string }): JSX.Element => (
    <span
        className={`rounded border px-1 py-px text-[10px] ${kind === 'DoU' ? 'border-primary/50 text-primary' : 'border-border text-muted-foreground'}`}
    >
        {kind}
    </span>
);

interface TenantTableProps {
    rows: CostRow[];
    clouds?: Map<string, DouCloud[]>;
    actualsLoaded: boolean;
    selected?: string;
    onSelect: (key: string) => void;
}

export const TenantTable = ({ rows, clouds, actualsLoaded, selected, onSelect }: TenantTableProps): JSX.Element => {
    if (rows.length === 0) {
        return <p className="px-4 py-12 text-center text-sm text-muted-foreground">No accounts here</p>;
    }
    const maxHour = Math.max(
        ...rows.map(row => Math.max(...row.hours.map(h => KEYS.reduce((s, k) => s + h[k], 0)))),
        0
    );

    return (
        <table className="w-full border-collapse text-xs">
            <thead>
                <tr>
                    <th className={HEAD_CLASS}>Account · workspace · owner</th>
                    <th className={HEAD_CLASS}>Kind</th>
                    <th className={HEAD_CLASS}>Slots</th>
                    <th className={HEAD_CLASS}>24 h (KST)</th>
                    <th className={NUM_HEAD}>Today</th>
                    <th className={NUM_HEAD}>Factor</th>
                    <th className={NUM_HEAD}>Yesterday est.</th>
                    <th className={NUM_HEAD}>Yesterday actual (7)</th>
                    <th className={NUM_HEAD}>Diff</th>
                </tr>
            </thead>
            <tbody>
                {rows.map(row => {
                    const { tenant } = row;
                    const owners = ownersOf(tenant);
                    const douClouds = tenant.accountNo ? clouds?.get(tenant.accountNo) : undefined;
                    const noAmount = !tenant.workspaceId || row.loading || !!row.error;
                    return (
                        <tr
                            key={tenant.key}
                            className={`cursor-pointer border-b border-border hover:bg-muted/40 ${tenant.key === selected ? 'bg-accent' : ''}`}
                            onClick={() => onSelect(tenant.key)}
                            // A <tr> with only onClick leaves the detail panel unreachable without a
                            // pointer; tabIndex + Enter/Space keeps the row a table row.
                            tabIndex={0}
                            onKeyDown={event => {
                                if (event.key !== 'Enter' && event.key !== ' ') return;
                                event.preventDefault();
                                onSelect(tenant.key);
                            }}
                        >
                            <td className="px-3 py-2 align-top">
                                <div className="font-mono text-[11px] text-foreground">
                                    {tenant.accountNo ?? 'no account'}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                    {tenantTitle(tenant)}
                                    {owners && ` · owner ${owners}`}
                                </div>
                                {douClouds && (
                                    <div className="text-[10px] text-muted-foreground">
                                        DoU cloud: {cloudLabel(douClouds)}
                                    </div>
                                )}
                            </td>
                            <td className="px-3 py-2 align-top">
                                <KindTag kind={tenantKind(tenant)} />
                            </td>
                            <td className="px-3 py-2 align-top">
                                <SlotChips slots={tenant.slots} />
                            </td>
                            <td className="px-3 py-2 align-top">
                                {!tenant.workspaceId ? (
                                    <span
                                        className="text-[10px] text-muted-foreground"
                                        title="No workspace, so no metrics to ask for"
                                    >
                                        no metrics
                                    </span>
                                ) : row.error ? (
                                    <span className="text-[10px] text-red-400" title={row.error}>
                                        error
                                    </span>
                                ) : row.loading ? (
                                    <span className="text-[10px] text-muted-foreground">…</span>
                                ) : (
                                    <MiniBars row={row} max={maxHour} />
                                )}
                            </td>
                            <td className={NUM_CELL}>{noAmount ? '—' : usd(row.today)}</td>
                            <td
                                className={NUM_CELL}
                                title={
                                    row.factorFrom === 'all'
                                        ? 'No Cost Explorer amount for this account on the calibration day — the ratio of all accounts'
                                        : row.factorFrom === 'account'
                                          ? "This account's own Cost Explorer ÷ estimate on the calibration day"
                                          : 'Not calibrated'
                                }
                            >
                                {row.factor === undefined ? (
                                    <span className="text-muted-foreground">—</span>
                                ) : (
                                    <span className={row.factorFrom === 'all' ? 'text-muted-foreground' : ''}>
                                        ×{row.factor.toFixed(3)}
                                        {row.factorFrom === 'all' ? '*' : ''}
                                    </span>
                                )}
                            </td>
                            <td className={NUM_CELL}>{noAmount ? '—' : usd(row.yesterdayEstimate)}</td>
                            <td className={NUM_CELL}>
                                {row.actual7 === undefined ? (
                                    <span className="text-muted-foreground">
                                        {actualsLoaded ? 'not collected' : '…'}
                                    </span>
                                ) : (
                                    usd(row.actual7)
                                )}
                            </td>
                            <td className={NUM_CELL}>{pct(row.diff)}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
};
