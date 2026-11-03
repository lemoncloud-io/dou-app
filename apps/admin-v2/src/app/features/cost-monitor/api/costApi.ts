/**
 * `api/cost-monitor/costApi.ts`
 * - The cost monitor's reads: goods workspaces, slots, metrics and Cost Explorer amounts (relayed from
 *   the cost service); the relay's clouds for their DoU names. Nothing here writes.
 *
 * All app-local signed requests, as on the deploy screen. Only the fields the screen shows are kept —
 * `secret$` and the like never reach screen state.
 *
 * What costs money: every metrics call makes the goods service call CloudWatch `GetMetricData` once or
 * more ($0.01 per 1,000 metrics). Caching them is the query layer's job (`costQuery.ts`); collecting
 * Cost Explorer is the cost service's nightly job, not this screen's.
 */
import { runtime } from '@chatic/app-runtime';

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
/** The slice of the relay's `CloudView` the monitor shows. */
export interface DouCloud {
    id?: string;
    name?: string;
    status?: string;
    accountNo?: string;
}
export interface Tenants {
    tenants: Tenant[];
    pool: PoolStatus;
    /** The pool was counted from the slot list because `view=status` gave nothing. */
    poolFromList: boolean;
    duplicates: number;
    /** A list stopped short of its reported total. */
    partial: string[];
}

/** Metrics calls sent from this tab — each is at least one `GetMetricData`. */
export const counter = { metrics: 0 };

/** The response body says why a call failed; a call with no response is named, as on the deploy screen. */
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

// Only the fields shown.
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

/** Workspaces with an account and every slot, folded into one row per account. */
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

/** Account number → the relay's clouds on it, for their DoU names. `valid: 0` keeps expired clouds. */
export interface CloudsByAccount {
    byAccount: Map<string, DouCloud[]>;
    /** The walk stopped at the cap with more left — names past it are missing. */
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

/**
 * Runs `task` once one of `size` slots is free. A load asks for three days of every account at once, and
 * each answer is a goods → CloudWatch round trip; firing a hundred and fifty of them together
 * gets throttled downstream. A task whose query was dropped before its turn (another date or stage) is
 * not sent — it would be billed for nothing.
 */
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

/** The seven metrics of one KST day in hourly buckets. Admin only on the goods side. */
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

/** `YYYY-MM-DD` or `YYYYMMDD` → `YYYYMMDD`, so either form the cost service stores compares equal. */
const dayKey = (date?: string): string => (date ?? '').replace(/-/g, '');

/**
 * Cost Explorer amounts of UTC days `from` ~ `to` (inclusive) as day → account number → amount. Read
 * through the goods service (`GET /workspaces/0/costs`), which relays to the cost service: the cost
 * service's own API does not accept this console's signing role. The cost service collects these every
 * night (`sync-ce-daily`, 22:40 KST) and keeps them in OpenSearch.
 */
export interface ActualsByDay {
    byDay: Map<string, Map<string, Actual>>;
    /** Fewer rows came back than the reported total — accounts past them read as not collected. */
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

/** The accounts of one UTC day out of {@link fetchActuals}. */
const NO_ACTUALS: Map<string, Actual> = new Map();

export const actualsOf = (byDay: Map<string, Map<string, Actual>>, date: string): Map<string, Actual> =>
    byDay.get(dayKey(date)) ?? NO_ACTUALS;
