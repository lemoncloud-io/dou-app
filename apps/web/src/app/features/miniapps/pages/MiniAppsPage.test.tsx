import '@testing-library/jest-dom';

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';

import { miniApp, renderAt } from '../testing/setup';
import { MiniAppsPage } from './MiniAppsPage';

import type { DomainMiniApp } from '@chatic/runtime-react';

const mockOpenSubWebView = jest.fn();
const mockToast = jest.fn();
const mockNavigate = jest.fn();
let mockSelection = { selectedCloudId: 'c1', selectedSiteId: 'p1' };
let mockOwned: { id: string; name?: string }[] = [];
let mockInvited: { id: string; name?: string }[] = [];
let mockClosedHandler: ((closed: unknown) => void) | undefined;
const mockRepo = {
    listMiniApps: jest.fn(),
    addMiniApp: jest.fn(),
    updateMiniApp: jest.fn(),
    removeMiniApp: jest.fn(),
};

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, values?: Record<string, unknown>) => (values?.name ? `${key}:${values.name}` : key),
    }),
}));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock('@chatic/shared', () => ({
    ...jest.requireActual('@chatic/shared'),
    useNavigateWithTransition: () => mockNavigate,
}));
jest.mock('@chatic/runtime-react', () =>
    require('@chatic/runtime-react/testing').fakeRuntimeModule({
        session: {
            useSessionSelection: () => mockSelection,
            useUidInCloud: (cloudId: string) => (cloudId ? `uid-${cloudId}` : null),
            useSessionIdentity: () => ({ userId: 'acct-1' }),
            useRuntimeProfile: () => ({ userName: 'Kim' }),
        },
        data: { useRuntimeRepositories: () => ({ cloud: mockRepo }) },
        links: {
            subWebView: {
                onClosed: (listener: (closed: unknown) => void) => {
                    mockClosedHandler = listener;
                    return () => {
                        if (mockClosedHandler === listener) mockClosedHandler = undefined;
                    };
                },
            },
        },
    })
);
jest.mock('../../../hooks', () => ({
    useInvitedClouds: () => ({ invitedClouds: mockInvited }),
    useActiveCloudPlaces: () => ({ places: [{ id: 'p1', name: 'Studio' }], isLoading: false }),
    useMyProfile: () => ({ profile: { nick: 'Kimmy' } }),
}));
jest.mock('../../../hooks/useCloudCatalog', () => ({
    useCloudSessionCatalog: () => ({ clouds: mockOwned, hasCloudCatalog: true }),
}));
jest.mock('../../../bridge/subWebView', () => ({
    openSubWebView: (...args: unknown[]) => mockOpenSubWebView(...args),
}));
jest.mock('../../../utils/buildEnv', () => ({ isDevBuild: () => false }));

const HUB = 'https://apps.chatic.io/';
const ON = miniApp('shop');
const REVIEWED = miniApp('raise', { url: 'https://raise.apps.chatic.io/' });
const OFF = miniApp('lunch', { enabled: false, status: 'inactive' });
const HELD = miniApp('coupon', { status: 'held' });

const row = (name: string) => screen.queryByRole('button', { name: new RegExp(`${name}`) });
const listed = () =>
    Array.from(document.querySelectorAll('[data-mini-app-id]')).map(node => node.getAttribute('data-mini-app-id'));

const show = async (apps: DomainMiniApp[]) => {
    mockRepo.listMiniApps.mockResolvedValue(apps);
    const view = renderAt(<MiniAppsPage />, '/miniapps');
    await waitFor(() => expect(screen.queryByLabelText('miniApps.state.loading')).toBeNull());
    return view;
};

const asOwner = () => {
    mockOwned = [{ id: 'c1', name: 'Team' }];
    mockInvited = [];
};

beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    mockSelection = { selectedCloudId: 'c1', selectedSiteId: 'p1' };
    mockOwned = [];
    mockInvited = [{ id: 'c1', name: 'Team' }];
    mockClosedHandler = undefined;
    let views = 0;
    mockOpenSubWebView.mockImplementation(async () => ({ via: 'subWebView', viewId: `view-${++views}` }));
});

describe('MiniAppsPage — who sees what', () => {
    it("shows a member the cloud's active mini apps only, without chips or the manage button", async () => {
        await show([ON, OFF, HELD, REVIEWED]);

        expect(listed()).toEqual(['shop', 'raise']);
        expect(screen.queryByText('miniApps.chip.inactive')).toBeNull();
        expect(screen.queryByRole('button', { name: 'miniApps.manage' })).toBeNull();
        expect(mockRepo.listMiniApps).toHaveBeenCalledWith('c1');
    });

    it('shows the owner every mini app in the relay order, the hidden ones marked off or on hold', async () => {
        asOwner();
        await show([ON, OFF, HELD]);

        expect(listed()).toEqual(['shop', 'lunch', 'coupon']);
        expect(within(row('Lunch') as HTMLElement).getByText('miniApps.chip.inactive')).toBeTruthy();
        expect(within(row('Coupon') as HTMLElement).getByText('miniApps.chip.held')).toBeTruthy();
        expect(within(row('Shop') as HTMLElement).queryByText(/miniApps\.chip/)).toBeNull();
        expect(screen.getByText('miniApps.ownerNote')).toBeTruthy();
    });

    it('takes the owner to the management screen from the header', async () => {
        asOwner();
        await show([ON]);

        fireEvent.click(screen.getByRole('button', { name: 'miniApps.manage' }));

        expect(mockNavigate).toHaveBeenCalledWith('/miniapps/manage');
    });
});

describe('MiniAppsPage — pressing a row', () => {
    it('opens an active mini app', async () => {
        await show([REVIEWED]);

        fireEvent.click(row('Raise') as HTMLElement);

        await waitFor(() => expect(mockOpenSubWebView).toHaveBeenCalledTimes(1));
        expect(mockOpenSubWebView.mock.calls[0][0].url).toBe('https://raise.apps.chatic.io/');
    });

    it.each([
        ['off', OFF, 'Lunch'],
        ['on hold', HELD, 'Coupon'],
    ])("opens the owner's sheet for a mini app that is %s, and opens nothing", async (_label, app, name) => {
        asOwner();
        await show([app]);

        fireEvent.click(row(name) as HTMLElement);

        expect(await screen.findByText('miniApps.sheet.editTitle')).toBeTruthy();
        expect(screen.getByLabelText('miniApps.sheet.nameLabel')).toHaveProperty('value', name);
        expect(mockOpenSubWebView).not.toHaveBeenCalled();
    });
});

describe('MiniAppsPage — the hub', () => {
    it('hands the hub the active mini apps only', async () => {
        asOwner();
        await show([ON, OFF, HELD, REVIEWED]);

        fireEvent.click(screen.getByRole('button', { name: /miniApps\.hub\.title/ }));

        await waitFor(() => expect(mockOpenSubWebView).toHaveBeenCalledTimes(1));
        const { url, params } = mockOpenSubWebView.mock.calls[0][0];
        expect(url).toBe(HUB);
        expect(params.miniApps).toEqual([
            { id: 'shop', name: 'Shop', host: 'shop.example' },
            { id: 'raise', name: 'Raise', host: 'raise.apps.chatic.io' },
        ]);
    });

    it('opens the mini app the hub hands back only when it is in the active list', async () => {
        asOwner();
        await show([REVIEWED, OFF]);
        fireEvent.click(screen.getByRole('button', { name: /miniApps\.hub\.title/ }));
        await waitFor(() => expect(mockOpenSubWebView).toHaveBeenCalledTimes(1));

        act(() =>
            mockClosedHandler?.({ viewId: 'view-1', reason: 'page', result: { action: 'openMiniApp', id: 'lunch' } })
        );
        expect(mockOpenSubWebView).toHaveBeenCalledTimes(1);
        expect(screen.queryByText(/miniApps\.consent\.title/)).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: /miniApps\.hub\.title/ }));
        await waitFor(() => expect(mockOpenSubWebView).toHaveBeenCalledTimes(2));
        act(() =>
            mockClosedHandler?.({ viewId: 'view-2', reason: 'page', result: { action: 'openMiniApp', id: 'raise' } })
        );
        await waitFor(() => expect(mockOpenSubWebView).toHaveBeenCalledTimes(3));
        expect(mockOpenSubWebView.mock.calls[2][0].url).toBe('https://raise.apps.chatic.io/');
    });

    it("sends the owner to the management screen's add sheet when the hub asks to add one", async () => {
        asOwner();
        await show([ON]);
        fireEvent.click(screen.getByRole('button', { name: /miniApps\.hub\.title/ }));
        await waitFor(() => expect(mockOpenSubWebView).toHaveBeenCalledTimes(1));

        act(() =>
            mockClosedHandler?.({ viewId: 'view-1', reason: 'page', result: { action: 'openMiniAppLinkSettings' } })
        );

        expect(mockNavigate).toHaveBeenCalledWith('/miniapps/manage', { state: { add: true } });
    });
});

describe('MiniAppsPage — the first open of a site DoU does not run', () => {
    it("asks first, naming the mini app, and remembers the yes under the Lab card's key", async () => {
        await show([ON]);

        fireEvent.click(row('Shop') as HTMLElement);

        expect(await screen.findByText('miniApps.consent.title:Shop')).toBeTruthy();
        expect(screen.getByText('miniApps.consent.body')).toBeTruthy();
        expect(mockOpenSubWebView).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'miniApps.consent.open' }));

        await waitFor(() => expect(mockOpenSubWebView).toHaveBeenCalledTimes(1));
        expect(window.localStorage.getItem('dou.miniAppConsent.acct-1.shop.example')).toBe('1');
    });

    it('does not ask again for a host already agreed to, in the Lab or here', async () => {
        window.localStorage.setItem('dou.miniAppConsent.acct-1.shop.example', '1');
        await show([ON]);

        fireEvent.click(row('Shop') as HTMLElement);

        await waitFor(() => expect(mockOpenSubWebView).toHaveBeenCalledTimes(1));
        expect(screen.queryByText('miniApps.consent.title:Shop')).toBeNull();
    });

    it("drops a waiting question, and the previous cloud's rows, when the cloud changes", async () => {
        mockInvited = [
            { id: 'c1', name: 'Team' },
            { id: 'c2', name: 'Other' },
        ];
        mockRepo.listMiniApps.mockImplementation(async (cloudId: string) =>
            cloudId === 'c1' ? [ON] : [miniApp('poll')]
        );
        const view = renderAt(<MiniAppsPage />, '/miniapps');
        fireEvent.click(await screen.findByRole('button', { name: /Shop/ }));
        expect(await screen.findByText('miniApps.consent.title:Shop')).toBeTruthy();

        mockSelection = { selectedCloudId: 'c2', selectedSiteId: 'p2' };
        view.rerenderWith(<MiniAppsPage />);

        expect(listed()).not.toContain('shop');
        await waitFor(() => expect(screen.queryByText('miniApps.consent.title:Shop')).toBeNull());
        expect(await screen.findByRole('button', { name: /Poll/ })).toBeTruthy();
        expect(mockOpenSubWebView).not.toHaveBeenCalled();
    });
});

describe('MiniAppsPage — states', () => {
    it('shows two placeholder rows while the list loads', async () => {
        mockRepo.listMiniApps.mockReturnValue(new Promise(() => undefined));
        renderAt(<MiniAppsPage />, '/miniapps');

        const loading = await screen.findByLabelText('miniApps.state.loading');
        expect(loading.querySelectorAll('li')).toHaveLength(2);
    });

    it('says the list could not be read, and reads it again on retry', async () => {
        mockRepo.listMiniApps.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([ON]);
        renderAt(<MiniAppsPage />, '/miniapps');

        fireEvent.click(await screen.findByRole('button', { name: 'miniApps.state.retry' }));

        expect(await screen.findByRole('button', { name: /Shop/ })).toBeTruthy();
        expect(mockRepo.listMiniApps).toHaveBeenCalledTimes(2);
    });

    it('tells a member of an empty cloud that its owner adds them', async () => {
        await show([OFF]);

        expect(screen.getByText('miniApps.state.emptyMember.title')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'miniApps.add' })).toBeNull();
    });

    it('offers the owner of an empty cloud to add the first one', async () => {
        asOwner();
        await show([]);

        expect(screen.getByText('miniApps.state.emptyOwner.title')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'miniApps.add' }));
        expect(await screen.findByText('miniApps.sheet.addTitle')).toBeTruthy();
    });

    it("shows the Default Cloud a member's empty list, and asks the relay nothing", async () => {
        mockSelection = { selectedCloudId: 'default', selectedSiteId: 'p1' };
        renderAt(<MiniAppsPage />, '/miniapps');

        expect(await screen.findByText('miniApps.state.emptyMember.title')).toBeTruthy();
        expect(mockRepo.listMiniApps).not.toHaveBeenCalled();
    });
});

describe('MiniAppsPage — switching clouds', () => {
    beforeEach(() => {
        mockOwned = [
            { id: 'c1', name: 'Team' },
            { id: 'c2', name: 'Other' },
        ];
        mockInvited = [];
        mockRepo.listMiniApps.mockImplementation(async (cloudId: string) => (cloudId === 'c1' ? [OFF] : []));
    });

    it("closes an open sheet, so it cannot save into the previous cloud's list", async () => {
        const view = renderAt(<MiniAppsPage />, '/miniapps');
        fireEvent.click(await screen.findByRole('button', { name: /Lunch/ }));
        expect(await screen.findByText('miniApps.sheet.editTitle')).toBeTruthy();

        mockSelection = { selectedCloudId: 'c2', selectedSiteId: 'p2' };
        view.rerenderWith(<MiniAppsPage />);

        await waitFor(() => expect(screen.queryByLabelText('miniApps.sheet.nameLabel')).toBeNull());
    });

    it('ignores what a hub opened in the previous cloud hands back', async () => {
        mockRepo.listMiniApps.mockImplementation(async (cloudId: string) => (cloudId === 'c1' ? [REVIEWED] : []));
        const view = renderAt(<MiniAppsPage />, '/miniapps');
        await screen.findByRole('button', { name: /Raise/ });
        fireEvent.click(screen.getByRole('button', { name: /miniApps\.hub\.title/ }));
        await waitFor(() => expect(mockOpenSubWebView).toHaveBeenCalledTimes(1));

        mockSelection = { selectedCloudId: 'c2', selectedSiteId: 'p2' };
        view.rerenderWith(<MiniAppsPage />);
        act(() =>
            mockClosedHandler?.({ viewId: 'view-1', reason: 'page', result: { action: 'openMiniApp', id: 'raise' } })
        );
        act(() =>
            mockClosedHandler?.({ viewId: 'view-1', reason: 'page', result: { action: 'openMiniAppLinkSettings' } })
        );

        expect(mockOpenSubWebView).toHaveBeenCalledTimes(1);
        expect(mockNavigate).not.toHaveBeenCalled();
    });
});
