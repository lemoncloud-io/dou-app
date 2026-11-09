import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type * as AppRuntimeModule from '@chatic/app-runtime';
import type { OnSubWebViewClosedPayload } from '@chatic/bridge-messages';

import type * as SharedModule from '../../../shared';

const env = vi.hoisted(() => ({
    scope: 'anyHttps' as string | null,
    activeCloudId: 'c1' as string | null,
    noUid: false,
    closed: null as ((closed: OnSubWebViewClosedPayload) => void) | null,
    open: vi.fn(),
    toastFailure: vi.fn(),
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

vi.mock('@chatic/app-runtime', async () => {
    const actual = await vi.importActual<typeof AppRuntimeModule>('@chatic/app-runtime');
    return {
        ...actual,
        runtime: {
            ...actual.runtime,
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
            { id: 'c2', name: 'Friends', status: 'active', kind: 'invited' },
        ],
        activeCloudId: env.activeCloudId,
    }),
    useCurrentPlace: () => ({ place: undefined, placeName: 'Studio', placeId: 'p1' }),
    useAccountName: () => 'Ada',
    useSiteProfileMap: () => ({ 'uid-c1': { nick: 'Ada in Studio' } }),
    toastFailure: env.toastFailure,
}));

import '../../../../i18n';
import { MiniAppSettingsItem } from './MiniAppSettingsItem';

const HUB = 'https://apps-dev.chatic.io/';

const renderItem = async () => {
    const view = render(<MiniAppSettingsItem />);
    // The shell's handshake answers asynchronously.
    await act(async () => undefined);
    return view;
};

const openButton = () => screen.getByRole('button', { name: /Open mini app/ });
const linkButton = () => screen.queryByRole('button', { name: /Mini app link/ });

const saveLink = async (value: string) => {
    fireEvent.click(screen.getByRole('button', { name: /Mini app link/ }));
    const input = await screen.findByLabelText('Address (https)');
    fireEvent.change(input, { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
};

describe('MiniAppSettingsItem', () => {
    beforeEach(() => {
        env.scope = 'anyHttps';
        env.activeCloudId = 'c1';
        env.noUid = false;
        env.open.mockReset().mockResolvedValue('view-1');
        env.toastFailure.mockReset();
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

        expect(screen.queryByText('Mini app')).toBeNull();
    });

    it('is absent in the Default Cloud, which has no owner and no link', async () => {
        env.activeCloudId = 'default';
        await renderItem();

        expect(screen.queryByText('Mini app')).toBeNull();
    });

    it('offers the link setting to the owner only', async () => {
        await renderItem();
        expect(linkButton()).not.toBeNull();
        cleanup();

        env.activeCloudId = 'c2';
        await renderItem();
        expect(openButton()).toBeTruthy();
        expect(linkButton()).toBeNull();
    });

    it('opens the hub with who is looking, the owner flag included, while the cloud has no link', async () => {
        await renderItem();

        fireEvent.click(openButton());

        await waitFor(() => expect(env.open).toHaveBeenCalledTimes(1));
        expect(env.open).toHaveBeenCalledWith(HUB, {
            cloud: { id: 'c1', name: 'Lemon' },
            place: { id: 'p1', name: 'Studio' },
            user: { id: 'uid-c1', name: 'Ada in Studio', isOwner: true },
        });
    });

    it('refuses a link the shell would not open, and keeps it per cloud', async () => {
        await renderItem();

        await saveLink('https://shop.example:8443/');
        expect(await screen.findByText('Enter an https address without a port or sign-in part.')).toBeTruthy();
        expect(window.localStorage.getItem('dou.miniAppLink.c1')).toBeNull();

        fireEvent.change(screen.getByLabelText('Address (https)'), { target: { value: 'https://shop.example/app' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(window.localStorage.getItem('dou.miniAppLink.c1')).toBe('https://shop.example/app'));
        expect(screen.getAllByText('shop.example').length).toBeGreaterThan(0);
        cleanup();

        env.activeCloudId = 'c2';
        await renderItem();
        expect(screen.queryByText('shop.example')).toBeNull();
    });

    it('says so when this computer will not keep the link', async () => {
        await renderItem();
        const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('QuotaExceededError');
        });

        await saveLink('https://shop.example/app');

        expect(await screen.findByText("Couldn't save the link on this computer.")).toBeTruthy();
        setItem.mockRestore();
    });

    it('asks before a site DoU does not run first gets the names, and opens it without the owner flag', async () => {
        window.localStorage.setItem('dou.miniAppLink.c1', 'https://shop.example/app');
        await renderItem();

        fireEvent.click(openButton());
        expect(await screen.findByText('Open a site outside DoU?')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        await waitFor(() => expect(screen.queryByText('Open a site outside DoU?')).toBeNull());
        expect(env.open).not.toHaveBeenCalled();

        fireEvent.click(openButton());
        fireEvent.click(await screen.findByRole('button', { name: 'Open' }));
        await waitFor(() => expect(env.open).toHaveBeenCalledTimes(1));
        expect(env.open.mock.calls[0][0]).toBe('https://shop.example/app');
        expect(env.open.mock.calls[0][1].user).toEqual({ id: 'uid-c1', name: 'Ada in Studio' });

        fireEvent.click(openButton());
        await waitFor(() => expect(env.open).toHaveBeenCalledTimes(2));
        expect(screen.queryByText('Open a site outside DoU?')).toBeNull();
    });

    it('sends one request for a double press', async () => {
        let resolve: (viewId: string) => void = () => undefined;
        env.open.mockReturnValue(new Promise<string>(r => (resolve = r)));
        await renderItem();

        fireEvent.click(openButton());
        fireEvent.click(openButton());
        await act(async () => resolve('view-1'));

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

    it('opens nothing, and says so, while the session has no id in this cloud, never sending another cloud’s', async () => {
        env.noUid = true;
        await renderItem();

        fireEvent.click(openButton());

        expect(env.open).not.toHaveBeenCalled();
        expect(env.toastFailure).toHaveBeenCalledWith("Couldn't open the mini app.", null);
    });

    it('keeps a hub result a member received from opening the setting after a switch to an owned cloud', async () => {
        env.activeCloudId = 'c2';
        const { rerender } = await renderItem();
        fireEvent.click(openButton());
        await waitFor(() => expect(env.open).toHaveBeenCalled());
        act(() => env.closed?.({ viewId: 'view-1', reason: 'page', result: { action: 'openMiniAppLinkSettings' } }));

        env.activeCloudId = 'c1';
        rerender(<MiniAppSettingsItem />);
        await act(async () => undefined);

        expect(linkButton()).not.toBeNull();
        expect(screen.queryByLabelText('Address (https)')).toBeNull();
    });

    it('takes the owner to the link setting when the hub asks, and no one else', async () => {
        await renderItem();
        fireEvent.click(openButton());
        await waitFor(() => expect(env.open).toHaveBeenCalled());

        act(() => env.closed?.({ viewId: 'other', reason: 'page', result: { action: 'openMiniAppLinkSettings' } }));
        expect(screen.queryByLabelText('Address (https)')).toBeNull();
        act(() => env.closed?.({ viewId: 'view-1', reason: 'page', result: { action: 'openMiniAppLinkSettings' } }));
        expect(await screen.findByLabelText('Address (https)')).toBeTruthy();
        cleanup();

        env.activeCloudId = 'c2';
        await renderItem();
        fireEvent.click(openButton());
        await waitFor(() => expect(env.open).toHaveBeenCalledTimes(2));
        act(() => env.closed?.({ viewId: 'view-1', reason: 'page', result: { action: 'openMiniAppLinkSettings' } }));
        expect(screen.queryByLabelText('Address (https)')).toBeNull();
    });
});
