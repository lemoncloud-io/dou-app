/**
 * `api/cost-monitor/costApi.spec.ts`
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface SentRequest {
    config: { method?: string; baseURL?: string };
    params?: Record<string, unknown>;
    body?: unknown;
}

const sent: SentRequest[] = [];
/** Replies by URL suffix, so parallel calls do not depend on their order. */
const replies = new Map<string, ({ data: unknown } | { error: unknown })[]>();

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        boot: {
            webTransport: {
                buildSignedRequest: (config: SentRequest['config']) => {
                    const request: SentRequest = { config };
                    sent.push(request);
                    const builder = {
                        setParams: (params: Record<string, unknown>) => {
                            request.params = params;
                            return builder;
                        },
                        setBody: (body: unknown) => {
                            request.body = body;
                            return builder;
                        },
                        execute: async () => {
                            const key = [...replies.keys()].find(suffix => config.baseURL?.endsWith(suffix));
                            const reply = key ? replies.get(key)?.shift() : undefined;
                            if (!reply) throw new Error(`no reply queued for ${config.baseURL}`);
                            if ('error' in reply) throw reply.error;
                            return reply;
                        },
                    };
                    return builder;
                },
            },
        },
    },
}));

const { actualsOf, createLimiter, fetchActuals, fetchClouds, fetchMetrics, fetchTenants } = await import('./costApi');

const reply = (suffix: string, ...list: ({ data: unknown } | { error: unknown })[]) => replies.set(suffix, list);
const GOODS = 'https://api.example.org/cgs-v1';

beforeEach(() => {
    sent.length = 0;
    replies.clear();
});

describe('fetchTenants', () => {
    it('folds workspaces and slots into account rows and keeps only the shown fields', async () => {
        reply('/workspaces/0/list', {
            data: {
                list: [{ id: 'w1', name: 'ws', accountNo: '111111111111', createdBy: 'chatic', secret$: { key: 'x' } }],
                total: 1,
            },
        });
        reply(
            '/slots/0/list',
            {
                data: {
                    list: [{ id: 's1', state: 'assigned', accountNo: '111111111111', workspaceId: 'w1' }],
                    total: 3,
                },
            },
            { data: { total: 1, idle: 0, assigned: 1 } }
        );

        const res = await fetchTenants(GOODS);

        expect(res.tenants).toHaveLength(1);
        expect(res.tenants[0]).toMatchObject({ key: '111111111111', dou: true, workspaceId: 'w1' });
        expect(JSON.stringify(res)).not.toContain('secret');
        expect(res.partial).toEqual(['slots 1/3']);
        expect(sent.find(r => r.config.baseURL?.endsWith('/workspaces/0/list'))?.params).toMatchObject({
            view: 'admin',
            accountNo: '!',
        });
    });

    it('counts the pool from the slot list when view=status gives nothing', async () => {
        reply('/workspaces/0/list', { data: { list: [] } });
        reply(
            '/slots/0/list',
            { data: { list: [{ id: 's1', state: 'idle' }] } },
            { error: new Error('not supported') }
        );

        const res = await fetchTenants(GOODS);

        expect(res.poolFromList).toBe(true);
        expect(res.pool).toMatchObject({ total: 1, idle: 1 });
    });

    it('names the service when a call gets no response', async () => {
        reply('/workspaces/0/list', { error: new Error('Network Error') });
        reply('/slots/0/list', { data: { list: [] } }, { data: null });

        await expect(fetchTenants(GOODS)).rejects.toThrow(
            'No response from the goods service (Network Error). A rejected request signature looks like this too.'
        );
    });

    it('shows the response body when there is one', async () => {
        reply('/workspaces/0/list', { error: { response: { status: 403, data: { message: '403 NOT ALLOWED' } } } });
        reply('/slots/0/list', { data: { list: [] } }, { data: null });

        await expect(fetchTenants(GOODS)).rejects.toThrow('403 NOT ALLOWED');
    });
});

describe('fetchClouds', () => {
    it('walks pages until a short one and groups the clouds by account', async () => {
        const page = (n: number, from: number) =>
            Array.from({ length: n }, (_, i) => ({
                id: `${from + i}`,
                name: `c${from + i}`,
                accountNo: `${from + i}`.padStart(12, '0'),
            }));
        reply('/clouds/0/list', { data: { list: page(100, 0) } }, { data: { list: [...page(1, 100), { id: 'x' }] } });

        const { byAccount, truncated } = await fetchClouds('https://api.example.org/dou-v1');

        expect(sent.map(r => r.params?.page)).toEqual([0, 1]);
        expect(sent[0].params).toMatchObject({ view: 'admin', valid: 0 });
        expect(truncated).toBe(false);
        expect(byAccount.size).toBe(101);
        expect(byAccount.get('000000000100')).toEqual([
            { id: '100', name: 'c100', status: undefined, accountNo: '000000000100' },
        ]);
    });

    it('says so when the walk stops at the cap with more left', async () => {
        const full = { data: { list: Array.from({ length: 100 }, (_, i) => ({ id: `${i}` })) } };
        reply('/clouds/0/list', ...Array.from({ length: 20 }, () => full));

        const { truncated } = await fetchClouds('https://api.example.org/dou-v1');

        expect(sent).toHaveLength(20);
        expect(truncated).toBe(true);
    });
});

describe('fetchMetrics', () => {
    it('posts the day and returns usage and series', async () => {
        reply('/metrics', { data: { metrics$: { usage$: { sqsRequests: 1 }, series$: { sqsRequests: [] } } } });

        const res = await fetchMetrics(GOODS, 'w 1', '2026-11-02');

        expect(sent[0].config.baseURL).toBe(`${GOODS}/workspaces/w%201/metrics`);
        expect(sent[0].body).toEqual({ date: '2026-11-02', period: 3600 });
        expect(res.usage.sqsRequests).toBe(1);
    });

    it('fails when the goods service answers without metrics', async () => {
        reply('/metrics', { data: {} });

        await expect(fetchMetrics(GOODS, 'w1', '2026-11-02')).rejects.toThrow('returned no metrics');
    });

    it('does not send a call whose query was dropped', async () => {
        const controller = new AbortController();
        controller.abort();

        await expect(fetchMetrics(GOODS, 'w1', '2026-11-02', controller.signal)).rejects.toThrow('Superseded');
        expect(sent).toHaveLength(0);
    });
});

describe('fetchActuals', () => {
    it('reads through the goods relay and splits the days, whichever date form comes back', async () => {
        reply('/workspaces/0/costs', {
            data: {
                list: [
                    {
                        accountNo: 'a',
                        date: '2026-10-31',
                        totalPrice: 2,
                        item$$: [{ useType: 'U', totCost: 1, extra: 9 }],
                    },
                    { accountNo: 'a', date: '20261101', totalPrice: 3 },
                ],
            },
        });

        const { byDay, truncated } = await fetchActuals(GOODS, '2026-10-31', '2026-11-01');

        expect(sent[0].config.baseURL).toBe(`${GOODS}/workspaces/0/costs`);
        expect(sent[0].params).toEqual({ from: '2026-10-31', to: '2026-11-01' });
        expect(actualsOf(byDay, '2026-10-31').get('a')).toEqual({ total: 2, items: [{ useType: 'U', totCost: 1 }] });
        expect(actualsOf(byDay, '2026-11-01').get('a')).toEqual({ total: 3, items: [] });
        expect(actualsOf(byDay, '2026-11-02').size).toBe(0);
        expect(truncated).toBe(false);
    });

    it('says so when fewer rows come back than the reported total', async () => {
        reply('/workspaces/0/costs', {
            data: { list: [{ accountNo: 'a', date: '2026-10-31', totalPrice: 1 }], total: 2 },
        });

        expect((await fetchActuals(GOODS, '2026-10-31', '2026-11-01')).truncated).toBe(true);
    });
});

describe('createLimiter', () => {
    it('runs at most `size` tasks at once and starts the next when one ends', async () => {
        const limit = createLimiter(2);
        const state = { running: 0, peak: 0 };
        const gates: (() => void)[] = [];
        const task = () =>
            limit(async () => {
                state.running++;
                state.peak = Math.max(state.peak, state.running);
                await new Promise<void>(resolve => gates.push(resolve));
                state.running--;
            });

        const all = Promise.all([task(), task(), task()]);
        await vi.waitFor(() => expect(gates).toHaveLength(2));
        gates.shift()?.();
        await vi.waitFor(() => expect(gates).toHaveLength(2));
        gates.forEach(open => open());
        await all;

        expect(state.peak).toBe(2);
    });
});
