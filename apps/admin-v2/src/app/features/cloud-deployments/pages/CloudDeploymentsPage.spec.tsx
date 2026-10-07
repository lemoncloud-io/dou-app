/**
 * `pages/cloud-deployments/CloudDeploymentsPage.spec.tsx`
 *
 * Drives the assembled screen against fake goods calls. The lib specs cover the rules; what only
 * shows up here is the wiring — that a confirmed pick becomes those calls on that goods service, that
 * a failed call is logged and shown, that a cloud's owner and status come from its DoU record when
 * there is one, and that both the Stop button and leaving the screen keep the next call from going
 * out.
 *
 * The screen sits behind an admin OAuth gate, so this stands in for clicking through it.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { logger } from '@chatic/bridges';

import { SERVICE_CODES, type CloudService } from '../lib/cloudGroups';

import type * as DouCloudsApi from '../api/douCloudsApi';
import type * as GoodsApi from '../api/goodsApi';
import type * as GoodsTarget from '../lib/goodsTarget';
import type * as RunDeploys from '../lib/runDeploys';
import type { DeployCall } from '../lib/deployPlan';

const fetchServiceProducts = vi.fn<(base: string, service: CloudService) => Promise<GoodsApi.ProductListResult>>();
const postAutoDeploy = vi.fn<(base: string, call: DeployCall) => Promise<GoodsApi.GoodsProduct>>();
const fetchDouClouds = vi.fn<(base: string) => Promise<DouCloudsApi.DouCloud[]>>();

// Mocked at the module edge: the real calls are signed AWS requests, which is not what this is about.
vi.mock('../api/goodsApi', async () => {
    const actual = await vi.importActual<typeof GoodsApi>('../api/goodsApi');
    return {
        ...actual,
        fetchServiceProducts: (base: string, service: CloudService) => fetchServiceProducts(base, service),
        postAutoDeploy: (base: string, call: DeployCall) => postAutoDeploy(base, call),
    };
});

vi.mock('../api/douCloudsApi', async () => {
    const actual = await vi.importActual<typeof DouCloudsApi>('../api/douCloudsApi');
    return { ...actual, fetchDouClouds: (base: string) => fetchDouClouds(base) };
});

vi.mock('../lib/goodsTarget', async () => {
    const actual = await vi.importActual<typeof GoodsTarget>('../lib/goodsTarget');
    return { ...actual, configuredRelayEndpoint: () => 'https://api.example.com/dou-d1' };
});

// No real 1.5-second pauses. The stand-in ignores the stop signal; the runner's own checks are what
// keep the next call from going out.
vi.mock('../lib/runDeploys', async () => {
    const actual = await vi.importActual<typeof RunDeploys>('../lib/runDeploys');
    return { ...actual, abortableDelay: () => Promise.resolve() };
});

const { CloudDeploymentsPage } = await import('./CloudDeploymentsPage');

const SERVICES: CloudService[] = ['backend', 'sockets', 'socials'];

/** Two prod clouds, p1 and p2, with all three services each. */
const serveClouds = () => {
    fetchServiceProducts.mockImplementation(async (_base, service) => ({
        list: ['p1', 'p2'].map(projectId => ({
            id: `${service}-${projectId}`,
            code: SERVICE_CODES[service],
            projectId,
            project$: { stereo: 'prod' },
            ownerId: 'u1',
            owner$: { name: 'Alice' },
            workspaceId: `w-${projectId}`,
            status: 'ready',
        })),
        truncated: false,
    }));
};

/** A deploy call that resolves only when the test says so. */
const deferredDeploy = () => {
    let release: () => void = () => undefined;
    postAutoDeploy.mockImplementationOnce(
        () =>
            new Promise(resolve => {
                release = () => resolve({ status: 'busy' });
            })
    );
    return () => release();
};

const renderPage = () =>
    render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <MemoryRouter>
                <CloudDeploymentsPage />
            </MemoryRouter>
        </QueryClientProvider>
    );

/** Picks cloud p1 and confirms, which starts a three-call run. */
const startRunOnP1 = async () => {
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select p1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Deploy 3 products' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Deploy' }));
};

beforeEach(() => {
    fetchServiceProducts.mockReset();
    postAutoDeploy.mockReset();
    postAutoDeploy.mockResolvedValue({ status: 'busy' });
    fetchDouClouds.mockReset();
    fetchDouClouds.mockResolvedValue([]);
    serveClouds();
});

describe('CloudDeploymentsPage', () => {
    it('lists each service on the goods stage the env names, and deploys the confirmed pick there', async () => {
        renderPage();
        // Each service's box reads as a branch field and names the default it falls back to.
        expect(await screen.findAllByPlaceholderText('branch (default: develop)')).toHaveLength(3);
        await startRunOnP1();

        expect(await screen.findByText('3 succeeded · 0 failed · 0 not started')).toBeTruthy();
        expect(fetchServiceProducts.mock.calls.map(([base, service]) => [base, service])).toEqual(
            SERVICES.map(service => ['https://api.example.com/cgs-d1', service])
        );
        expect(postAutoDeploy.mock.calls.map(([base, call]) => [base, call.productId, call.params])).toEqual([
            ['https://api.example.com/cgs-d1', 'backend-p1', { force: 1 }],
            ['https://api.example.com/cgs-d1', 'sockets-p1', { force: 1 }],
            ['https://api.example.com/cgs-d1', 'socials-p1', { force: 1 }],
        ]);
    });

    it('logs a failed call, shows it as a failed line, and carries on with the rest', async () => {
        const logError = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
        postAutoDeploy.mockImplementation(async (_base, call) => {
            if (call.productId === 'sockets-p1') throw new Error('400 INVALID STATE - busy');
            return { status: 'busy' };
        });
        renderPage();
        await startRunOnP1();

        expect(await screen.findByText('2 succeeded · 1 failed · 0 not started')).toBeTruthy();
        expect(screen.getByText('400 INVALID STATE - busy')).toBeTruthy();
        expect(logError).toHaveBeenCalledWith(
            'GLOBAL',
            '[useDeployRun] auto-deploy failed',
            expect.objectContaining({ productId: 'sockets-p1', service: 'sockets' })
        );
        logError.mockRestore();
    });

    it('freezes the goods stage while running, and Stop lets the call in flight finish but starts no other', async () => {
        const release = deferredDeploy();
        renderPage();
        await startRunOnP1();

        await waitFor(() => expect(postAutoDeploy).toHaveBeenCalledTimes(1));
        expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
        release();

        expect(await screen.findByText('1 succeeded · 0 failed · 2 not started')).toBeTruthy();
        expect(postAutoDeploy).toHaveBeenCalledTimes(1);
    });

    it('stops the run when the screen goes away', async () => {
        const release = deferredDeploy();
        const { unmount } = renderPage();
        await startRunOnP1();

        await waitFor(() => expect(postAutoDeploy).toHaveBeenCalledTimes(1));
        unmount();
        release();

        // Give the runner every chance to send the next call before checking that it did not.
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(postAutoDeploy).toHaveBeenCalledTimes(1);
    });

    it("shows a cloud's DoU owner and status from the relay of the same stage, and marks one DoU lacks", async () => {
        fetchDouClouds.mockResolvedValue([
            {
                id: 'c9',
                name: 'Dana cloud',
                status: 'suspended',
                ownerId: 'd1',
                owner$: { id: 'd1', name: 'Dana' },
                accountNo: '123456789012',
                workspaceId: 'w-p1',
            },
        ]);
        renderPage();

        expect(await screen.findByText('Dana')).toBeTruthy();
        expect(fetchDouClouds).toHaveBeenCalledWith('https://api.example.com/dou-d1');
        expect(screen.getByText('suspended')).toBeTruthy();
        expect(screen.getByText('123456789012')).toBeTruthy();
        // p2 has no DoU record: it keeps the goods owner, says so, and sorts after the DoU-owned cloud.
        expect(screen.getByText('not in DoU')).toBeTruthy();
        expect(screen.getByText('goods owner')).toBeTruthy();
        expect(
            screen.getAllByRole('checkbox', { name: /^Select p/ }).map(box => box.getAttribute('aria-label'))
        ).toEqual(['Select p1', 'Select p2']);
    });

    it('sorts by the header pressed, and flips the direction when it is pressed again', async () => {
        fetchDouClouds.mockResolvedValue([
            { id: '20', ownerId: 'd1', owner$: { id: 'd1', name: 'Ann' }, workspaceId: 'w-p1' },
            { id: '3', ownerId: 'd2', owner$: { id: 'd2', name: 'Bob' }, workspaceId: 'w-p2' },
        ]);
        renderPage();
        const rows = () =>
            screen.getAllByRole('checkbox', { name: /^Select p/ }).map(box => box.getAttribute('aria-label'));

        await screen.findByText('Ann');
        expect(rows()).toEqual(['Select p1', 'Select p2']);

        const cloudSort = screen.getByRole('button', { name: 'Sort by DoU cloud id' });
        fireEvent.click(cloudSort);
        expect(rows()).toEqual(['Select p2', 'Select p1']);
        expect(cloudSort.closest('th')?.getAttribute('aria-sort')).toBe('ascending');

        fireEvent.click(cloudSort);
        expect(rows()).toEqual(['Select p1', 'Select p2']);
        expect(cloudSort.closest('th')?.getAttribute('aria-sort')).toBe('descending');
    });

    it('keeps the table on goods owners when the DoU list cannot be read, without claiming no DoU cloud', async () => {
        fetchDouClouds.mockRejectedValue(new Error('No response from the relay'));
        renderPage();

        expect(await screen.findByText(/DoU cloud details could not be loaded/)).toBeTruthy();
        expect(screen.getByRole('checkbox', { name: 'Select p1' })).toBeTruthy();
        expect(screen.getAllByText('goods owner')).toHaveLength(2);
        expect(screen.getAllByText('unknown')).toHaveLength(2);
        expect(screen.queryByText('not in DoU')).toBeNull();
    });

    it('keeps the last DoU details when a refresh of them fails, and says they are the last ones', async () => {
        fetchDouClouds.mockResolvedValueOnce([
            { id: 'c9', ownerId: 'd1', owner$: { id: 'd1', name: 'Dana' }, status: 'active', workspaceId: 'w-p1' },
        ]);
        renderPage();
        await screen.findByText('Dana');

        fetchDouClouds.mockRejectedValueOnce(new Error('No response from the relay'));
        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

        expect(await screen.findByText(/DoU cloud details could not be refreshed/)).toBeTruthy();
        expect(screen.getByText('Dana')).toBeTruthy();
        expect(screen.getByText('active')).toBeTruthy();
    });

    it('blocks the table when one service list fails, naming that service', async () => {
        fetchServiceProducts.mockImplementation(async (_base, service) => {
            if (service === 'sockets') throw new Error('not filtering by code');
            return { list: [], truncated: false };
        });
        renderPage();

        expect(await screen.findByText('Failed to load the product lists')).toBeTruthy();
        expect(screen.getByText(SERVICE_CODES.sockets)).toBeTruthy();
        expect(screen.queryByRole('checkbox', { name: 'Select every cloud shown' })).toBeNull();
    });
});
