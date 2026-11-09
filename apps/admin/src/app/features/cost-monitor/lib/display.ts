/**
 * `lib/cost-monitor/display.ts`
 * - Names and colours the table, the detail panel and the chart share.
 */
import type { DouCloud } from '../api/costApi';
import type { UsageKey } from './cost';
import type { PoolStatus, SlotState, Tenant } from './relations';

/** One colour per metric, the same in the bars, the legend and the rate table. */
export const METRIC_COLORS: Record<UsageKey, string> = {
    logIngestBytes: '#4e79a7',
    wsMessages: '#f28e2b',
    lambdaDurationMs: '#e15759',
    lambdaInvocations: '#76b7b2',
    ddbReadUnits: '#59a14f',
    ddbWriteUnits: '#edc948',
    sqsRequests: '#b07aa1',
};

export const SLOT_LABEL: Record<SlotState, string> = {
    provisioning: 'provisioning',
    idle: 'idle',
    assigned: 'in use',
    releasing: 'releasing',
    cleaning: 'cleaning',
    error: 'error',
    archived: 'archived',
};

export const SLOT_TONE: Record<SlotState, string> = {
    provisioning: 'border-sky-500/40 text-sky-400',
    idle: 'border-border text-muted-foreground',
    assigned: 'border-emerald-500/40 text-emerald-400',
    releasing: 'border-amber-500/40 text-amber-400',
    cleaning: 'border-amber-500/40 text-amber-400',
    error: 'border-red-500/50 text-red-400',
    archived: 'border-border text-muted-foreground/60',
};

export const POOL_KEYS: [keyof PoolStatus, string][] = [
    ['assigned', 'In use'],
    ['idle', 'Idle'],
    ['provisioning', 'Provisioning'],
    ['releasing', 'Releasing'],
    ['cleaning', 'Cleaning'],
    ['errorCount', 'Error'],
    ['archived', 'Archived'],
];

export const tenantTitle = (tenant: Tenant): string =>
    tenant.workspaces.map(ws => ws.name).join(' · ') ||
    tenant.slots.map(slot => slot.name || `slot #${slot.id}`).join(' · ');

export const tenantKind = (tenant: Tenant): string =>
    tenant.workspaces.length ? (tenant.dou ? 'DoU' : 'general') : 'slot only';

export const cloudLabel = (clouds?: DouCloud[]): string =>
    (clouds ?? [])
        .map(cloud => `${cloud.name || `#${cloud.id}`}${cloud.status ? ` (${cloud.status})` : ''}`)
        .join(' · ');

export const ownersOf = (tenant: Tenant): string =>
    [...new Set(tenant.workspaces.flatMap(ws => ws.ownerName || (ws.ownerId ? `#${ws.ownerId}` : [])))].join(', ');
