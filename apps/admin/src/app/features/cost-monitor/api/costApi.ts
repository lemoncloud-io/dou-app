import { runtime } from '@chatic/runtime';

import {
    buildTenants,
    countPool,
    latestSlots,
    type PoolStatus,
    type SlotRow,
    type Tenant,
    type WorkspaceRow,
} from '../lib/relations';
import type { CeItem, Series, Usage } from '../lib/cost';

import type { Actual } from '../lib/costRows';

export interface Metrics {
    usage: Usage;
    series: Series;
}
export interface DouCloud {
    id?: string;
    name?: string;
    status?: string;
    accountNo?: string;
}
export interface Tenants {
    tenants: Tenant[];
    pool: PoolStatus;
    poolFromList: boolean;
    duplicates: number;
    partial: string[];
}

export const counter = { metrics: 0 };

const describeError = (error: unknown, service: string): Error => {
    const response = (error as { response?: { status?: number; data?: unknown } } | null | undefined)?.response;
    const data = response?.data;
    const body =
        typeof data === 'string'
            ? data
            : typeof (data as { message?: unknown } | undefined)?.message === 'string'
              ? (data as { message: string }).message
              : '';
    const message = response
        ? body || `HTTP ${response.status ?? '?'}`
        : `No response from ${service} (${error instanceof Error ? error.message : String(error)}). A rejected request signature looks like this too.`;
    return Object.assign(new Error(message), { cause: error });
};

const signed = async <T>(
    service: string,
    method: 'GET' | 'POST',
    url: string,
    params: Record<string, string | number> = {},
    body?: unknown
): Promise<T> => {
    try {
        const request = runtime.boot.webTransport.buildSignedRequest({ method, baseURL: url }).setParams(params);
        const { data } = await (body === undefined ? request : request.setBody(body)).execute<T>();
        return data as T;
    } catch (error) {
        throw describeError(error, service);
    }
};

const GOODS = 'the goods service';
const RELAY = 'the relay';

const pickWorkspace = (ws: WorkspaceRow): WorkspaceRow => ({
    id: ws.id,
    name: ws.name,
    code: ws.code,
    accountNo: ws.accountNo,
    createdBy: ws.createdBy,
    ownerId: ws.ownerId,
    owner$: ws.owner$ && { id: ws.owner$.id, name: ws.owner$.name },
    slotId: ws.slotId,
});
const pickSlot = (slot: SlotRow): SlotRow => ({
    id: slot.id,
    name: slot.name,
    state: slot.state,
    accountNo: slot.accountNo,
    workspaceId: slot.workspaceId,
    assignedAt: slot.assignedAt,
    updatedAt: slot.updatedAt,
});

interface ListResponse<T> {
    list?: T[];
    total?: number;
}

export const fetchTenants = async (goods: string): Promise<Tenants> => {
    const [ws, slots, status] = await Promise.all([
        signed<ListResponse<WorkspaceRow>>(GOODS, 'GET', `${goods}/workspaces/0/list`, {
            view: 'admin',
            accountNo: '!',
            limit: 1000,
        }),
        signed<ListResponse<SlotRow>>(GOODS, 'GET', `${goods}/slots/0/list`, { limit: 1000 }),
        signed<PoolStatus | null>(GOODS, 'GET', `${goods}/slots/0/list`, { view: 'status' }).catch(() => null),
    ]);
    const wsList = ws?.list ?? [];
    const slotList = slots?.list ?? [];
    const partial = [
        ...((ws?.total ?? 0) > wsList.length ? [`workspaces ${wsList.length}/${ws?.total}`] : []),
        ...((slots?.total ?? 0) > slotList.length ? [`slots ${slotList.length}/${slots?.total}`] : []),
    ];
    const { slots: slotRows, duplicates } = latestSlots(slotList.map(pickSlot));
    const tenants = buildTenants(wsList.map(pickWorkspace), slotRows);
    return status && typeof status.total === 'number'
        ? { tenants, pool: status, poolFromList: false, duplicates, partial }
        : { tenants, pool: countPool(slotRows), poolFromList: true, duplicates, partial };
};

const CLOUD_PAGE = 100;
const CLOUD_CAP = 2000;

export interface CloudsByAccount {
    byAccount: Map<string, DouCloud[]>;
    truncated: boolean;
}

export const fetchClouds = async (relay: string): Promise<CloudsByAccount> => {
    const walk = async (page: number, acc: DouCloud[]): Promise<{ all: DouCloud[]; truncated: boolean }> => {
        const res = await signed<ListResponse<DouCloud>>(RELAY, 'GET', `${relay}/clouds/0/list`, {
            view: 'admin',
            valid: 0,
            limit: CLOUD_PAGE,
            page,
        });
        const rows = res?.list ?? [];
        const all = [...acc, ...rows];
        const done = rows.length < CLOUD_PAGE || (res?.total !== undefined && all.length >= res.total);
        if (done) return { all, truncated: false };
        return all.length >= CLOUD_CAP ? { all, truncated: true } : walk(page + 1, all);
    };
    const { all: clouds, truncated } = await walk(0, []);
    const byAccount = clouds.reduce(
        (map, cloud) =>
            cloud.accountNo
                ? map.set(cloud.accountNo, [
                      ...(map.get(cloud.accountNo) ?? []),
                      { id: cloud.id, name: cloud.name, status: cloud.status, accountNo: cloud.accountNo },
                  ])
                : map,
        new Map<string, DouCloud[]>()
    );
    return { byAccount, truncated };
};

export const createLimiter = (size: number) => {
    const state = { running: 0, waiting: [] as (() => void)[] };
    const release = (): void => {
        state.running--;
        state.waiting.shift()?.();
    };
    return async <T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> => {
        if (state.running >= size) await new Promise<void>(resolve => state.waiting.push(resolve));
        state.running++;
        try {
            if (signal?.aborted) throw new Error('Superseded before it was sent.');
            return await task();
        } finally {
            release();
        }
    };
};

const metricsSlot = createLimiter(5);

export const fetchMetrics = (
    goods: string,
    workspaceId: string,
    date: string,
    signal?: AbortSignal
): Promise<Metrics> =>
    metricsSlot(async () => {
        counter.metrics++;
        const res = await signed<{ metrics$?: { usage$: Usage; series$?: Series } }>(
            GOODS,
            'POST',
            `${goods}/workspaces/${encodeURIComponent(workspaceId)}/metrics`,
            { series: 1 },
            { date, period: 3600 }
        );
        if (!res?.metrics$) throw new Error('The goods service returned no metrics.');
        return { usage: res.metrics$.usage$, series: res.metrics$.series$ ?? {} };
    }, signal);

const dayKey = (date?: string): string => (date ?? '').replace(/-/g, '');

export interface ActualsByDay {
    byDay: Map<string, Map<string, Actual>>;
    truncated: boolean;
}

export const fetchActuals = async (goods: string, from: string, to: string): Promise<ActualsByDay> => {
    const res = await signed<ListResponse<{ accountNo: string; date?: string; totalPrice: number; item$$?: CeItem[] }>>(
        GOODS,
        'GET',
        `${goods}/workspaces/0/costs`,
        { from, to }
    );
    const list = res?.list ?? [];
    const byDay = list.reduce((acc, usage) => {
        const key = dayKey(usage.date);
        const day = acc.get(key) ?? new Map<string, Actual>();
        day.set(usage.accountNo, {
            total: usage.totalPrice,
            items: (usage.item$$ ?? []).map(item => ({ useType: item.useType, totCost: item.totCost })),
        });
        return acc.set(key, day);
    }, new Map<string, Map<string, Actual>>());
    return { byDay, truncated: (res?.total ?? 0) > list.length };
};

const NO_ACTUALS: Map<string, Actual> = new Map();

export const actualsOf = (byDay: Map<string, Map<string, Actual>>, date: string): Map<string, Actual> =>
    byDay.get(dayKey(date)) ?? NO_ACTUALS;
