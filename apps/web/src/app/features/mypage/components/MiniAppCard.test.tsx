import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { MiniAppCard } from './MiniAppCard';

/**
 * The Lab's mini app card: a cloud's owner saves a link for the cloud, and anyone in it opens that
 * link — or DoU's hub until there is one — with who is looking. A site DoU does not run is opened only
 * after the user agreed to hand it their names, and the hub can send an owner back to the link setting.
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
        t: (key: string, values?: Record<string, string>) => (values?.host ? `${key}:${values.host}` : key),
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

const openRow = () => screen.getByRole('button', { name: /^mypage\.lab\.miniApp\.open / });
const linkRow = () => screen.queryByRole('button', { name: /^mypage\.lab\.miniApp\.link / });

const saveLink = async (value: string) => {
    const row = linkRow();
    if (!row) throw new Error('no link setting row');
    fireEvent.click(row);
    const input = await screen.findByLabelText('mypage.lab.miniApp.linkLabel');
    fireEvent.change(input, { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'mypage.lab.miniApp.save' }));
};

const closeView = (viewId: string, result?: unknown) =>
    act(() => {
        mockClosedHandler?.({ type: 'OnSubWebViewClosed', success: true, data: { viewId, reason: 'page', result } });
    });

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
    mockOpenSubWebView.mockResolvedValue({ via: 'subWebView', viewId: 'view-1' });
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

    it('is absent on the relay home, which has no owner and no link', () => {
        mockSelection = { selectedCloudId: 'default', selectedSiteId: 'p1' };
        render(<MiniAppCard />);

        expect(screen.queryByRole('region', { name: 'mypage.lab.miniApp.title' })).toBeNull();
    });

    it('shows to the owner with the link setting', () => {
        render(<MiniAppCard />);

        expect(openRow()).toBeTruthy();
        expect(linkRow()).toBeTruthy();
    });

    // Both lists load after the first render; until the owned catalog names the cloud, it is not mine.
    it('shows no link setting, and tells the hub I am no owner, before the catalog has answered', async () => {
        mockOwned = [];
        render(<MiniAppCard />);

        expect(linkRow()).toBeNull();
        fireEvent.click(openRow());
        await waitFor(() => expect(mockOpenSubWebView).toHaveBeenCalledTimes(1));
        expect(mockOpenSubWebView.mock.calls[0][0].params.user.isOwner).toBe(false);
    });

    it('shows no link setting in a cloud I was invited to', () => {
        mockInvited = [{ id: 'c1' }];
        mockOwned = [];
        render(<MiniAppCard />);

        expect(openRow()).toBeTruthy();
        expect(linkRow()).toBeNull();
    });
});

describe('MiniAppCard — opening', () => {
    it('opens the hub when the cloud has no link, telling it that I own the cloud', async () => {
        render(<MiniAppCard />);

        fireEvent.click(openRow());

        await waitFor(() => expect(mockOpenSubWebView).toHaveBeenCalledTimes(1));
        expect(mockOpenSubWebView).toHaveBeenCalledWith({
            url: HUB,
            params: {
                cloud: { id: 'c1', name: 'Team' },
                place: { id: 'p1', name: 'Studio' },
                user: { id: 'uid-c1', name: 'Kimmy', isOwner: true },
            },
        });
    });

    it('tells the hub I do not own a cloud I was invited to', async () => {
        mockInvited = [{ id: 'c1', name: 'Team' }];
        mockOwned = [];
        render(<MiniAppCard />);

        fireEvent.click(openRow());

        await waitFor(() => expect(mockOpenSubWebView).toHaveBeenCalledTimes(1));
        expect(mockOpenSubWebView.mock.calls[0][0].params.user.isOwner).toBe(false);
    });

    it('saves the link under the cloud, and opens it without isOwner once I agree to the site', async () => {
        render(<MiniAppCard />);
        await saveLink('https://shop.example/app');

        await waitFor(() => expect(window.localStorage.getItem('dou.miniAppLink.c1')).toBe('https://shop.example/app'));

        fireEvent.click(openRow());
        expect(await screen.findByText('mypage.lab.miniApp.consentBody:shop.example')).toBeTruthy();
        expect(mockOpenSubWebView).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'mypage.lab.miniApp.consentAgree' }));

        await waitFor(() => expect(mockOpenSubWebView).toHaveBeenCalledTimes(1));
        const { url, params } = mockOpenSubWebView.mock.calls[0][0];
        expect(url).toBe('https://shop.example/app');
        expect(params.user).toEqual({ id: 'uid-c1', name: 'Kimmy' });
        expect(window.localStorage.getItem('dou.miniAppConsent.acct-1.shop.example')).toBe('1');
    });

    it('does not open a site I declined, and does not ask again for one I agreed to', async () => {
        window.localStorage.setItem('dou.miniAppLink.c1', 'https://shop.example/app');
        render(<MiniAppCard />);

        fireEvent.click(openRow());
        fireEvent.click(await screen.findByRole('button', { name: 'common.cancel' }));
        await act(async () => undefined);
        expect(mockOpenSubWebView).not.toHaveBeenCalled();

        window.localStorage.setItem('dou.miniAppConsent.acct-1.shop.example', '1');
        fireEvent.click(openRow());

        await waitFor(() => expect(mockOpenSubWebView).toHaveBeenCalledTimes(1));
    });

    it("keeps one cloud's link out of another", () => {
        window.localStorage.setItem('dou.miniAppLink.c1', 'https://shop.example/app');
        mockSelection = { selectedCloudId: 'c2', selectedSiteId: 'p1' };
        render(<MiniAppCard />);

        expect(openRow().textContent).not.toContain('shop.example');
    });

    it('sends one request for a double press', async () => {
        let answer: (value: unknown) => void = () => undefined;
        mockOpenSubWebView.mockReturnValue(new Promise(resolve => (answer = resolve)));
        render(<MiniAppCard />);

        fireEvent.click(openRow());
        fireEvent.click(openRow());
        await act(async () => answer({ via: 'subWebView', viewId: 'view-1' }));

        expect(mockOpenSubWebView).toHaveBeenCalledTimes(1);
    });

    it('says so when the app could only hand the page to the OS browser', async () => {
        mockOpenSubWebView.mockResolvedValue({ via: 'external' });
        render(<MiniAppCard />);

        fireEvent.click(openRow());

        await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));
    });
});

describe('MiniAppCard — the link setting', () => {
    it('refuses an address the shell would not open', async () => {
        render(<MiniAppCard />);
        await saveLink('https://shop.example:8443/');

        expect(await screen.findByText('mypage.lab.miniApp.linkInvalid')).toBeTruthy();
        expect(window.localStorage.getItem('dou.miniAppLink.c1')).toBeNull();
    });

    it('says so when the device would not keep the link', async () => {
        const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('quota');
        });
        render(<MiniAppCard />);
        await saveLink('https://shop.example/app');

        expect(await screen.findByText('mypage.lab.miniApp.linkSaveFailed')).toBeTruthy();
        setItem.mockRestore();
    });

    it('opens the link setting when the hub hands an owner back to it', async () => {
        render(<MiniAppCard />);
        fireEvent.click(openRow());
        await waitFor(() => expect(mockOpenSubWebView).toHaveBeenCalledTimes(1));

        closeView('view-1', { action: 'openMiniAppLinkSettings' });

        expect(await screen.findByLabelText('mypage.lab.miniApp.linkLabel')).toBeTruthy();
    });

    it('opens nothing for someone who does not own the cloud', async () => {
        mockInvited = [{ id: 'c1' }];
        mockOwned = [];
        render(<MiniAppCard />);
        fireEvent.click(openRow());
        await waitFor(() => expect(mockOpenSubWebView).toHaveBeenCalledTimes(1));

        closeView('view-1', { action: 'openMiniAppLinkSettings' });

        expect(screen.queryByLabelText('mypage.lab.miniApp.linkLabel')).toBeNull();
    });

    it('ignores the same result from a site that is not the hub', async () => {
        window.localStorage.setItem('dou.miniAppLink.c1', 'https://shop.example/app');
        window.localStorage.setItem('dou.miniAppConsent.acct-1.shop.example', '1');
        render(<MiniAppCard />);
        fireEvent.click(openRow());
        await waitFor(() => expect(mockOpenSubWebView).toHaveBeenCalledTimes(1));

        closeView('view-1', { action: 'openMiniAppLinkSettings' });

        expect(screen.queryByLabelText('mypage.lab.miniApp.linkLabel')).toBeNull();
    });
});
