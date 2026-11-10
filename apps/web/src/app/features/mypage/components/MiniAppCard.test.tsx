import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { MiniAppCard } from './MiniAppCard';

/**
 * The Lab's mini app card: the hub is the way in for everyone — it lists the cloud's mini apps and hands
 * back the one chosen — and a cloud's owner keeps that list here. A site DoU does not run is opened only
 * after the user agreed to hand it their names, and the hub can send an owner to adding one.
 */

const mockOpenSubWebView = jest.fn();
const mockToast = jest.fn();
let mockScope: string | null = 'anyHttps';
let mockSelection = { selectedCloudId: 'c1', selectedSiteId: 'p1' };
let mockInvited: { id: string; cid?: string; name?: string }[] = [];
let mockOwned: { id: string; name?: string }[] = [];
let mockClosedHandler: ((message: unknown) => void) | undefined;

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, values?: Record<string, string>) => {
            const detail = values?.host ?? values?.name;
            return detail ? `${key}:${detail}` : key;
        },
    }),
}));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
// The real sheet, dialog and field; the card and its rows as plain markup the queries can read.
jest.mock('@chatic/web-ui-kit', () => ({
    ...jest.requireActual('@chatic/web-ui-kit'),
    IconChevronRight: () => null,
    MenuCard: ({ title, children }: { title?: string; children: React.ReactNode }) => (
        <section aria-label={title}>{children}</section>
    ),
    ListRow: ({ title, subtitle, onClick }: { title: string; subtitle?: string; onClick?: () => void }) => (
        <button type="button" onClick={onClick}>
            {title} {subtitle}
        </button>
    ),
}));
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSessionSelection: () => mockSelection,
            useUidInCloud: (cloudId: string) => (cloudId ? `uid-${cloudId}` : null),
            useSessionIdentity: () => ({ userId: 'acct-1' }),
            useRuntimeProfile: () => ({ userName: 'Kim' }),
        },
    },
}));
jest.mock('../../../hooks', () => ({
    useInvitedClouds: () => ({ invitedClouds: mockInvited }),
    useActiveCloudPlaces: () => ({ places: [{ id: 'p1', name: 'Studio' }], isLoading: false }),
    useMyProfile: () => ({ profile: { nick: 'Kimmy' } }),
}));
jest.mock('../../../hooks/useCloudCatalog', () => ({
    useCloudSessionCatalog: () => ({ clouds: mockOwned }),
}));
jest.mock('../../../bridge/subWebView', () => ({
    openSubWebView: (...args: unknown[]) => mockOpenSubWebView(...args),
}));
jest.mock('../../../bridge/useHandleAppMessage', () => ({
    useOnSubWebViewClosed: (handler: (message: unknown) => void) => {
        mockClosedHandler = handler;
    },
}));
jest.mock('../../../bridge/shellCapabilities', () => ({ useSubWebViewOpenScope: () => mockScope }));

const HUB = 'https://apps.chatic.io/';
const KEY = 'dou.miniAppLinks.c1';
const SHOP = { id: 'shop', name: 'Shop', url: 'https://shop.example/app' };
const BLOG = { id: 'blog', name: 'Blog', url: 'https://blog.example/' };

const seed = (cloudId: string, links: unknown[]) =>
    window.localStorage.setItem(`dou.miniAppLinks.${cloudId}`, JSON.stringify(links));
const stored = () => JSON.parse(window.localStorage.getItem(KEY) ?? 'null');
const agreeTo = (host: string) => window.localStorage.setItem(`dou.miniAppConsent.acct-1.${host}`, '1');

const hubRow = () => screen.getByRole('button', { name: /^mypage\.lab\.miniApp\.open / });
const queryAddRow = () => screen.queryByRole('button', { name: /^mypage\.lab\.miniApp\.add / });
const queryManageRow = (name: string) => screen.queryByRole('button', { name: new RegExp(`^${name} `) });

const fillSheet = async ({ name, url }: { name?: string; url?: string }) => {
    if (name !== undefined) {
        fireEvent.change(await screen.findByLabelText('mypage.lab.miniApp.nameLabel'), { target: { value: name } });
    }
    if (url !== undefined) {
        fireEvent.change(await screen.findByLabelText('mypage.lab.miniApp.linkLabel'), { target: { value: url } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'mypage.lab.miniApp.save' }));
};

const addMiniApp = async (name: string, url: string) => {
    const row = queryAddRow();
    if (!row) throw new Error('no add row');
    fireEvent.click(row);
    await fillSheet({ name, url });
};

const editMiniApp = (name: string) => {
    const row = queryManageRow(name);
    if (!row) throw new Error(`no manage row for ${name}`);
    fireEvent.click(row);
};

const closeView = (viewId: string, result?: unknown) =>
    act(() => {
        mockClosedHandler?.({ type: 'OnSubWebViewClosed', success: true, data: { viewId, reason: 'page', result } });
    });

/** Open the hub (the next open request), and have it close asking for `result`. */
const throughHub = async (result: unknown) => {
    const before = mockOpenSubWebView.mock.calls.length;
    fireEvent.click(hubRow());
    await waitFor(() => expect(mockOpenSubWebView).toHaveBeenCalledTimes(before + 1));
    closeView(`view-${before + 1}`, result);
};

beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    mockScope = 'anyHttps';
    mockSelection = { selectedCloudId: 'c1', selectedSiteId: 'p1' };
    mockInvited = [];
    mockOwned = [
        { id: 'c1', name: 'Team' },
        { id: 'c2', name: 'Other' },
    ];
    mockClosedHandler = undefined;
    let views = 0;
    mockOpenSubWebView.mockImplementation(async () => ({ via: 'subWebView', viewId: `view-${++views}` }));
});

describe('MiniAppCard — where it shows', () => {
    it.each([
        ['a shell that says nothing of its scope', null],
        ['a shell that opens the reviewed pages only', 'reviewed'],
    ])('is absent on %s', (_label, scope) => {
        mockScope = scope;
        render(<MiniAppCard />);

        expect(screen.queryByRole('region', { name: 'mypage.lab.miniApp.title' })).toBeNull();
    });

    it('is absent on the relay home, which has no owner and no mini apps', () => {
        mockSelection = { selectedCloudId: 'default', selectedSiteId: 'p1' };
        render(<MiniAppCard />);

        expect(screen.queryByRole('region', { name: 'mypage.lab.miniApp.title' })).toBeNull();
    });

    it("shows the owner the way in, the cloud's mini apps to manage, and a way to add one", () => {
        seed('c1', [SHOP]);
        render(<MiniAppCard />);

        expect(hubRow()).toBeTruthy();
        expect(queryManageRow('Shop')?.textContent).toContain('mypage.lab.miniApp.manageHint:shop.example');
        expect(queryAddRow()).toBeTruthy();
    });

    // Both lists load after the first render; until the owned catalog names the cloud, it is not mine.
    it('offers no managing, and tells the hub I am no owner, before the catalog has answered', async () => {
        seed('c1', [SHOP]);
        mockOwned = [];
        render(<MiniAppCard />);

        expect(queryManageRow('Shop')).toBeNull();
        expect(queryAddRow()).toBeNull();
        fireEvent.click(hubRow());
        await waitFor(() => expect(mockOpenSubWebView).toHaveBeenCalledTimes(1));
        expect(mockOpenSubWebView.mock.calls[0][0].params.user.isOwner).toBe(false);
    });

    it('shows someone invited the way in only', () => {
        seed('c1', [SHOP]);
        mockInvited = [{ id: 'c1' }];
        mockOwned = [];
        render(<MiniAppCard />);

        expect(hubRow()).toBeTruthy();
        expect(queryManageRow('Shop')).toBeNull();
        expect(queryAddRow()).toBeNull();
    });

    it('offers no more adding once the cloud has as many as it keeps', () => {
        seed(
            'c1',
            Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, name: `App ${i}`, url: `https://m${i}.example/` }))
        );
        render(<MiniAppCard />);

        expect(screen.getAllByRole('button', { name: /^App \d+ / })).toHaveLength(10);
        expect(queryAddRow()).toBeNull();
    });
});

describe('MiniAppCard — opening', () => {
    it("opens the hub with who is looking and the cloud's mini apps, never their addresses", async () => {
        seed('c1', [SHOP, BLOG]);
        render(<MiniAppCard />);

        fireEvent.click(hubRow());

        await waitFor(() => expect(mockOpenSubWebView).toHaveBeenCalledTimes(1));
        expect(mockOpenSubWebView).toHaveBeenCalledWith({
            url: HUB,
            params: {
                cloud: { id: 'c1', name: 'Team' },
                place: { id: 'p1', name: 'Studio' },
                user: { id: 'uid-c1', name: 'Kimmy', isOwner: true },
                miniApps: [
                    { id: 'shop', name: 'Shop', host: 'shop.example' },
                    { id: 'blog', name: 'Blog', host: 'blog.example' },
                ],
            },
        });
    });

    it('tells the hub I do not own a cloud I was invited to', async () => {
        mockInvited = [{ id: 'c1', name: 'Team' }];
        mockOwned = [];
        render(<MiniAppCard />);

        fireEvent.click(hubRow());

        await waitFor(() => expect(mockOpenSubWebView).toHaveBeenCalledTimes(1));
        expect(mockOpenSubWebView.mock.calls[0][0].params.user.isOwner).toBe(false);
    });

    it('saves a mini app, and opens the one the hub hands back, without the list or isOwner, once I agree', async () => {
        render(<MiniAppCard />);
        await addMiniApp('Shop', 'https://shop.example/app');
        await waitFor(() =>
            expect(stored()).toEqual([{ id: expect.any(String), name: 'Shop', url: 'https://shop.example/app' }])
        );
        const [{ id }] = stored();

        await throughHub({ action: 'openMiniApp', id });
        expect(await screen.findByText('mypage.lab.miniApp.consentBody:shop.example')).toBeTruthy();
        expect(mockOpenSubWebView).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: 'mypage.lab.miniApp.consentAgree' }));

        await waitFor(() => expect(mockOpenSubWebView).toHaveBeenCalledTimes(2));
        const { url, params } = mockOpenSubWebView.mock.calls[1][0];
        expect(url).toBe('https://shop.example/app');
        expect(params.user).toEqual({ id: 'uid-c1', name: 'Kimmy' });
        expect(params.miniApps).toBeUndefined();
        expect(window.localStorage.getItem('dou.miniAppConsent.acct-1.shop.example')).toBe('1');
    });

    it('opens the mini app the hub chose', async () => {
        seed('c1', [SHOP, BLOG]);
        agreeTo('blog.example');
        render(<MiniAppCard />);

        await throughHub({ action: 'openMiniApp', id: 'blog' });

        await waitFor(() => expect(mockOpenSubWebView).toHaveBeenCalledTimes(2));
        expect(mockOpenSubWebView.mock.calls[1][0].url).toBe('https://blog.example/');
    });

    it('opens nothing for an id the list does not hold', async () => {
        seed('c1', [SHOP]);
        agreeTo('shop.example');
        render(<MiniAppCard />);

        await throughHub({ action: 'openMiniApp', id: 'gone' });
        await act(async () => undefined);

        expect(mockOpenSubWebView).toHaveBeenCalledTimes(1);
    });

    it('does not open a site I declined, and does not ask again for one I agreed to', async () => {
        seed('c1', [SHOP]);
        render(<MiniAppCard />);

        await throughHub({ action: 'openMiniApp', id: 'shop' });
        fireEvent.click(await screen.findByRole('button', { name: 'common.cancel' }));
        await act(async () => undefined);
        expect(mockOpenSubWebView).toHaveBeenCalledTimes(1);

        agreeTo('shop.example');
        await throughHub({ action: 'openMiniApp', id: 'shop' });

        await waitFor(() => expect(mockOpenSubWebView).toHaveBeenCalledTimes(3));
        expect(mockOpenSubWebView.mock.calls[2][0].url).toBe('https://shop.example/app');
    });

    it("keeps one cloud's mini apps out of another, also when switching while the card is shown", async () => {
        seed('c1', [SHOP]);
        const { rerender } = render(<MiniAppCard />);
        expect(queryManageRow('Shop')).toBeTruthy();

        mockSelection = { selectedCloudId: 'c2', selectedSiteId: 'p1' };
        rerender(<MiniAppCard />);

        expect(queryManageRow('Shop')).toBeNull();
        fireEvent.click(hubRow());
        await waitFor(() => expect(mockOpenSubWebView).toHaveBeenCalledTimes(1));
        expect(mockOpenSubWebView.mock.calls[0][0].params.miniApps).toEqual([]);
    });

    it('sends one request for a double press', async () => {
        let answer: (value: unknown) => void = () => undefined;
        mockOpenSubWebView.mockReturnValue(new Promise(resolve => (answer = resolve)));
        render(<MiniAppCard />);

        fireEvent.click(hubRow());
        fireEvent.click(hubRow());
        await act(async () => answer({ via: 'subWebView', viewId: 'view-1' }));

        expect(mockOpenSubWebView).toHaveBeenCalledTimes(1);
    });

    it('says so when the app could only hand the page to the OS browser', async () => {
        mockOpenSubWebView.mockResolvedValue({ via: 'external' });
        render(<MiniAppCard />);

        fireEvent.click(hubRow());

        await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));
        expect(mockToast).toHaveBeenCalledWith({ title: 'mypage.lab.miniApp.openedOutside' });
    });

    it("drops a consent question when the cloud changes, so the old cloud's site gets nothing", async () => {
        seed('c1', [SHOP]);
        const { rerender } = render(<MiniAppCard />);
        await throughHub({ action: 'openMiniApp', id: 'shop' });
        expect(await screen.findByText('mypage.lab.miniApp.consentBody:shop.example')).toBeTruthy();

        mockSelection = { selectedCloudId: 'c2', selectedSiteId: 'p1' };
        rerender(<MiniAppCard />);
        await act(async () => undefined);

        expect(screen.queryByRole('button', { name: 'mypage.lab.miniApp.consentAgree' })).toBeNull();
        expect(mockOpenSubWebView).toHaveBeenCalledTimes(1);
    });

    // The other cloud holds a mini app under the same id and is mine too, so only the cloud check stops it.
    it.each([
        ['open a mini app', { action: 'openMiniApp', id: 'shop' }],
        ['add one', { action: 'openMiniAppLinkSettings' }],
    ])('does not %s for a hub that closes after the cloud changed', async (_label, result) => {
        seed('c1', [SHOP]);
        seed('c2', [{ ...SHOP, url: 'https://other.example/' }]);
        agreeTo('shop.example');
        agreeTo('other.example');
        const { rerender } = render(<MiniAppCard />);
        fireEvent.click(hubRow());
        await waitFor(() => expect(mockOpenSubWebView).toHaveBeenCalledTimes(1));

        mockSelection = { selectedCloudId: 'c2', selectedSiteId: 'p1' };
        rerender(<MiniAppCard />);
        closeView('view-1', result);
        await act(async () => undefined);

        expect(mockOpenSubWebView).toHaveBeenCalledTimes(1);
        expect(screen.queryByLabelText('mypage.lab.miniApp.nameLabel')).toBeNull();
    });
});

describe('MiniAppCard — editing the list', () => {
    it.each([
        ['a missing name', '  ', 'https://shop.example/', 'mypage.lab.miniApp.nameMissing'],
        ['a name over the limit', 'x'.repeat(31), 'https://shop.example/', 'mypage.lab.miniApp.nameTooLong'],
        ['an address the shell would not open', 'Shop', 'https://shop.example:8443/', 'mypage.lab.miniApp.linkInvalid'],
        ['an address on the hub itself', 'Hub', 'https://apps.chatic.io/tools', 'mypage.lab.miniApp.linkIsHub'],
    ])('refuses %s', async (_label, name, url, message) => {
        render(<MiniAppCard />);
        await addMiniApp(name, url);

        expect(await screen.findByText(message)).toBeTruthy();
        expect(window.localStorage.getItem(KEY)).toBeNull();
    });

    it('says so when the device would not keep the mini app', async () => {
        const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('quota');
        });
        render(<MiniAppCard />);
        await addMiniApp('Shop', 'https://shop.example/app');

        expect(await screen.findByText('mypage.lab.miniApp.linkSaveFailed')).toBeTruthy();
        setItem.mockRestore();
    });

    it('renames a saved mini app in place', async () => {
        seed('c1', [SHOP, BLOG]);
        render(<MiniAppCard />);

        editMiniApp('Shop');
        const nameField = (await screen.findByLabelText('mypage.lab.miniApp.nameLabel')) as HTMLInputElement;
        expect(nameField.value).toBe('Shop');
        await fillSheet({ name: 'Store' });

        await waitFor(() => expect(stored()).toEqual([{ ...SHOP, name: 'Store' }, BLOG]));
    });

    it('removes a mini app', async () => {
        seed('c1', [SHOP]);
        render(<MiniAppCard />);

        editMiniApp('Shop');
        fireEvent.click(await screen.findByRole('button', { name: 'mypage.lab.miniApp.remove' }));

        await waitFor(() => expect(window.localStorage.getItem(KEY)).toBeNull());
        expect(queryManageRow('Shop')).toBeNull();
    });

    it('opens adding when the hub hands an owner back to it', async () => {
        render(<MiniAppCard />);

        await throughHub({ action: 'openMiniAppLinkSettings' });

        expect(await screen.findByLabelText('mypage.lab.miniApp.nameLabel')).toBeTruthy();
    });

    it('opens nothing for someone who does not own the cloud', async () => {
        mockInvited = [{ id: 'c1' }];
        mockOwned = [];
        render(<MiniAppCard />);

        await throughHub({ action: 'openMiniAppLinkSettings' });

        expect(screen.queryByLabelText('mypage.lab.miniApp.nameLabel')).toBeNull();
    });

    it('opens nothing later for a hub that closed before the catalog named me the owner', async () => {
        mockOwned = [];
        const { rerender } = render(<MiniAppCard />);
        await throughHub({ action: 'openMiniAppLinkSettings' });

        mockOwned = [{ id: 'c1', name: 'Team' }];
        rerender(<MiniAppCard />);

        expect(queryAddRow()).toBeTruthy();
        expect(screen.queryByLabelText('mypage.lab.miniApp.nameLabel')).toBeNull();
    });

    it('closes an open sheet when the cloud changes', async () => {
        seed('c1', [SHOP]);
        const { rerender } = render(<MiniAppCard />);
        editMiniApp('Shop');
        expect(await screen.findByLabelText('mypage.lab.miniApp.nameLabel')).toBeTruthy();

        mockSelection = { selectedCloudId: 'c2', selectedSiteId: 'p1' };
        rerender(<MiniAppCard />);

        await waitFor(() => expect(screen.queryByLabelText('mypage.lab.miniApp.nameLabel')).toBeNull());
    });

    it('starts each opening afresh, even of the same mini app', async () => {
        seed('c1', [SHOP]);
        render(<MiniAppCard />);
        editMiniApp('Shop');
        fireEvent.change(await screen.findByLabelText('mypage.lab.miniApp.nameLabel'), { target: { value: 'Typo' } });
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        await waitFor(() => expect(screen.queryByLabelText('mypage.lab.miniApp.nameLabel')).toBeNull());

        editMiniApp('Shop');

        const nameField = (await screen.findByLabelText('mypage.lab.miniApp.nameLabel')) as HTMLInputElement;
        expect(nameField.value).toBe('Shop');
    });

    it('ignores the same results from a site that is not the hub', async () => {
        seed('c1', [SHOP, BLOG]);
        agreeTo('shop.example');
        agreeTo('blog.example');
        render(<MiniAppCard />);
        await throughHub({ action: 'openMiniApp', id: 'shop' });
        await waitFor(() => expect(mockOpenSubWebView).toHaveBeenCalledTimes(2));

        closeView('view-2', { action: 'openMiniAppLinkSettings' });
        closeView('view-2', { action: 'openMiniApp', id: 'blog' });
        await act(async () => undefined);

        expect(screen.queryByLabelText('mypage.lab.miniApp.nameLabel')).toBeNull();
        expect(mockOpenSubWebView).toHaveBeenCalledTimes(2);
    });
});
