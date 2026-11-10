import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type * as AppRuntimeModule from '@chatic/app-runtime';
import type { OnSubWebViewClosedPayload } from '@chatic/bridge-messages';

import { MINI_APP_LINK_LIMIT } from '@chatic/shared';

import type * as SharedModule from '../../../shared';

const env = vi.hoisted(() => ({
    scope: 'anyHttps' as string | null,
    activeCloudId: 'c1' as string | null,
    // The catalog's say on c2, which can change under an open screen.
    c2Kind: 'invited' as string,
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
            { id: 'c2', name: 'Friends', status: 'active', kind: env.c2Kind },
        ],
        activeCloudId: env.activeCloudId,
    }),
    useCurrentPlace: () => ({ place: undefined, placeName: 'Studio', placeId: 'p1' }),
    useAccountName: () => 'Ada',
    // c1's nick is a synced row under the cloud id; c2 has only the row my own save wrote, under my
    // account id.
    useSiteProfileMap: () => ({ 'uid-c1': { nick: 'Ada in Studio' }, 'uid-session': { nick: 'Ada, saved' } }),
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

type StoredLink = { id: string; name: string; url: string };
const storeLinks = (cloudId: string, links: StoredLink[]) =>
    window.localStorage.setItem(`dou.miniAppLinks.${cloudId}`, JSON.stringify(links));
const storedLinks = (cloudId: string): StoredLink[] =>
    JSON.parse(window.localStorage.getItem(`dou.miniAppLinks.${cloudId}`) ?? '[]');

const hubButton = () => screen.getByRole('button', { name: /Open mini apps/ });
const addButton = () => screen.queryByRole('button', { name: /Add mini app/ });
const nameInput = () => screen.queryByLabelText('Name');

/** The hub this screen opened closes with `result`. */
const hubCloses = (result: unknown) => act(() => env.closed?.({ viewId: 'view-1', reason: 'page', result }));

const fillAndSave = async (name: string, url: string) => {
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: name } });
    fireEvent.change(screen.getByLabelText('Address (https)'), { target: { value: url } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
};

const CARROT = { id: 'l1', name: 'Carrot', url: 'https://carrot.example/#download' };
const SHOP = { id: 'l2', name: 'Shop', url: 'https://shop.example/app' };

describe('MiniAppSettingsItem', () => {
    beforeEach(() => {
        env.scope = 'anyHttps';
        env.activeCloudId = 'c1';
        env.c2Kind = 'invited';
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

        expect(screen.queryByText('Mini apps')).toBeNull();
    });

    it('is absent in the Default Cloud, which has no owner and no mini apps', async () => {
        env.activeCloudId = 'default';
        await renderItem();

        expect(screen.queryByText('Mini apps')).toBeNull();
    });

    it('gives everyone one way in, the hub, and the owner alone the list to manage', async () => {
        storeLinks('c1', [CARROT, SHOP]);
        storeLinks('c2', [CARROT, SHOP]);
        await renderItem();

        expect(hubButton().textContent).toContain('Choose one of the 2 on the mini app home.');
        expect(screen.getByRole('button', { name: /Carrot.*carrot\.example · Edit/ })).toBeTruthy();
        expect(screen.getByRole('button', { name: /Shop.*shop\.example · Edit/ })).toBeTruthy();
        expect(addButton()).not.toBeNull();
        cleanup();

        env.activeCloudId = 'c2';
        await renderItem();
        expect(hubButton()).toBeTruthy();
        expect(screen.queryByRole('button', { name: /Carrot/ })).toBeNull();
        expect(addButton()).toBeNull();
    });

    it('says the hub holds the one mini app a cloud has without counting it', async () => {
        storeLinks('c1', [CARROT]);
        await renderItem();

        expect(hubButton().textContent).toContain('Choose it on the mini app home.');
    });

    it("hands the hub the cloud's mini apps by name and host", async () => {
        storeLinks('c1', [CARROT, SHOP]);
        await renderItem();

        fireEvent.click(hubButton());

        await waitFor(() => expect(env.open).toHaveBeenCalledTimes(1));
        expect(env.open.mock.calls[0][0]).toBe(HUB);
        expect(env.open.mock.calls[0][1].miniApps).toEqual([
            { id: 'l1', name: 'Carrot', host: 'carrot.example' },
            { id: 'l2', name: 'Shop', host: 'shop.example' },
        ]);
    });

    it('opens the hub with who is looking, the owner flag included, while the cloud has no mini apps', async () => {
        await renderItem();

        fireEvent.click(hubButton());

        await waitFor(() => expect(env.open).toHaveBeenCalledTimes(1));
        expect(env.open).toHaveBeenCalledWith(HUB, {
            cloud: { id: 'c1', name: 'Lemon' },
            place: { id: 'p1', name: 'Studio' },
            user: { id: 'uid-c1', name: 'Ada in Studio', isOwner: true },
            miniApps: [],
        });
    });

    it('names me by the place nick my own save wrote under my account id, and tells a member nothing of ownership', async () => {
        env.activeCloudId = 'c2';
        await renderItem();

        fireEvent.click(hubButton());

        await waitFor(() => expect(env.open).toHaveBeenCalledTimes(1));
        expect(env.open).toHaveBeenCalledWith(
            HUB,
            expect.objectContaining({ user: { id: 'uid-c2', name: 'Ada, saved', isOwner: false } })
        );
    });

    it('adds a mini app only with a name and an address the shell would open, and keeps it per cloud', async () => {
        await renderItem();
        fireEvent.click(screen.getByRole('button', { name: /Add mini app/ }));

        await fillAndSave('  ', 'https://shop.example/app');
        expect(await screen.findByText('Enter a name.')).toBeTruthy();
        await fillAndSave('Shop', 'https://shop.example:8443/');
        expect(await screen.findByText('Enter an https address without a port or sign-in part.')).toBeTruthy();
        await fillAndSave('Hub page', 'https://apps.chatic.io/other');
        expect(
            await screen.findByText('The mini app home opens from its own row. Enter another address.')
        ).toBeTruthy();
        expect(window.localStorage.getItem('dou.miniAppLinks.c1')).toBeNull();

        await fillAndSave(' Shop ', 'https://shop.example/app');
        await waitFor(() => expect(nameInput()).toBeNull());
        expect(storedLinks('c1')).toEqual([{ id: expect.any(String), name: 'Shop', url: 'https://shop.example/app' }]);

        fireEvent.click(screen.getByRole('button', { name: /Add mini app/ }));
        await fillAndSave('Carrot', CARROT.url);
        await waitFor(() => expect(storedLinks('c1').map(link => link.name)).toEqual(['Shop', 'Carrot']));
        cleanup();

        env.activeCloudId = 'c2';
        await renderItem();
        expect(screen.queryByText('shop.example')).toBeNull();
    });

    it('edits and removes a saved mini app', async () => {
        storeLinks('c1', [CARROT, SHOP]);
        await renderItem();

        fireEvent.click(screen.getByRole('button', { name: /Carrot/ }));
        expect(((await screen.findByLabelText('Name')) as HTMLInputElement).value).toBe('Carrot');
        await fillAndSave('Carrot app', CARROT.url);
        await waitFor(() => expect(storedLinks('c1')).toEqual([{ ...CARROT, name: 'Carrot app' }, SHOP]));

        fireEvent.click(screen.getByRole('button', { name: /Shop/ }));
        fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
        await waitFor(() => expect(storedLinks('c1')).toEqual([{ ...CARROT, name: 'Carrot app' }]));
        expect(screen.queryByRole('button', { name: /Shop/ })).toBeNull();
    });

    it('stops offering to add once the cloud has as many mini apps as it may keep', async () => {
        storeLinks(
            'c1',
            Array.from({ length: MINI_APP_LINK_LIMIT }, (_, i) => ({ id: `l${i}`, name: `App ${i}`, url: CARROT.url }))
        );
        await renderItem();

        expect(screen.getAllByRole('button', { name: /^App \d+/ })).toHaveLength(MINI_APP_LINK_LIMIT);
        expect(addButton()).toBeNull();
    });

    it('says so when this computer will not keep the mini app', async () => {
        await renderItem();
        fireEvent.click(screen.getByRole('button', { name: /Add mini app/ }));
        const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('QuotaExceededError');
        });

        await fillAndSave('Shop', 'https://shop.example/app');

        expect(await screen.findByText("Couldn't save on this computer.")).toBeTruthy();
        setItem.mockRestore();
    });

    it('opens the mini app the hub hands back, asking first before a site DoU does not run gets the names', async () => {
        storeLinks('c2', [SHOP]);
        env.activeCloudId = 'c2';
        // Another account agreed on this computer: that is not my consent.
        window.localStorage.setItem('dou.miniAppConsent.uid-other.shop.example', '1');
        await renderItem();
        const chooseShopInHub = async (times: number) => {
            fireEvent.click(hubButton());
            await waitFor(() => expect(env.open).toHaveBeenCalledTimes(times));
            hubCloses({ action: 'openMiniApp', id: 'l2' });
        };

        await chooseShopInHub(1);
        expect(await screen.findByText('Open a site outside DoU?')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        await waitFor(() => expect(screen.queryByText('Open a site outside DoU?')).toBeNull());
        expect(env.open).toHaveBeenCalledTimes(1);

        await chooseShopInHub(2);
        fireEvent.click(await screen.findByRole('button', { name: 'Open' }));
        await waitFor(() => expect(env.open).toHaveBeenCalledTimes(3));
        expect(env.open.mock.calls[2][0]).toBe('https://shop.example/app');
        // Neither the owner flag nor the cloud's other mini apps reach a site DoU does not run.
        expect(env.open.mock.calls[2][1]).toEqual({
            cloud: { id: 'c2', name: 'Friends' },
            place: { id: 'p1', name: 'Studio' },
            user: { id: 'uid-c2', name: 'Ada, saved' },
        });
        expect(window.localStorage.getItem('dou.miniAppConsent.uid-session.shop.example')).toBe('1');

        await chooseShopInHub(4);
        await waitFor(() => expect(env.open).toHaveBeenCalledTimes(5));
        expect(screen.queryByText('Open a site outside DoU?')).toBeNull();
    });

    it('opens nothing for an id the list does not hold, nor for a second result from a hub already closed', async () => {
        storeLinks('c1', [SHOP]);
        await renderItem();
        fireEvent.click(hubButton());
        await waitFor(() => expect(env.open).toHaveBeenCalledTimes(1));

        hubCloses({ action: 'openMiniApp', id: 'gone' });
        hubCloses({ action: 'openMiniApp', id: 'l2' });

        await act(async () => undefined);
        expect(env.open).toHaveBeenCalledTimes(1);
        expect(screen.queryByText('Open a site outside DoU?')).toBeNull();
    });

    it('sends one request for a double press', async () => {
        let resolve: (viewId: string) => void = () => undefined;
        env.open.mockReturnValue(new Promise<string>(r => (resolve = r)));
        await renderItem();

        fireEvent.click(hubButton());
        fireEvent.click(hubButton());
        await act(async () => resolve('view-1'));

        expect(env.open).toHaveBeenCalledTimes(1);
    });

    it('tells the user when the shell refuses to open it', async () => {
        env.open.mockRejectedValue(new Error('ALREADY_OPEN'));
        await renderItem();

        fireEvent.click(hubButton());

        await waitFor(() =>
            expect(env.toastFailure).toHaveBeenCalledWith("Couldn't open the mini app.", expect.any(Error))
        );
    });

    it('opens nothing, and says so, while the session has no id in this cloud, never sending another cloud’s', async () => {
        env.noUid = true;
        await renderItem();

        fireEvent.click(hubButton());

        expect(env.open).not.toHaveBeenCalled();
        expect(env.toastFailure).toHaveBeenCalledWith("Couldn't open the mini app.", null);
    });

    it('keeps a hub result a member received from opening the dialog after a switch to an owned cloud', async () => {
        env.activeCloudId = 'c2';
        const { rerender } = await renderItem();
        fireEvent.click(hubButton());
        await waitFor(() => expect(env.open).toHaveBeenCalled());
        act(() => env.closed?.({ viewId: 'view-1', reason: 'page', result: { action: 'openMiniAppLinkSettings' } }));

        env.activeCloudId = 'c1';
        rerender(<MiniAppSettingsItem />);
        await act(async () => undefined);

        expect(addButton()).not.toBeNull();
        expect(nameInput()).toBeNull();
    });

    it("drops a member's request to add, so becoming the owner later opens no dialog", async () => {
        env.activeCloudId = 'c2';
        const { rerender } = await renderItem();
        fireEvent.click(hubButton());
        await waitFor(() => expect(env.open).toHaveBeenCalled());
        hubCloses({ action: 'openMiniAppLinkSettings' });

        env.c2Kind = 'owned';
        rerender(<MiniAppSettingsItem />);
        await act(async () => undefined);

        expect(addButton()).not.toBeNull();
        expect(nameInput()).toBeNull();
    });

    it('ignores a hub that closes after a switch, though the new cloud lists the id it names', async () => {
        storeLinks('c1', [SHOP]);
        storeLinks('c2', [SHOP]);
        window.localStorage.setItem('dou.miniAppConsent.uid-session.shop.example', '1');
        const { rerender } = await renderItem();
        fireEvent.click(hubButton());
        await waitFor(() => expect(env.open).toHaveBeenCalledTimes(1));

        env.activeCloudId = 'c2';
        rerender(<MiniAppSettingsItem />);
        await act(async () => undefined);
        hubCloses({ action: 'openMiniApp', id: 'l2' });
        await act(async () => undefined);

        expect(env.open).toHaveBeenCalledTimes(1);
    });

    it("drops a consent still waiting when the cloud changes, so agreeing never sends the new cloud's names", async () => {
        storeLinks('c2', [SHOP]);
        env.activeCloudId = 'c2';
        const { rerender } = await renderItem();
        fireEvent.click(hubButton());
        await waitFor(() => expect(env.open).toHaveBeenCalledTimes(1));
        hubCloses({ action: 'openMiniApp', id: 'l2' });
        expect(await screen.findByText('Open a site outside DoU?')).toBeTruthy();

        env.activeCloudId = 'c1';
        rerender(<MiniAppSettingsItem />);
        await act(async () => undefined);

        await waitFor(() => expect(screen.queryByText('Open a site outside DoU?')).toBeNull());
        expect(env.open).toHaveBeenCalledTimes(1);
    });

    it('takes the owner to adding a mini app when the hub asks, and no one else', async () => {
        await renderItem();
        fireEvent.click(hubButton());
        await waitFor(() => expect(env.open).toHaveBeenCalled());

        act(() => env.closed?.({ viewId: 'other', reason: 'page', result: { action: 'openMiniAppLinkSettings' } }));
        expect(nameInput()).toBeNull();
        act(() => env.closed?.({ viewId: 'view-1', reason: 'page', result: { action: 'openMiniAppLinkSettings' } }));
        expect(await screen.findByLabelText('Name')).toBeTruthy();
        expect(screen.getByRole('heading', { name: 'Add mini app' })).toBeTruthy();
        cleanup();

        env.activeCloudId = 'c2';
        await renderItem();
        fireEvent.click(hubButton());
        await waitFor(() => expect(env.open).toHaveBeenCalledTimes(2));
        act(() => env.closed?.({ viewId: 'view-1', reason: 'page', result: { action: 'openMiniAppLinkSettings' } }));
        expect(nameInput()).toBeNull();
    });
});
