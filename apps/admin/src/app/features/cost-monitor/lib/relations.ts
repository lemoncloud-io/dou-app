export type SlotState = 'provisioning' | 'idle' | 'assigned' | 'releasing' | 'cleaning' | 'error' | 'archived';
export interface WorkspaceRow {
    id: string;
    name?: string;
    code?: string;
    accountNo: string;
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
interface WsInfo {
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
    workspaceId?: string;
}
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

const slotProblem = (
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
