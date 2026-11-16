import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type * as AppRuntimeModule from '@chatic/app-runtime';

import type * as SharedModule from '../../../shared';

const env = vi.hoisted(() => ({
    scope: 'anyHttps' as string | null,
    activeCloudId: 'c1' as string | null,
    open: vi.fn(),
    links: {} as Record<string, string>,
}));

vi.mock('../utils/subWebViewShell', () => ({
    readSubWebViewOpenScope: () => Promise.resolve(env.scope),
    openShellSubWebView: env.open,
    onShellSubWebViewClosed: () => () => undefined,
}));

vi.mock('@chatic/app-runtime', async () => {
    const actual = await vi.importActual<typeof AppRuntimeModule>('@chatic/app-runtime');
    return {
        ...actual,
        runtime: {
            ...actual.runtime,
            data: {
                ...actual.runtime.data,
                useRuntimeRepositories: () => ({
                    cloud: {
                        fetchMiniAppUrl: (cid: string) => Promise.resolve(env.links[cid] ?? ''),
                        saveMiniAppUrl: vi.fn(),
                    },
                }),
            },
            session: {
                ...actual.runtime.session,
                useSessionIdentity: () => ({ userId: 'uid-session' }),
                useUidInCloud: (cid: string) => (cid ? `uid-${cid}` : null),
            },
        },
    };
});

vi.mock('../../../shared', async () => ({
    ...(await vi.importActual<typeof SharedModule>('../../../shared')),
    useClouds: () => ({
        clouds: [
            { id: 'default', name: 'Home', status: 'active', kind: 'home' },
            { id: 'c1', name: 'Lemon', status: 'active', kind: 'owned' },
        ],
        activeCloudId: env.activeCloudId,
    }),
    useCurrentPlace: () => ({ place: undefined, placeName: 'Studio', placeId: 'p1' }),
    useAccountName: () => 'Ada',
    useSiteProfileMap: () => ({}),
    toastFailure: vi.fn(),
}));

import '../../../../i18n';
import { MiniAppRailButton } from './MiniAppRailButton';

const HUB = 'https://apps-dev.chatic.io/';
const SHOP = 'https://shop.example/app';

const renderButton = async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <QueryClientProvider client={client}>
            <MiniAppRailButton />
        </QueryClientProvider>
    );
    await act(async () => undefined);
};

const railButton = () => screen.queryByRole('button', { name: 'Mini app' });

describe('MiniAppRailButton', () => {
    beforeEach(() => {
        env.scope = 'anyHttps';
        env.activeCloudId = 'c1';
        env.links = {};
        env.open.mockReset().mockResolvedValue('view-1');
        window.localStorage.clear();
        vi.stubEnv('VITE_ENV', 'DEV');
    });
    afterEach(() => {
        cleanup();
        vi.unstubAllEnvs();
    });

    it('opens the hub from the rail while the cloud has no link', async () => {
        await renderButton();

        fireEvent.click(railButton() as HTMLElement);

        await waitFor(() => expect(env.open).toHaveBeenCalledTimes(1));
        expect(env.open.mock.calls[0][0]).toBe(HUB);
    });

    it("opens the cloud's link, after the consent for a site DoU does not run", async () => {
        env.links.c1 = SHOP;
        await renderButton();

        fireEvent.click(railButton() as HTMLElement);
        fireEvent.click(await screen.findByRole('button', { name: 'Open' }));

        await waitFor(() => expect(env.open).toHaveBeenCalledWith(SHOP, expect.anything()));
    });

    it.each([['reviewed'], [null]])('is absent when the shell opens %s', async scope => {
        env.scope = scope;
        await renderButton();

        expect(railButton()).toBeNull();
    });

    it('is absent on a production build', async () => {
        vi.stubEnv('VITE_ENV', 'PROD');
        await renderButton();

        expect(railButton()).toBeNull();
    });

    it('is absent in the Default Cloud', async () => {
        env.activeCloudId = 'default';
        await renderButton();

        expect(railButton()).toBeNull();
    });
});
