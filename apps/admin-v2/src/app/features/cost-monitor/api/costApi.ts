/**
 * `api/cost-monitor/costApi.ts`
 * - The cost monitor's reads: goods workspaces, slots, metrics and Cost Explorer amounts (relayed from
 *   the cost service); the relay's clouds for their DoU names. Nothing here writes.
 *
 * All app-local signed requests, as on the deploy screen. Only the fields the screen shows are kept —
 * `secret$` and the like never reach screen state.
 *
 * What costs money: every metrics call makes the goods service call CloudWatch `GetMetricData` once or
 * more ($0.01 per 1,000 metrics). Finished KST days are cached in the tab so moving between dates does
 * not pay twice. Collecting Cost Explorer is the cost service's nightly job, not this screen's.
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
import { kstDay, type CeItem, type Series, type Usage } from '../lib/cost';

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

/** Calls made in this tab — each metrics call is at least one `GetMetricData`. */
export const counter = { metrics: 0, cached: 0 };

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
export const fetchClouds = async (relay: string): Promise<Map<string, DouCloud[]>> => {
    const walk = async (page: number, acc: DouCloud[]): Promise<DouCloud[]> => {
        const res = await signed<ListResponse<DouCloud>>(RELAY, 'GET', `${relay}/clouds/0/list`, {
            view: 'admin',
            valid: 0,
            limit: CLOUD_PAGE,
            page,
        });
        const rows = res?.list ?? [];
        const all = [...acc, ...rows];
        const done = rows.length < CLOUD_PAGE || (res?.total !== undefined && all.length >= res.total);
        return done || all.length >= CLOUD_CAP ? all : walk(page + 1, all);
    };
    const clouds = await walk(0, []);
    return clouds.reduce(
        (map, cloud) =>
            cloud.accountNo
                ? map.set(cloud.accountNo, [
                      ...(map.get(cloud.accountNo) ?? []),
                      { id: cloud.id, name: cloud.name, status: cloud.status, accountNo: cloud.accountNo },
                  ])
                : map,
        new Map<string, DouCloud[]>()
    );
};

// A finished KST day is fetched once per tab. CloudWatch lags, so a day is cached only an hour after it ends.
// ponytail: an unbounded Map in the tab — accounts × dates viewed is small; LRU if a tab stays open for weeks.
const CACHE_AFTER = 3_600_000;
const cache = new Map<string, Metrics>();

/** The seven metrics of one KST day in hourly buckets. Admin only on the goods side. */
export const fetchMetrics = async (goods: string, workspaceId: string, date: string): Promise<Metrics> => {
    const key = `${goods}:${workspaceId}:${date}`;
    const hit = cache.get(key);
    if (hit) {
        counter.cached++;
        return hit;
    }
    counter.metrics++;
    const res = await signed<{ metrics$?: { usage$: Usage; series$?: Series } }>(
        GOODS,
        'POST',
        `${goods}/workspaces/${encodeURIComponent(workspaceId)}/metrics`,
        { series: 1 },
        { date, period: 3600 }
    );
    if (!res?.metrics$) throw new Error('The goods service returned no metrics.');
    const metrics = { usage: res.metrics$.usage$, series: res.metrics$.series$ ?? {} };
    if (Date.now() > kstDay(date)[1] + CACHE_AFTER) cache.set(key, metrics);
    return metrics;
};

/** `YYYY-MM-DD` or `YYYYMMDD` → `YYYYMMDD`, so either form the cost service stores compares equal. */
const dayKey = (date?: string): string => (date ?? '').replace(/-/g, '');

/**
 * Cost Explorer amounts of UTC days `from` ~ `to` (inclusive) as day → account number → amount. Read
 * through the goods service (`GET /workspaces/0/costs`), which relays to the cost service: the cost
 * service's own API does not accept this console's signing role. The cost service collects these every
 * night (`sync-ce-daily`, 22:40 KST) and keeps them in OpenSearch.
 */
export const fetchActuals = async (
    goods: string,
    from: string,
    to: string
): Promise<Map<string, Map<string, Actual>>> => {
    const res = await signed<ListResponse<{ accountNo: string; date?: string; totalPrice: number; item$$?: CeItem[] }>>(
        GOODS,
        'GET',
        `${goods}/workspaces/0/costs`,
        { from, to }
    );
    return (res?.list ?? []).reduce((byDay, usage) => {
        const key = dayKey(usage.date);
        const day = byDay.get(key) ?? new Map<string, Actual>();
        day.set(usage.accountNo, {
            total: usage.totalPrice,
            items: (usage.item$$ ?? []).map(item => ({ useType: item.useType, totCost: item.totCost })),
        });
        return byDay.set(key, day);
    }, new Map<string, Map<string, Actual>>());
};

/** The accounts of one UTC day out of {@link fetchActuals}. */
export const actualsOf = (byDay: Map<string, Map<string, Actual>>, date: string): Map<string, Actual> =>
    byDay.get(dayKey(date)) ?? new Map();

/** Runs `tasks` `n` at a time; a failure is kept in its slot and does not stop the rest. */
export const runPool = async <T>(n: number, tasks: (() => Promise<T>)[]): Promise<PromiseSettledResult<T>[]> => {
    const out: PromiseSettledResult<T>[] = new Array(tasks.length);
    const next = { i: 0 };
    const worker = async (): Promise<void> => {
        while (next.i < tasks.length) {
            const i = next.i++;
            out[i] = await tasks[i]().then(
                value => ({ status: 'fulfilled' as const, value }),
                reason => ({ status: 'rejected' as const, reason })
            );
        }
    };
    await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, worker));
    return out;
};
