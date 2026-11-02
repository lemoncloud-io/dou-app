/**
 * `lib/cost-monitor/relations.ts`
 * - User → workspace → slot → AWS account, as the goods service records them. Pure functions only.
 *
 * One row (a tenant) per AWS account. A slot with no workspace is a row of its own, keyed by the slot
 * when it has no account either. Response shapes: codes-goods `slot/model.ts` and `views.ts`.
 */
export type SlotState = 'provisioning' | 'idle' | 'assigned' | 'releasing' | 'cleaning' | 'error' | 'archived';
export interface WorkspaceRow {
    id: string;
    name?: string;
    code?: string;
    accountNo: string;
    /** Set by the service that provisioned it — a DoU cloud's workspace has one. */
    createdBy?: string;
    ownerId?: string;
    owner$?: { id?: string; name?: string };
    slotId?: string;
}
export interface SlotRow {
    id: string;
    name?: string;
    state: SlotState;
    accountNo?: string;
    workspaceId?: string;
    assignedAt?: number;
    updatedAt?: number;
}
export interface WsInfo {
    id: string;
    name: string;
    dou: boolean;
    ownerId?: string;
    ownerName?: string;
    slotId?: string;
}
export interface SlotInfo {
    id: string;
    name?: string;
    state: SlotState;
    workspaceId?: string;
    assignedAt?: number;
    problem?: string;
}
export interface Tenant {
    key: string;
    accountNo?: string;
    workspaces: WsInfo[];
    slots: SlotInfo[];
    dou: boolean;
    /** The workspace whose metrics stand for the account; absent when the row has no workspace. */
    workspaceId?: string;
}
/** codes-goods `GET /slots/0/list?view=status` (`slot/views.ts` `PoolStatusView`). */
export interface PoolStatus {
    total: number;
    idle: number;
    assigned: number;
    provisioning: number;
    releasing: number;
    cleaning: number;
    errorCount: number;
    archived: number;
}
export type SlotFilter = 'all' | 'assigned' | 'idle' | 'problem';

const isAwsAccount = (accountNo?: string): accountNo is string => !!accountNo && /^\d{12}$/.test(accountNo);

/**
 * The goods search index can return one slot twice (an old idle document beside the new assigned one;
 * 13 such slots were measured on 2026-10-28). Keeps the latest `updatedAt` and says how many repeats
 * were dropped. The cause is the index; the screen only papers over it.
 */
export const latestSlots = (slots: SlotRow[]): { slots: SlotRow[]; duplicates: number } => {
    const byId = slots.reduce((map, slot) => {
        const prev = map.get(slot.id);
        return !prev || (slot.updatedAt ?? 0) > (prev.updatedAt ?? 0) ? map.set(slot.id, slot) : map;
    }, new Map<string, SlotRow>());
    return { slots: [...byId.values()], duplicates: slots.length - byId.size };
};

export const countPool = (slots: SlotRow[]): PoolStatus => {
    const count = (state: SlotState): number => slots.filter(slot => slot.state === state).length;
    return {
        total: slots.length,
        idle: count('idle'),
        assigned: count('assigned'),
        provisioning: count('provisioning'),
        releasing: count('releasing'),
        cleaning: count('cleaning'),
        errorCount: count('error'),
        archived: count('archived'),
    };
};

/** A problem: the `error` state, or an assignment the slot and the workspace do not agree on (either way). */
export const slotProblem = (
    slot: SlotRow,
    wsById: Map<string, WorkspaceRow>,
    pointedBy: Map<string, WorkspaceRow>
): string | undefined => {
    if (slot.state === 'error') return 'in error state';
    const back = pointedBy.get(slot.id);
    if (slot.state === 'assigned') {
        if (!slot.workspaceId) {
            return back
                ? `workspace #${back.id} points here but the slot has no workspace`
                : 'assigned with no workspace';
        }
        const ws = wsById.get(slot.workspaceId);
        if (!ws) return `workspace #${slot.workspaceId} is not in the list`;
        if (ws.accountNo !== slot.accountNo) return `account differs from workspace #${ws.id}`;
        return undefined;
    }
    return back ? `workspace #${back.id} points here but the slot is ${slot.state}` : undefined;
};

export const buildTenants = (workspaces: WorkspaceRow[], slots: SlotRow[]): Tenant[] => {
    const wsById = new Map(workspaces.map(ws => [ws.id, ws]));
    const pointedBy = new Map(workspaces.flatMap(ws => (ws.slotId ? [[ws.slotId, ws] as const] : [])));
    const keyOf = (accountNo: string | undefined, slotId: string): string =>
        isAwsAccount(accountNo) ? accountNo : `slot:${slotId}`;
    const empty = (key: string, accountNo?: string): Tenant => ({
        key,
        accountNo: isAwsAccount(accountNo) ? accountNo : undefined,
        workspaces: [],
        slots: [],
        dou: false,
    });
    // An account number that is not 12 digits is no AWS account: its metrics are always 0, and the cost
    // service leaves it out of Cost Explorer too.
    const byWs = workspaces
        .filter(ws => isAwsAccount(ws.accountNo))
        .reduce((map, ws) => {
            const prev = map.get(ws.accountNo) ?? empty(ws.accountNo, ws.accountNo);
            const info: WsInfo = {
                id: ws.id,
                name: ws.name || ws.code || `#${ws.id}`,
                dou: !!ws.createdBy,
                ownerId: ws.ownerId,
                ownerName: ws.owner$?.name,
                slotId: ws.slotId,
            };
            // Metrics come from the DoU workspace when there is one — the cost service's priority too.
            const pick = !prev.workspaceId || (!prev.dou && info.dou);
            return map.set(ws.accountNo, {
                ...prev,
                workspaces: [...prev.workspaces, info],
                dou: prev.dou || info.dou,
                workspaceId: pick ? ws.id : prev.workspaceId,
            });
        }, new Map<string, Tenant>());
    const all = slots.reduce((map, slot) => {
        const key = keyOf(slot.accountNo, slot.id);
        const prev = map.get(key) ?? empty(key, slot.accountNo);
        const info: SlotInfo = {
            id: slot.id,
            name: slot.name,
            state: slot.state,
            workspaceId: slot.workspaceId,
            assignedAt: slot.assignedAt,
            problem: slotProblem(slot, wsById, pointedBy),
        };
        return map.set(key, { ...prev, slots: [...prev.slots, info] });
    }, byWs);
    return [...all.values()];
};

export const matchSlotFilter = (tenant: Tenant, filter: SlotFilter): boolean =>
    filter === 'all'
        ? true
        : filter === 'problem'
          ? tenant.slots.some(slot => !!slot.problem)
          : tenant.slots.some(slot => slot.state === filter);
