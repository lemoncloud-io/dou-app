import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

import type * as AppRuntimeModule from '@chatic/runtime';
import type { OnSubWebViewClosedPayload } from '@chatic/bridge-messages';

import type * as SharedModule from '../../../shared';

const env = vi.hoisted(() => ({
    scope: 'anyHttps' as string | null,
    activeCloudId: 'c1' as string | null,
    c2Kind: 'invited' as string,
    noUid: false,
    closed: null as ((closed: OnSubWebViewClosedPayload) => void) | null,
    open: vi.fn(),
    toastFailure: vi.fn(),
    links: {} as Record<string, string>,
    fetchMiniAppUrl: vi.fn(),
    saveMiniAppUrl: vi.fn(),
}));

vi.mock('../utils/subWebViewShell', () => ({
    readSubWebViewOpenScope: () => Promise.resolve(env.scope),
    openShellSubWebView: env.open,
    onShellSubWebViewClosed: (listener: (closed: OnSubWebViewClosedPayload) => void) => {
        env.closed = listener;
        return () => {
            env.closed = null;
        };
    },
}));

vi.mock('@chatic/runtime', async () => {
    const actual = await vi.importActual<typeof AppRuntimeModule>('@chatic/runtime');
    return {
        ...actual,
        runtime: {
            ...actual.runtime,
            data: {
                ...actual.runtime.data,
                useRuntimeRepositories: () => ({
                    cloud: { fetchMiniAppUrl: env.fetchMiniAppUrl, saveMiniAppUrl: env.saveMiniAppUrl },
                }),
            },
            session: {
                ...actual.runtime.session,
                useSessionIdentity: () => ({ userId: 'uid-session' }),
                useUidInCloud: (cid: string) => (cid && !env.noUid ? `uid-${cid}` : null),
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
            { id: 'c2', name: 'Friends', status: 'active', kind: env.c2Kind },
        ],
        activeCloudId: env.activeCloudId,
    }),
    useCurrentPlace: () => ({ place: undefined, placeName: 'Studio', placeId: 'p1' }),
    useAccountName: () => 'Ada',
    useSiteProfileMap: () => ({ 'uid-c1': { nick: 'Ada in Studio' }, 'uid-session': { nick: 'Ada, saved' } }),
    toastFailure: env.toastFailure,
}));

import '../../../../i18n';
import { MiniAppSettingsItem } from './MiniAppSettingsItem';

const HUB = 'https://apps-dev.chatic.io/';
const SHOP = 'https://shop.example/app';

let queryClient: QueryClient;
const wrap = (node: ReactNode) => <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>;

const renderItem = async () => {
    const view = render(wrap(<MiniAppSettingsItem />));
    await act(async () => undefined);
    return { ...view, rerender: () => view.rerender(wrap(<MiniAppSettingsItem />)) };
};

const openButton = () => screen.getByRole('button', { name: /Open mini app/ });
const linkButton = () => screen.queryByRole('button', { name: /Mini app link/ });
const linkRow = () => screen.getByRole('button', { name: /Mini app link/ });
const addressInput = () => screen.queryByLabelText('Address (https)');

const hubCloses = (result: unknown) => act(() => env.closed?.({ viewId: 'view-1', reason: 'page', result }));

const typeAndSave = async (url: string) => {
    fireEvent.change(await screen.findByLabelText('Address (https)'), { target: { value: url } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
};

describe('MiniAppSettingsItem — server link', () => {
    beforeEach(() => {
        env.scope = 'anyHttps';
        env.activeCloudId = 'c1';
        env.c2Kind = 'invited';
        env.noUid = false;
        env.links = {};
        env.open.mockReset().mockResolvedValue('view-1');
        env.toastFailure.mockReset();
        env.fetchMiniAppUrl.mockReset().mockImplementation((cid: string) => Promise.resolve(env.links[cid] ?? ''));
        env.saveMiniAppUrl.mockReset().mockImplementation((cid: string, url: string) => {
            env.links[cid] = url;
            return Promise.resolve(url);
        });
        queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        window.localStorage.clear();
        vi.stubEnv('VITE_ENV', 'DEV');
    });
    afterEach(() => {
        cleanup();
        vi.unstubAllEnvs();
    });

    it.each([['reviewed'], [null]])('is absent when the shell opens %s', async scope => {
        env.scope = scope;
        await renderItem();

        expect(screen.queryByText('Mini apps')).toBeNull();
    });

    it.each([['PROD'], ['']])('is absent on a %j build: mini apps are not released to production', async stage => {
        vi.stubEnv('VITE_ENV', stage);
        await renderItem();

        expect(screen.queryByText('Mini apps')).toBeNull();
    });

    it('is absent in the Default Cloud, which has no owner and no link', async () => {
        env.activeCloudId = 'default';
        await renderItem();

        expect(screen.queryByText('Mini apps')).toBeNull();
        expect(env.fetchMiniAppUrl).not.toHaveBeenCalled();
    });

    it('opens the link the relay holds for the cloud, and names its host', async () => {
        env.links.c1 = SHOP;
        window.localStorage.setItem('dou.miniAppConsent.uid-session.shop.example', '1');
        await renderItem();

        await waitFor(() => expect(openButton().textContent).toContain('shop.example'));
        fireEvent.click(openButton());

        await waitFor(() => expect(env.open).toHaveBeenCalledTimes(1));
        expect(env.fetchMiniAppUrl).toHaveBeenCalledWith('c1');
        expect(env.open).toHaveBeenCalledWith(SHOP, {
            cloud: { id: 'c1', name: 'Lemon' },
            place: { id: 'p1', name: 'Studio' },
            user: { id: 'uid-c1', name: 'Ada in Studio' },
        });
    });

    it('opens the hub with who is looking, the owner flag included, while the cloud has no link', async () => {
        await renderItem();

        fireEvent.click(openButton());

        await waitFor(() => expect(env.open).toHaveBeenCalledTimes(1));
        expect(env.open).toHaveBeenCalledWith(HUB, {
            cloud: { id: 'c1', name: 'Lemon' },
            place: { id: 'p1', name: 'Studio' },
            user: { id: 'uid-c1', name: 'Ada in Studio', isOwner: true },
            miniApps: [],
        });
    });

    it('opens the hub instead of a stored link the shell would not open', async () => {
        env.links.c1 = 'http://shop.example/';
        await renderItem();

        fireEvent.click(openButton());

        await waitFor(() => expect(env.open).toHaveBeenCalledTimes(1));
        expect(env.open.mock.calls[0][0]).toBe(HUB);
    });

    it('opens the hub instead of a stored link on the hub’s own hosts', async () => {
        env.links.c1 = 'https://apps.chatic.io/other';
        await renderItem();

        fireEvent.click(openButton());

        await waitFor(() => expect(env.open).toHaveBeenCalledTimes(1));
        expect(env.open.mock.calls[0][0]).toBe(HUB);
    });

    it('lets a member open the owner’s link, and tells the page nothing of ownership', async () => {
        env.activeCloudId = 'c2';
        env.links.c2 = SHOP;
        window.localStorage.setItem('dou.miniAppConsent.uid-session.shop.example', '1');
        await renderItem();

        expect(linkButton()).toBeNull();
        fireEvent.click(openButton());

        await waitFor(() => expect(env.open).toHaveBeenCalledTimes(1));
        expect(env.open).toHaveBeenCalledWith(
            SHOP,
            expect.objectContaining({ user: { id: 'uid-c2', name: 'Ada, saved' } })
        );
    });

    it('asks first before a site DoU does not run gets the names, and remembers the yes', async () => {
        env.links.c1 = SHOP;
        await renderItem();

        fireEvent.click(openButton());
        expect(await screen.findByText('Open a site outside DoU?')).toBeTruthy();
        expect(env.open).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Open' }));

        await waitFor(() => expect(env.open).toHaveBeenCalledWith(SHOP, expect.anything()));
        expect(window.localStorage.getItem('dou.miniAppConsent.uid-session.shop.example')).toBe('1');
    });

    it('opens nothing for a no to the consent', async () => {
        env.links.c1 = SHOP;
        await renderItem();

        fireEvent.click(openButton());
        fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

        await waitFor(() => expect(screen.queryByText('Open a site outside DoU?')).toBeNull());
        expect(env.open).not.toHaveBeenCalled();
    });

    it('says so, and opens nothing, when the link cannot be read', async () => {
        env.fetchMiniAppUrl.mockRejectedValue(new Error('offline'));
        await renderItem();

        fireEvent.click(openButton());

        await waitFor(() =>
            expect(env.toastFailure).toHaveBeenCalledWith("Couldn't open the mini app.", expect.any(Error))
        );
        expect(env.open).not.toHaveBeenCalled();
    });

    it('sends one request for a double press', async () => {
        await renderItem();

        fireEvent.click(openButton());
        fireEvent.click(openButton());

        await waitFor(() => expect(env.open).toHaveBeenCalledTimes(1));
        await act(async () => undefined);
        expect(env.open).toHaveBeenCalledTimes(1);
    });

    it('tells the user when the shell refuses to open it', async () => {
        env.open.mockRejectedValue(new Error('ALREADY_OPEN'));
        await renderItem();

        fireEvent.click(openButton());

        await waitFor(() =>
            expect(env.toastFailure).toHaveBeenCalledWith("Couldn't open the mini app.", expect.any(Error))
        );
    });

    it('opens nothing, and says so, while the session has no id in this cloud', async () => {
        env.noUid = true;
        await renderItem();

        fireEvent.click(openButton());

        await waitFor(() => expect(env.toastFailure).toHaveBeenCalled());
        expect(env.open).not.toHaveBeenCalled();
    });

    it('lets the owner set the link only to an address the shell would open, and saves it to the relay', async () => {
        await renderItem();
        await waitFor(() => expect(linkButton()?.textContent).toContain('Not set'));
        fireEvent.click(linkRow());

        await typeAndSave('https://shop.example:8443/');
        expect(await screen.findByText('Enter an https address without a port or sign-in part.')).toBeTruthy();
        await typeAndSave('https://apps.chatic.io/other');
        expect(await screen.findByText("The mini app home can't be the link. Enter another address.")).toBeTruthy();
        expect(env.saveMiniAppUrl).not.toHaveBeenCalled();

        await typeAndSave(`  ${SHOP}  `);

        await waitFor(() => expect(addressInput()).toBeNull());
        expect(env.saveMiniAppUrl).toHaveBeenCalledWith('c1', SHOP);
        expect(linkButton()?.textContent).toContain('shop.example');
    });

    it('lets the owner clear the link, which opens the hub again', async () => {
        env.links.c1 = SHOP;
        await renderItem();
        await waitFor(() => expect(linkButton()?.textContent).toContain('shop.example'));
        fireEvent.click(linkRow());

        expect((await screen.findByLabelText<HTMLInputElement>('Address (https)')).value).toBe(SHOP);
        fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

        await waitFor(() => expect(addressInput()).toBeNull());
        expect(env.saveMiniAppUrl).toHaveBeenCalledWith('c1', '');
        fireEvent.click(openButton());
        await waitFor(() => expect(env.open).toHaveBeenCalledTimes(1));
        expect(env.open.mock.calls[0][0]).toBe(HUB);
    });

    it('keeps the dialog and says so when the relay does not save the link', async () => {
        env.saveMiniAppUrl.mockRejectedValue(new Error('403 FORBIDDEN'));
        await renderItem();
        fireEvent.click(linkRow());

        await typeAndSave(SHOP);

        expect(await screen.findByText("Couldn't save the link.")).toBeTruthy();
        expect(addressInput()).not.toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        await waitFor(() => expect(addressInput()).toBeNull());
        expect(linkButton()?.textContent).toContain('Not set');
    });

    it('opens no link dialog, and says so, when the link cannot be read for editing', async () => {
        env.links.c1 = SHOP;
        env.fetchMiniAppUrl.mockRejectedValue(new Error('offline'));
        await renderItem();

        expect(linkRow().textContent).not.toContain('Not set');
        fireEvent.click(linkRow());

        await waitFor(() =>
            expect(env.toastFailure).toHaveBeenCalledWith("Couldn't read the mini app link.", expect.any(Error))
        );
        expect(addressInput()).toBeNull();
    });

    it('opens nothing when the cloud changes while the link is still being read', async () => {
        let answer: (url: string) => void = () => undefined;
        env.fetchMiniAppUrl.mockImplementation(() => new Promise<string>(resolve => (answer = resolve)));
        const { rerender } = await renderItem();
        fireEvent.click(openButton());

        env.activeCloudId = 'c2';
        rerender();
        await act(async () => answer(SHOP));
        await act(async () => undefined);

        expect(env.open).not.toHaveBeenCalled();
    });

    it('takes the owner to the link dialog when the hub asks, and no one else', async () => {
        await renderItem();
        fireEvent.click(openButton());
        await waitFor(() => expect(env.open).toHaveBeenCalled());

        act(() => env.closed?.({ viewId: 'other', reason: 'page', result: { action: 'openMiniAppLinkSettings' } }));
        expect(addressInput()).toBeNull();
        hubCloses({ action: 'openMiniAppLinkSettings' });
        expect(await screen.findByLabelText('Address (https)')).toBeTruthy();
        cleanup();

        env.activeCloudId = 'c2';
        await renderItem();
        fireEvent.click(openButton());
        await waitFor(() => expect(env.open).toHaveBeenCalledTimes(2));
        hubCloses({ action: 'openMiniAppLinkSettings' });
        expect(addressInput()).toBeNull();
    });

    it("drops a member's request to set the link, so becoming the owner later opens no dialog", async () => {
        env.activeCloudId = 'c2';
        const { rerender } = await renderItem();
        fireEvent.click(openButton());
        await waitFor(() => expect(env.open).toHaveBeenCalledTimes(1));
        hubCloses({ action: 'openMiniAppLinkSettings' });

        env.c2Kind = 'owned';
        rerender();
        await act(async () => undefined);

        expect(addressInput()).toBeNull();
    });

    it('ignores a hub that closes after a switch', async () => {
        const { rerender } = await renderItem();
        fireEvent.click(openButton());
        await waitFor(() => expect(env.open).toHaveBeenCalledTimes(1));

        env.activeCloudId = 'c2';
        env.c2Kind = 'owned';
        rerender();
        await act(async () => undefined);
        hubCloses({ action: 'openMiniAppLinkSettings' });

        expect(addressInput()).toBeNull();
    });

    it("drops a consent still waiting when the cloud changes, so agreeing never sends the new cloud's names", async () => {
        env.links.c1 = SHOP;
        const { rerender } = await renderItem();
        fireEvent.click(openButton());
        expect(await screen.findByText('Open a site outside DoU?')).toBeTruthy();

        env.activeCloudId = 'c2';
        rerender();
        await act(async () => undefined);

        await waitFor(() => expect(screen.queryByText('Open a site outside DoU?')).toBeNull());
        expect(env.open).not.toHaveBeenCalled();
    });
});
