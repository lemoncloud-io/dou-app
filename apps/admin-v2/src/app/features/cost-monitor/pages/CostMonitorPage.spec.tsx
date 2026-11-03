/**
 * `pages/cost-monitor/CostMonitorPage.spec.tsx`
 *
 * Drives the assembled screen against fake goods and relay calls. The lib specs cover the numbers; what
 * only shows up here is the wiring — that the stage's own goods base is called, that rows, DoU names and
 * the slot pool reach the screen, that a missing Cost Explorer day reads "not collected", that a
 * calibration day scales today, and that one account's failed metrics stay in its own row.
 *
 * The screen sits behind an admin OAuth gate, so this stands in for clicking through it.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { addDays, kstDay, todayKst } from '../lib/cost';

import type * as CostApi from '../api/costApi';
import type { Actual } from '../lib/costRows';

const fetchTenants = vi.fn<typeof CostApi.fetchTenants>();
const fetchClouds = vi.fn<typeof CostApi.fetchClouds>();
const fetchMetrics = vi.fn<typeof CostApi.fetchMetrics>();
const fetchActuals = vi.fn<typeof CostApi.fetchActuals>();

vi.mock('../api/costApi', async importActual => ({
    ...(await importActual<typeof CostApi>()),
    fetchTenants: (...args: Parameters<typeof CostApi.fetchTenants>) => fetchTenants(...args),
    fetchClouds: (...args: Parameters<typeof CostApi.fetchClouds>) => fetchClouds(...args),
    fetchMetrics: (...args: Parameters<typeof CostApi.fetchMetrics>) => fetchMetrics(...args),
    fetchActuals: (...args: Parameters<typeof CostApi.fetchActuals>) => fetchActuals(...args),
}));

vi.mock('../../../config/adapters', () => ({
    webConfigPorts: {
        env: {
            raw: (name: string) =>
                ({
                    VITE_V1_GOODS_ENDPOINT: 'https://api.example.org/cgs-v1',
                    VITE_V1_RELAY_ENDPOINT: 'https://api.example.org/dou-v1',
                })[name],
        },
    },
}));

const { CostMonitorPage } = await import('./CostMonitorPage');

const GOOD = '111111111111';
const BROKEN = '222222222222';
const today = todayKst();
/** One SQS million per KST hour of `day`, so a day is $0.40 × 24 before discount. */
const hourly = (day: string) => ({
    sqsRequests: Array.from({ length: 24 }, (_, h) => ({
        t: new Date(kstDay(day)[0] + h * 3_600_000).toISOString(),
        v: 1e6,
    })),
});
const ce = (cost: number): Actual => ({ total: cost, items: [{ useType: 'APN2-Requests-Tier1', totCost: cost }] });

const NO_ACTUALS = { byDay: new Map(), truncated: false };
/** The good account's Cost Explorer amount on one UTC day. */
const actualsFor = (day: string, actual: Actual) => ({
    byDay: new Map([[day.replace(/-/g, ''), new Map([[GOOD, actual]])]]),
    truncated: false,
});

const renderPage = () =>
    render(
        <QueryClientProvider
            client={new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })}
        >
            <CostMonitorPage />
        </QueryClientProvider>
    );

beforeEach(() => {
    vi.stubEnv('VITE_DOU_ENDPOINT', 'https://api.example.org/dou-v1');
    fetchTenants.mockResolvedValue({
        tenants: [
            {
                key: GOOD,
                accountNo: GOOD,
                dou: true,
                workspaceId: 'w1',
                workspaces: [{ id: 'w1', name: 'good-ws', dou: true }],
                slots: [],
            },
            {
                key: BROKEN,
                accountNo: BROKEN,
                dou: false,
                workspaceId: 'w2',
                workspaces: [{ id: 'w2', name: 'broken-ws', dou: false }],
                slots: [],
            },
        ],
        pool: {
            total: 5,
            idle: 1,
            assigned: 4,
            provisioning: 0,
            releasing: 0,
            cleaning: 0,
            errorCount: 0,
            archived: 0,
        },
        poolFromList: false,
        duplicates: 0,
        partial: [],
    });
    fetchClouds.mockResolvedValue({
        byAccount: new Map([[GOOD, [{ id: 'c1', name: 'Lemon Cloud', status: 'active', accountNo: GOOD }]]]),
        truncated: false,
    });
    fetchMetrics.mockImplementation(async (_goods, workspaceId, day) => {
        if (workspaceId === 'w2') throw new Error('The security token included in the request is invalid.');
        return { usage: {} as never, series: hourly(day) };
    });
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
});

describe('CostMonitorPage', () => {
    it("reads the stage's own goods base and shows rows, names, the pool and an uncollected actual", async () => {
        fetchActuals.mockResolvedValue(NO_ACTUALS);
        renderPage();

        expect(await screen.findByText('DoU cloud: Lemon Cloud (active)')).toBeTruthy();
        expect(fetchTenants).toHaveBeenCalledWith('https://api.example.org/cgs-v1');
        expect(fetchActuals).toHaveBeenCalledWith(
            'https://api.example.org/cgs-v1',
            addDays(today, -2),
            addDays(today, -1)
        );
        expect(screen.getByText('Slot pool 5')).toBeTruthy();
        expect((await screen.findAllByText('not collected')).length).toBeGreaterThan(0);
        expect(await screen.findByText('no actuals for UTC ' + addDays(today, -2) + ' yet')).toBeTruthy();
    });

    it("keeps one account's failed metrics in its own row", async () => {
        fetchActuals.mockResolvedValue(NO_ACTUALS);
        renderPage();

        const error = await screen.findByTitle('The security token included in the request is invalid.');
        expect(error.textContent).toBe('error');
        // The good account alone: 24 × $0.40, no discount by default.
        await waitFor(() => expect(screen.getAllByText('$9.6000').length).toBeGreaterThan(0));
    });

    it('scales today by the calibration day, and the switch turns it off', async () => {
        // Calibration day estimate is 24 × $0.40; Cost Explorer billed twice that.
        const estimate = 24 * 0.4;
        fetchActuals.mockResolvedValue(actualsFor(addDays(today, -2), ce(estimate * 2)));
        renderPage();

        expect(await screen.findByText('×2.000')).toBeTruthy();
        expect(screen.getByText('1 own · 1 by all (×2.000)')).toBeTruthy();

        fireEvent.click(screen.getByRole('switch'));
        expect(await screen.findByText('off')).toBeTruthy();
        expect(screen.queryByText('×2.000')).toBeNull();
    });

    it("keeps a late answer for the previous date from overwriting the new date's actuals", async () => {
        // The first date's cost list answers last.
        const late: { resolve?: (value: CostApi.ActualsByDay) => void } = {};
        fetchActuals
            .mockImplementationOnce(() => new Promise(resolve => (late.resolve = resolve)))
            .mockResolvedValueOnce(actualsFor(addDays(today, -2), ce(7)));
        renderPage();

        await screen.findByText('DoU cloud: Lemon Cloud (active)');
        fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
        expect((await screen.findAllByText('$7.0000')).length).toBeGreaterThan(0);

        late.resolve?.(actualsFor(addDays(today, -1), ce(99)));
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(screen.getAllByText('$7.0000').length).toBeGreaterThan(0);
        expect(screen.queryByText('$99.0000')).toBeNull();
    });

    it("drops the previous stage's numbers when the new stage is not configured", async () => {
        fetchActuals.mockResolvedValue(NO_ACTUALS);
        renderPage();
        await screen.findByText('Slot pool 5');

        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'd1' } });

        expect(
            await screen.findByText('VITE_D1_GOODS_ENDPOINT is not set, so there is no goods service to call.')
        ).toBeTruthy();
        expect(screen.queryByText('Slot pool 5')).toBeNull();
        expect(screen.queryByText(/Loading/)).toBeNull();
    });
});
