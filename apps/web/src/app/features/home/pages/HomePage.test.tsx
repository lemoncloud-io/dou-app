import '@testing-library/jest-dom';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { HomePage } from './HomePage';
import { useHomeChatTabStore } from '../stores/useHomeChatTabStore';
import { useFindMeSheetRequest } from '../../../stores/useFindMeSheetRequest';
import { ROUTES } from '../../../routes/paths';
import { MAX_PLACES } from '../../../utils';

let selectedCloudId: string | null = 'default';
let pairedCloudIds: string[] = [];
let pairedCloudNames: Record<string, string> = {};
let selectedSiteId: string | null = 'site-1';
let membership: { isValid: boolean } | undefined = { isValid: false };
let isMembershipLoading = false;
let isAuthenticated = true;
let catalog: { clouds: { id: string; status?: string }[]; hasCloudCatalog: boolean; isPendingClouds: boolean } = {
    clouds: [],
    hasCloudCatalog: true,
    isPendingClouds: false,
};
let isPlaceInviteEnabled = true;

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o ? `${k}:${JSON.stringify(o)}` : k) }),
}));
const navigateMock = jest.fn();
jest.mock('@chatic/shared', () => ({
    ...jest.requireActual('@chatic/shared'),
    useNavigateWithTransition: () => navigateMock,
    usePinnedChannels: () => ({ pinnedIds: [], toggle: jest.fn(), reorder: jest.fn() }),
}));
jest.mock('@chatic/runtime-react', () =>
    require('@chatic/runtime-react/testing').fakeRuntimeModule({
        session: {
            useRuntimeProfile: () => ({ isGuest: false }),
            useSessionAuth: () => ({ isAuthenticated }),
            useSessionSelection: () => ({ selectedCloudId, selectedSiteId }),
            usePairedCloudIds: () => pairedCloudIds,
            usePairedCloudNames: () => pairedCloudNames,
        },
        appShell: require('@chatic/runtime-react/testing').browserAppShell(),
    })
);

const refetchCloudsMock = jest.fn();
const refetchMembershipMock = jest.fn();
const requestBackgroundRefreshMock = jest.fn();
jest.mock('../../../hooks/useCloudCatalog', () => ({
    useCloudSessionCatalog: () => ({ ...catalog, refetchClouds: refetchCloudsMock }),
}));
jest.mock('../../../hooks/useMembership', () => ({
    useMembershipInfo: () => ({ data: membership, isLoading: isMembershipLoading, refetch: refetchMembershipMock }),
}));
jest.mock('../../../runtime/backgroundRefresh', () => ({
    requestBackgroundRefresh: () => requestBackgroundRefreshMock(),
}));

jest.mock('@chatic/web-ui-kit', () => ({
    AppHeader: ({
        kind,
        name,
        avatar,
        planTier,
        planLoading,
        className,
    }: {
        kind: string;
        name?: string;
        avatar?: any;
        planTier?: string;
        planLoading?: boolean;
        className?: string;
    }) => (
        <header
            data-testid="header"
            className={className}
            data-kind={kind}
            data-plan-tier={planTier ?? ''}
            data-plan-loading={String(!!planLoading)}
            data-name={name ?? ''}
        >
            {avatar}
        </header>
    ),
    EmptyState: () => <div data-testid="empty-state" />,
    IconChevronRight: () => <i />,
    ProfileAvatar: () => <img alt="" />,
    SegmentedTabs: ({ items, value, onChange, trailing, className }: any) => (
        <div data-testid="chat-tabs" data-value={value} className={className}>
            {items.map((item: any) => (
                <button
                    key={item.id}
                    data-testid={`tab-${item.id}`}
                    data-count={item.count ?? ''}
                    onClick={() => onChange(item.id)}
                />
            ))}
            {trailing}
        </div>
    ),
    PullToRefresh: ({
        children,
        onRefresh,
        onScroll,
    }: {
        children: any;
        onRefresh: () => Promise<unknown>;
        onScroll?: React.UIEventHandler<HTMLDivElement>;
    }) => (
        <div data-testid="home-scroll" onScroll={onScroll}>
            <button data-testid="pull-refresh" onClick={() => void onRefresh()} />
            {children}
        </div>
    ),
    SubscriptionBadge: ({ tier }: { tier: string }) => <span data-testid="tier-badge">{tier}</span>,
    SubscriptionBadgeSkeleton: () => <span data-testid="tier-badge-skeleton" />,
}));
jest.mock('@chatic/ui-kit/components/ui/dropdown-menu', () => ({
    DropdownMenu: ({ children }: any) => <div>{children}</div>,
    DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
    DropdownMenuItem: ({ children, disabled, onClick }: any) => (
        <button type="button" disabled={disabled} onClick={onClick}>
            {children}
        </button>
    ),
    DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
}));
const toastMock = jest.fn();
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));
jest.mock('../../../utils/buildEnv', () => ({ isDevBuild: () => false }));

jest.mock('../../../hooks', () => ({
    useActiveCloudPlaces: (...args: unknown[]) => useActiveCloudPlaces(...(args as [])),
    useMyProfile: () => ({ profile: { nick: 'me' } }),
    useUserPermissions: () => ({ canCreatePlace: true }),
    useCachedCloudNames: () => ({}),
    useChannelUnreads: () => ({ byChannel: {}, byPlace: {} }),
    useActiveCloudData: () => ({
        channels: activeCloudChannels,
        isLoaded: true,
        myJoins: new Map(),
        unreads: { byChannel: {}, byPlace: {}, total: 0 },
    }),
    useActiveCloudUnreads: () => ({ byChannel: {}, byPlace: {}, total: 0 }),
    useScopedNotifications: () => scopedNotifications,
    useHomeChannels: () => ({ channels: homeChannels, isLoading: false }),
    useInvitedClouds: () => ({ invitedClouds }),
    useJoinSyncRegistration: jest.fn(),
    useMyJoins: () => new Map(),
    useOtherCloudUnread: () => ({ byCloud: {}, total: 0 }),
    useScrollRestoration: () => ({ containerRef: { current: null }, onScroll: jest.fn() }),
    useScrollChrome: jest.requireActual('../../../hooks/useScrollChrome').useScrollChrome,
    useOnboarding: () => ({ isFirstRun: false, completeOnboarding: jest.fn() }),
    useChannelSort: () => ({ channelSort: {}, setChannelSort: jest.fn() }),
    useMenuNavigate: () => navigateMock,
    usePlaceInviteExperiment: () => ({ isEnabled: isPlaceInviteEnabled, setEnabled: jest.fn() }),
}));
jest.mock('../stores/useCloudPushMarkStore', () => ({
    useCloudPushMarkStore: (selector: (state: { badged: Record<string, true> }) => unknown) => selector({ badged: {} }),
}));
jest.mock('../../../ui/components', () => ({ BottomNavSpacer: () => <div /> }));
jest.mock('../../onboarding', () => ({ OnboardingModal: () => null }));

jest.mock('../components', () => ({
    ChannelList: ({
        channels,
        isPro,
        onCreateGroup,
        showOneOnOneCreate,
        onCreateOneOnOne,
        onCreate,
        leadsWithSelf,
        canCreate,
        emptyLabel,
        title,
        open,
        onOpenChange,
        onOpenPlaceInfo,
        bare,
    }: {
        channels?: { id: string }[];
        isPro?: boolean;
        onCreateGroup?: () => void;
        showOneOnOneCreate?: boolean;
        onCreateOneOnOne?: () => void;
        onCreate?: () => void;
        leadsWithSelf?: boolean;
        canCreate?: boolean;
        emptyLabel?: string;
        title?: string;
        open?: boolean;
        onOpenChange?: (open: boolean) => void;
        onOpenPlaceInfo?: () => void;
        bare?: boolean;
    }) => (
        <div
            data-testid={bare ? 'cloud-list' : 'channel-list'}
            data-title={title ?? ''}
            data-leads-with-self={String(!!leadsWithSelf)}
            data-can-create={String(!!canCreate)}
            data-empty-label={emptyLabel ?? ''}
            data-is-pro={String(isPro)}
            data-open={String(open)}
            data-channel-ids={(channels ?? []).map(channel => channel.id).join(',')}
        >
            {onCreateGroup && <button data-testid="create-group" onClick={onCreateGroup} />}
            {showOneOnOneCreate && onCreateOneOnOne && (
                <button data-testid="create-direct" onClick={onCreateOneOnOne} />
            )}
            {onCreate && <button data-testid="start-dm" onClick={onCreate} />}
            <button data-testid="channel-toggle" onClick={() => onOpenChange?.(!open)} />
            {onOpenPlaceInfo && <button data-testid="open-place-info" onClick={onOpenPlaceInfo} />}
        </div>
    ),
    CloudPromoBanner: ({ onAddCloud }: { onAddCloud?: () => void }) => (
        <button data-testid="promo-banner" onClick={onAddCloud} />
    ),
    CloudSessionSheet: () => null,
    CreateChannelDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="create-channel-dialog" /> : null),
    CreatePlaceDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="create-place-dialog" /> : null),
    InviteDialog: () => null,
    PlaceChipRow: ({ onCreatePlace }: { onCreatePlace: () => void }) => (
        <div data-testid="place-list">
            <button data-testid="add-place" onClick={onCreatePlace} />
        </div>
    ),
    ChannelCreateMenu: ({ onCreate, showOneOnOneCreate, onCreateOneOnOne, showGroupCreate, onCreateGroup }: any) => (
        <>
            {onCreate && <button data-testid="start-dm" onClick={onCreate} />}
            {showOneOnOneCreate && onCreateOneOnOne && <button data-testid="start-dm" onClick={onCreateOneOnOne} />}
            {showGroupCreate && onCreateGroup && <button data-testid="create-group" onClick={onCreateGroup} />}
        </>
    ),
    PlaceLimitDialog: ({
        open,
        maxPlaces,
        onManagePlaces,
        onAddCloud,
    }: {
        open: boolean;
        maxPlaces: number;
        onManagePlaces?: () => void;
        onAddCloud: () => void;
    }) =>
        open ? (
            <div data-testid="place-limit-dialog" data-max={maxPlaces} data-can-manage={!!onManagePlaces}>
                <button data-testid="limit-manage" onClick={onManagePlaces} />
                <button data-testid="limit-add-cloud" onClick={onAddCloud} />
            </div>
        ) : null,
    PlaceProfileBanner: ({ visible }: { visible: boolean }) =>
        visible ? <div data-testid="place-profile-banner" /> : null,
    SubscriptionRequiredDialog: ({ open }: { open: boolean }) =>
        open ? <div data-testid="subscription-required" /> : null,
}));
jest.mock('../components/cloud-session', () => ({ getCloudDisplayName: () => 'Cloud' }));

let places: { id: string; stereo: string; isOwner?: boolean }[] = [{ id: 'site-1', stereo: 'group' }];
let isPlacesLoading = false;
let selectedPlaceId: string | null = 'site-1';
let isSwitchingPlace = false;
let activeCloudChannels: unknown[] = [];
let scopedNotifications: unknown[] = [];
let homeChannels: unknown[] = [];
let invitedClouds: { id: string }[] = [];
const useActiveCloudPlaces = jest.fn(() => ({ places, isLoading: isPlacesLoading }));
const useSwitchPlace = jest.fn(() => ({ selectedPlaceId, switchPlace: jest.fn(), isSwitching: isSwitchingPlace }));
const requestAddCloudMock = jest.fn();
let isProfileNudgeVisible = false;
const usePlaceProfileNudge = jest.fn((_options: { nick?: string | null }) => ({
    isVisible: isProfileNudgeVisible,
    dismiss: jest.fn(),
    markPresent: jest.fn(),
}));

let collapsedSections: Record<string, true> = {};
const setSectionOpenMock = jest.fn();

jest.mock('../hooks', () => ({
    useAddCloudFlow: () => ({ requestAddCloud: requestAddCloudMock }),
    useHomeSections: () => ({ isOpen: (id: string) => !collapsedSections[id], setOpen: setSectionOpenMock }),
    useSwitchPlace: (...args: unknown[]) => useSwitchPlace(...(args as [])),
    usePlaceProfileNudge: (options: { nick?: string | null }) => usePlaceProfileNudge(options),
}));
jest.mock('../lib', () => ({ resolveHeaderProfile: () => ({ kind: 'site', name: 'me' }) }));
jest.mock('../../invite/hooks/useInviteListRows', () => ({
    useInviteListRows: () => ({ invites: [], isLoading: false }),
}));

beforeEach(() => {
    jest.clearAllMocks();
    useHomeChatTabStore.setState({ tab: 'all' });
    places = [{ id: 'site-1', stereo: 'group' }];
    isPlacesLoading = false;
    selectedPlaceId = 'site-1';
    isSwitchingPlace = false;
    isProfileNudgeVisible = false;
    activeCloudChannels = [];
    scopedNotifications = [];
    homeChannels = [];
    invitedClouds = [];
    selectedSiteId = 'site-1';
    membership = { isValid: false };
    isMembershipLoading = false;
    catalog = { clouds: [], hasCloudCatalog: true, isPendingClouds: false };
    collapsedSections = {};
    isAuthenticated = true;
    isPlaceInviteEnabled = true;
    refetchCloudsMock.mockResolvedValue(undefined);
    refetchMembershipMock.mockResolvedValue(undefined);
    requestBackgroundRefreshMock.mockResolvedValue(undefined);
});

describe('HomePage — relay mode', () => {
    beforeEach(() => {
        selectedCloudId = 'default';
    });

    it('does not render the Place section', () => {
        render(<HomePage />);

        expect(screen.queryByTestId('place-list')).not.toBeInTheDocument();
    });

    it('renders the cloud promo banner in the Place section slot', () => {
        render(<HomePage />);

        expect(screen.getByTestId('promo-banner')).toBeInTheDocument();
    });

    it('keeps the banner off until the cloud catalog has answered', () => {
        catalog = { clouds: [], hasCloudCatalog: false, isPendingClouds: true };
        render(<HomePage />);

        expect(screen.queryByTestId('promo-banner')).not.toBeInTheDocument();
    });

    it('keeps the banner off when the first catalog fetch failed — no answer is not "no cloud"', () => {
        catalog = { clouds: [], hasCloudCatalog: false, isPendingClouds: false };
        render(<HomePage />);

        expect(screen.queryByTestId('promo-banner')).not.toBeInTheDocument();
    });

    it('still runs useActiveCloudPlaces and useSwitchPlace', () => {
        render(<HomePage />);

        expect(useActiveCloudPlaces).toHaveBeenCalled();
        expect(useSwitchPlace).toHaveBeenCalled();
    });

    it('still renders the room list, under the same tabs as a cloud', () => {
        render(<HomePage />);

        expect(screen.getByTestId('chat-tabs')).toBeInTheDocument();
        expect(screen.getByTestId('cloud-list')).toBeInTheDocument();
        expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
    });

    it('uses the no-cloud header kind', () => {
        render(<HomePage />);

        expect(screen.getByTestId('header')).toHaveAttribute('data-kind', 'no-cloud');
    });

    it('sends the banner action to the cloud guide, not straight to the plan picker', () => {
        render(<HomePage />);
        fireEvent.click(screen.getByTestId('promo-banner'));

        expect(navigateMock).toHaveBeenCalledWith(ROUTES.subscription.guide);
    });

    it('draws one tab over every room, led by the self chat', () => {
        homeChannels = [
            { id: 'r-dm', stereo: 'dm', cid: 'default', sid: '0000' },
            { id: 'r-self', stereo: 'self', cid: 'default', sid: '0000' },
        ];
        render(<HomePage />);

        expect(screen.getByTestId('tab-all')).toHaveAttribute('data-count', '2');
        expect(screen.queryByTestId('tab-group')).not.toBeInTheDocument();
        expect(screen.queryByTestId('tab-dm')).not.toBeInTheDocument();
        expect(screen.getByTestId('cloud-list')).toHaveAttribute('data-channel-ids', 'r-dm,r-self');
        expect(screen.getByTestId('cloud-list')).toHaveAttribute('data-leads-with-self', 'true');
    });

    it('stays on its one tab whatever a cloud left in the tab store', () => {
        useHomeChatTabStore.setState({ tab: 'group' });
        homeChannels = [{ id: 'r-dm', stereo: 'dm', cid: 'default', sid: '0000' }];
        render(<HomePage />);

        expect(screen.getByTestId('chat-tabs')).toHaveAttribute('data-value', 'all');
        expect(screen.getByTestId('cloud-list')).toHaveAttribute('data-channel-ids', 'r-dm');
    });

    it('offers the 1:1 entry and sends it to the contact invite form', () => {
        render(<HomePage />);
        fireEvent.click(screen.getByTestId('start-dm'));

        expect(navigateMock).toHaveBeenCalledWith(ROUTES.invite.contact);
    });

    it('offers no group creation, paid or not', () => {
        const { unmount } = render(<HomePage />);
        expect(screen.queryByTestId('create-group')).not.toBeInTheDocument();
        unmount();

        membership = { isValid: true };
        render(<HomePage />);
        expect(screen.queryByTestId('create-group')).not.toBeInTheDocument();
    });
});

describe('HomePage — cloud mode', () => {
    beforeEach(() => {
        selectedCloudId = 'cloud-1';
        pairedCloudIds = [];
        pairedCloudNames = {};
    });

    it('names a paired cloud by the name read from inside it', () => {
        selectedCloudId = '1000002';
        pairedCloudIds = ['1000002'];
        pairedCloudNames = { '1000002': 'Team Cloud' };
        render(<HomePage />);

        expect(screen.getByTestId('header')).toHaveAttribute('data-name', 'Team Cloud');
    });

    it('names a paired cloud it has no name for by its id, as the switch sheet does', () => {
        selectedCloudId = '1000002';
        pairedCloudIds = ['1000002'];
        render(<HomePage />);

        expect(screen.getByTestId('header')).toHaveAttribute('data-name', 'pairing.cloud.unnamed:{"id":"000002"}');
    });

    it('leaves a cloud that is neither listed nor paired unnamed', () => {
        selectedCloudId = '1000002';
        render(<HomePage />);

        expect(screen.getByTestId('header')).toHaveAttribute('data-name', '');
    });

    it('renders the Place section and no promo banner', () => {
        render(<HomePage />);

        expect(screen.getByTestId('place-list')).toBeInTheDocument();
        expect(screen.queryByTestId('promo-banner')).not.toBeInTheDocument();
    });

    it('uses the cloud header kind', () => {
        render(<HomePage />);

        expect(screen.getByTestId('header')).toHaveAttribute('data-kind', 'cloud');
    });

    it('lists every room under All and each kind under its own tab, with counts', () => {
        homeChannels = [
            { id: 'g-1', stereo: 'private', cid: 'cloud-1', sid: 'site-1' },
            { id: 'site-1@me@peer', stereo: 'dm', cid: 'cloud-1', sid: 'site-1' },
            { id: 'g-2', stereo: 'public', cid: 'cloud-1', sid: 'site-1' },
        ];
        render(<HomePage />);

        expect(screen.getByTestId('cloud-list')).toHaveAttribute('data-channel-ids', 'site-1@me@peer,g-1,g-2');
        expect(screen.getByTestId('tab-all')).toHaveAttribute('data-count', '3');
        expect(screen.getByTestId('tab-group')).toHaveAttribute('data-count', '2');
        expect(screen.getByTestId('tab-dm')).toHaveAttribute('data-count', '1');

        fireEvent.click(screen.getByTestId('tab-group'));
        expect(screen.getByTestId('cloud-list')).toHaveAttribute('data-channel-ids', 'g-1,g-2');

        fireEvent.click(screen.getByTestId('tab-dm'));
        expect(screen.getByTestId('cloud-list')).toHaveAttribute('data-channel-ids', 'site-1@me@peer');
    });

    it('comes back on the tab that was left', () => {
        const { unmount } = render(<HomePage />);
        fireEvent.click(screen.getByTestId('tab-dm'));
        unmount();

        render(<HomePage />);
        expect(screen.getByTestId('chat-tabs')).toHaveAttribute('data-value', 'dm');
    });

    it('withholds the tab counts while a place switch is in flight', () => {
        isSwitchingPlace = true;
        render(<HomePage />);

        expect(screen.getByTestId('tab-all')).toHaveAttribute('data-count', '');
    });

    it('leads All and the 1:1 tab with the self chat, and keeps it out of the group tab', () => {
        const self = { id: 'self', stereo: 'self', cid: 'cloud-1', sid: 'site-1' };
        activeCloudChannels = [self];
        homeChannels = [{ id: 'site-1@me@peer', stereo: 'dm', cid: 'cloud-1', sid: 'site-1' }, self];
        render(<HomePage />);

        expect(screen.getByTestId('cloud-list')).toHaveAttribute('data-channel-ids', 'self,site-1@me@peer');
        expect(screen.getByTestId('cloud-list')).toHaveAttribute('data-leads-with-self', 'true');

        fireEvent.click(screen.getByTestId('tab-group'));
        expect(screen.getByTestId('cloud-list')).toHaveAttribute('data-channel-ids', '');
        expect(screen.getByTestId('cloud-list')).toHaveAttribute('data-leads-with-self', 'false');
    });

    it('starts a 1:1 from the tab row before any 1:1 exists', () => {
        render(<HomePage />);

        fireEvent.click(screen.getByTestId('start-dm'));

        expect(navigateMock).toHaveBeenCalledWith(ROUTES.channels.startDm);
    });

    it('offers the owner group creation from the same ＋', () => {
        render(<HomePage />);

        expect(screen.getByTestId('create-group')).toBeInTheDocument();
    });

    it('offers an invited member the 1:1 start but not group creation', () => {
        invitedClouds = [{ id: 'cloud-1' }];
        render(<HomePage />);

        expect(screen.getByTestId('start-dm')).toBeInTheDocument();
        expect(screen.queryByTestId('create-group')).not.toBeInTheDocument();
    });

    it('offers no relay 1:1 entry in a cloud', () => {
        render(<HomePage />);

        expect(screen.queryByTestId('create-direct')).not.toBeInTheDocument();
        expect(screen.queryByTestId('channel-list')).not.toBeInTheDocument();
    });

    it('holds the 1:1 start while the shown place and the session place disagree', () => {
        selectedSiteId = 'site-2';
        render(<HomePage />);

        expect(screen.getByTestId('cloud-list')).toBeInTheDocument();
        expect(screen.queryByTestId('start-dm')).not.toBeInTheDocument();
    });

    it('holds the 1:1 start while a place switch is in flight', () => {
        isSwitchingPlace = true;
        render(<HomePage />);

        expect(screen.getByTestId('cloud-list')).toBeInTheDocument();
        expect(screen.queryByTestId('start-dm')).not.toBeInTheDocument();
    });

    it('keeps the place empty state for All and a plain line for an empty tab', () => {
        render(<HomePage />);
        expect(screen.getByTestId('cloud-list')).toHaveAttribute('data-empty-label', '');

        fireEvent.click(screen.getByTestId('tab-group'));
        expect(screen.getByTestId('cloud-list')).toHaveAttribute('data-empty-label', 'homePage.groupChatsEmpty');

        fireEvent.click(screen.getByTestId('tab-dm'));
        expect(screen.getByTestId('cloud-list')).toHaveAttribute('data-empty-label', 'cloudDm.section.empty');
    });

    it('keeps the relay list on its own empty state', () => {
        selectedCloudId = 'default';
        homeChannels = [{ id: 'r-dm', stereo: 'dm', cid: 'default', sid: 'site-1' }];
        render(<HomePage />);

        expect(screen.getByTestId('cloud-list')).toHaveAttribute('data-empty-label', '');
    });

    it("points the empty room list's leave hint at the active place's information screen", () => {
        render(<HomePage />);

        fireEvent.click(screen.getByTestId('open-place-info'));

        expect(navigateMock).toHaveBeenCalledWith(ROUTES.place.settingsDetail('site-1'));
    });
    it('pins the tabs under the header, moving the divider from the header to the tabs as they pin', () => {
        render(<HomePage />);
        const header = screen.getByTestId('header');
        const tabs = screen.getByTestId('chat-tabs');
        const list = screen.getByTestId('home-scroll');
        const anchor = tabs.previousElementSibling as HTMLElement;
        list.getBoundingClientRect = () => ({ top: 100 }) as DOMRect;
        const scrollTo = (top: number, anchorTop: number) => {
            anchor.getBoundingClientRect = () => ({ top: anchorTop }) as DOMRect;
            list.scrollTop = top;
            fireEvent.scroll(list);
        };

        expect(tabs).toHaveClass('sticky', 'top-[-8px]');
        expect(header).toHaveClass('border-transparent');

        scrollTo(30, 150);
        expect(header).toHaveClass('border-input-border');

        scrollTo(76, 96);
        expect(header).toHaveClass('border-input-border');

        scrollTo(84, 92);
        expect(header).toHaveClass('border-transparent');

        scrollTo(0, 180);
        expect(header).toHaveClass('border-transparent');
    });
});

describe('HomePage — no place selected yet', () => {
    beforeEach(() => {
        selectedCloudId = 'cloud-1';
        selectedPlaceId = null;
        places = [];
    });

    it('shows the loading state while the place list is still unknown', () => {
        isPlacesLoading = true;

        render(<HomePage />);

        expect(screen.getByRole('status')).toBeInTheDocument();
        expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
    });

    it('shows the loading state while a place switch is in flight', () => {
        isSwitchingPlace = true;

        render(<HomePage />);

        expect(screen.getByRole('status')).toBeInTheDocument();
        expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
    });

    it('shows the empty state once the list is known and holds no place', () => {
        render(<HomePage />);

        expect(screen.getByTestId('empty-state')).toBeInTheDocument();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('keeps the cloud self chat on a cloud with no place left', () => {
        activeCloudChannels = [{ id: 'self', stereo: 'self', cid: 'cloud-1', sid: 'S:one' }];

        render(<HomePage />);

        expect(screen.getByTestId('empty-state')).toBeInTheDocument();
        expect(screen.getByTestId('cloud-list')).toHaveAttribute('data-channel-ids', 'self');
        expect(screen.queryByTestId('start-dm')).not.toBeInTheDocument();
    });

    it('draws no list on a cloud with no place and no self chat', () => {
        render(<HomePage />);

        expect(screen.queryByTestId('cloud-list')).not.toBeInTheDocument();
    });

    it('shows neither once a place is selected — the room list owns the slot', () => {
        selectedPlaceId = 'site-1';

        render(<HomePage />);

        expect(screen.getByTestId('cloud-list')).toBeInTheDocument();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
    });

    it('covers relay too, where it is the only thing in the body', () => {
        selectedCloudId = 'default';
        isPlacesLoading = true;

        render(<HomePage />);

        expect(screen.queryByTestId('place-list')).not.toBeInTheDocument();
        expect(screen.getByRole('status')).toBeInTheDocument();
    });
});

describe('HomePage — place cap', () => {
    const addPlace = () => fireEvent.click(screen.getByTestId('add-place'));

    beforeEach(() => {
        selectedCloudId = 'cloud-1';
    });

    it('opens the create dialog while under the cap', () => {
        render(<HomePage />);
        addPlace();

        expect(screen.getByTestId('create-place-dialog')).toBeInTheDocument();
        expect(screen.queryByTestId('place-limit-dialog')).not.toBeInTheDocument();
    });

    it('opens the limit dialog — not a toast — once the cap is reached', () => {
        places = Array.from({ length: MAX_PLACES }, (_, i) => ({ id: `site-${i + 1}`, stereo: 'group' }));
        render(<HomePage />);
        addPlace();

        const dialog = screen.getByTestId('place-limit-dialog');
        expect(dialog).toHaveAttribute('data-max', String(MAX_PLACES));
        expect(screen.queryByTestId('create-place-dialog')).not.toBeInTheDocument();
        expect(toastMock).not.toHaveBeenCalled();
    });

    describe('at the cap', () => {
        beforeEach(() => {
            places = Array.from({ length: MAX_PLACES }, (_, i) => ({ id: `site-${i + 1}`, stereo: 'group' }));
        });

        it('sends 플레이스 관리 to the ACTIVE place settings hub', () => {
            render(<HomePage />);
            addPlace();
            fireEvent.click(screen.getByTestId('limit-manage'));

            expect(navigateMock).toHaveBeenCalledWith(ROUTES.place.settings('site-1'));
        });

        it('offers no 플레이스 관리 target when no place is active', () => {
            selectedSiteId = null;
            render(<HomePage />);
            addPlace();

            expect(screen.getByTestId('place-limit-dialog')).toHaveAttribute('data-can-manage', 'false');
        });

        it('sends 클라우드 추가 through the one add-cloud entry point', () => {
            render(<HomePage />);
            addPlace();
            fireEvent.click(screen.getByTestId('limit-add-cloud'));

            expect(requestAddCloudMock).toHaveBeenCalledTimes(1);
            expect(navigateMock).not.toHaveBeenCalled();
        });
    });
});

describe('HomePage — invite to place (profile menu)', () => {
    beforeEach(() => {
        selectedCloudId = 'cloud-1';
        places = [{ id: 'site-1', stereo: 'work', isOwner: true }];
    });

    it('offers the owner an invite into the active place', () => {
        render(<HomePage />);
        fireEvent.click(screen.getByText('homePage.menuPlaceInvite'));

        expect(navigateMock).toHaveBeenCalledWith(ROUTES.invite.place('site-1'));
    });

    it('is absent until the Lab experiment is turned on, even for the owner', () => {
        isPlaceInviteEnabled = false;
        render(<HomePage />);

        expect(screen.queryByText('homePage.menuPlaceInvite')).not.toBeInTheDocument();
    });

    it('is absent on the relay, whose place has no owner', () => {
        selectedCloudId = 'default';
        render(<HomePage />);

        expect(screen.queryByText('homePage.menuPlaceInvite')).not.toBeInTheDocument();
    });

    it('is absent for a member of a place they do not own', () => {
        places = [{ id: 'site-1', stereo: 'work', isOwner: false }];
        render(<HomePage />);

        expect(screen.queryByText('homePage.menuPlaceInvite')).not.toBeInTheDocument();
    });

    it('is held while a place switch is moving the session', () => {
        isSwitchingPlace = true;
        render(<HomePage />);

        expect(screen.getByText('homePage.menuPlaceInvite')).toBeDisabled();
    });

    it('is held while the shown place and the session place disagree', () => {
        places = [
            { id: 'site-1', stereo: 'work', isOwner: true },
            { id: 'site-2', stereo: 'work', isOwner: true },
        ];
        selectedPlaceId = 'site-2';
        render(<HomePage />);

        expect(screen.getByText('homePage.menuPlaceInvite')).toBeDisabled();
    });
});

describe('HomePage — 프로필 메뉴 구독 뱃지', () => {
    it('두유홈(중계)에선 FREE 뱃지를 보인다', () => {
        selectedCloudId = 'default';
        render(<HomePage />);

        expect(screen.getByTestId('tier-badge')).toHaveTextContent('free');
    });

    it('구독 중이어도 두유홈은 FREE 고정이다 — 구독이 사주는 것은 내 클라우드다', () => {
        selectedCloudId = 'default';
        membership = { isValid: true };
        render(<HomePage />);

        expect(screen.getByTestId('tier-badge')).toHaveTextContent('free');
    });

    it('클라우드에선 구독 등급을 그대로 읽어 PRO를 보인다', () => {
        selectedCloudId = 'cloud-1';
        membership = { isValid: true };
        render(<HomePage />);

        expect(screen.getByTestId('tier-badge')).toHaveTextContent('pro');
    });

    it('holds a placeholder instead of a badge while the tier is undecided (membership in flight)', () => {
        selectedCloudId = 'cloud-1';
        membership = undefined;
        isMembershipLoading = true;
        render(<HomePage />);

        expect(screen.queryByTestId('tier-badge')).not.toBeInTheDocument();
        expect(screen.getByTestId('tier-badge-skeleton')).toBeInTheDocument();
    });
});

describe('HomePage — tier', () => {
    beforeEach(() => {
        selectedCloudId = 'cloud-1';
    });

    it('draws no tier pill in the header, on a cloud or on the relay', () => {
        membership = { isValid: true };
        const { unmount } = render(<HomePage />);
        expect(screen.getByTestId('header')).toHaveAttribute('data-plan-tier', '');
        expect(screen.getByTestId('header')).toHaveAttribute('data-plan-loading', 'false');
        unmount();

        selectedCloudId = 'default';
        render(<HomePage />);
        expect(screen.getByTestId('header')).toHaveAttribute('data-plan-tier', '');
    });

    it('stays undecided while membership is in flight', () => {
        membership = undefined;
        isMembershipLoading = true;
        render(<HomePage />);

        expect(screen.getByTestId('tier-badge-skeleton')).toBeInTheDocument();
    });

    it('stays undecided while the cloud catalog is pending, even with an invalid membership in hand', () => {
        membership = { isValid: false };
        catalog = { clouds: [], hasCloudCatalog: false, isPendingClouds: true };
        render(<HomePage />);

        expect(screen.getByTestId('tier-badge-skeleton')).toBeInTheDocument();
    });

    it('settles on PRO as soon as membership says so, without waiting for the catalog', () => {
        membership = { isValid: true };
        catalog = { clouds: [], hasCloudCatalog: false, isPendingClouds: true };
        render(<HomePage />);

        expect(screen.getByTestId('tier-badge')).toHaveTextContent('pro');
    });

    it('settles on PRO from an active cloud while membership is still in flight', () => {
        membership = undefined;
        isMembershipLoading = true;
        catalog = { clouds: [{ id: 'cloud-1', status: 'active' }], hasCloudCatalog: true, isPendingClouds: false };
        render(<HomePage />);

        expect(screen.getByTestId('tier-badge')).toHaveTextContent('pro');
    });

    it('settles on membership alone when the first catalog fetch failed, instead of pulsing forever', () => {
        membership = { isValid: false };
        catalog = { clouds: [], hasCloudCatalog: false, isPendingClouds: false };
        render(<HomePage />);

        expect(screen.getByTestId('tier-badge')).toHaveTextContent('free');
    });

    it('settles on FREE only once both sources have answered and neither is PRO', () => {
        render(<HomePage />);

        expect(screen.getByTestId('tier-badge')).toHaveTextContent('free');
    });
});

describe('HomePage — 그룹 방 만들기', () => {
    it('offers no group entry on the relay, which has no group rooms', () => {
        selectedCloudId = 'default';
        render(<HomePage />);

        expect(screen.queryByTestId('create-group')).not.toBeInTheDocument();
    });

    it('구독한 클라우드에선 생성 다이얼로그를 연다', () => {
        selectedCloudId = 'cloud-1';
        membership = { isValid: true };
        render(<HomePage />);
        fireEvent.click(screen.getByTestId('create-group'));

        expect(screen.getByTestId('create-channel-dialog')).toBeInTheDocument();
        expect(screen.queryByTestId('subscription-required')).not.toBeInTheDocument();
    });

    it('미구독 클라우드에선 구독 유도 다이얼로그를 띄운다', () => {
        selectedCloudId = 'cloud-1';
        render(<HomePage />);
        fireEvent.click(screen.getByTestId('create-group'));

        expect(screen.getByTestId('subscription-required')).toBeInTheDocument();
    });

    describe('no active place', () => {
        it('refuses the attempt with a message instead of opening the dialog', () => {
            selectedCloudId = 'cloud-1';
            membership = { isValid: true };
            selectedSiteId = null;

            render(<HomePage />);
            fireEvent.click(screen.getByTestId('create-group'));

            expect(screen.queryByTestId('create-channel-dialog')).not.toBeInTheDocument();
            expect(toastMock).toHaveBeenCalledWith({ title: 'homePage.selectPlaceFirst' });
        });

        it('does not fall through to the subscription upsell — the block is about the place', () => {
            selectedCloudId = 'cloud-1';
            membership = { isValid: true };
            selectedSiteId = null;

            render(<HomePage />);
            fireEvent.click(screen.getByTestId('create-group'));

            expect(screen.queryByTestId('subscription-required')).not.toBeInTheDocument();
        });

        it('closes an already-open dialog when the place goes away mid-flow', () => {
            selectedCloudId = 'cloud-1';
            membership = { isValid: true };

            const { rerender } = render(<HomePage />);
            fireEvent.click(screen.getByTestId('create-group'));
            expect(screen.getByTestId('create-channel-dialog')).toBeInTheDocument();

            selectedSiteId = null;
            rerender(<HomePage />);

            expect(screen.queryByTestId('create-channel-dialog')).not.toBeInTheDocument();
            expect(toastMock).toHaveBeenCalledWith({ title: 'homePage.selectPlaceFirst' });
        });
    });
});

describe('HomePage — pull to refresh', () => {
    beforeEach(() => {
        selectedCloudId = 'cloud-1';
    });

    it('re-asks the background lists and both header queries', async () => {
        render(<HomePage />);

        await act(async () => fireEvent.click(screen.getByTestId('pull-refresh')));

        expect(requestBackgroundRefreshMock).toHaveBeenCalledTimes(1);
        expect(refetchCloudsMock).toHaveBeenCalledTimes(1);
        expect(refetchMembershipMock).toHaveBeenCalledTimes(1);
    });

    it('does not ask the catalog without a session — its query is disabled then', async () => {
        isAuthenticated = false;
        render(<HomePage />);

        await act(async () => fireEvent.click(screen.getByTestId('pull-refresh')));

        expect(refetchCloudsMock).not.toHaveBeenCalled();
        expect(requestBackgroundRefreshMock).toHaveBeenCalledTimes(1);
    });

    it('still asks the rest when one part fails', async () => {
        refetchCloudsMock.mockRejectedValue(new Error('offline'));
        render(<HomePage />);

        await act(async () => fireEvent.click(screen.getByTestId('pull-refresh')));

        expect(requestBackgroundRefreshMock).toHaveBeenCalledTimes(1);
        expect(refetchMembershipMock).toHaveBeenCalledTimes(1);
    });
});

describe('HomePage — place profile banner', () => {
    it('shows the banner in a cloud under the chat tabs', () => {
        selectedCloudId = 'cloud-1';
        isProfileNudgeVisible = true;
        render(<HomePage />);

        const banner = screen.getByTestId('place-profile-banner');
        expect(banner.compareDocumentPosition(screen.getByTestId('place-list'))).toBe(Node.DOCUMENT_POSITION_PRECEDING);
        expect(banner.compareDocumentPosition(screen.getByTestId('chat-tabs'))).toBe(Node.DOCUMENT_POSITION_PRECEDING);
    });

    it('puts the cloud promo under the chat tabs on the relay', () => {
        selectedCloudId = 'default';
        render(<HomePage />);

        expect(screen.getByTestId('promo-banner').compareDocumentPosition(screen.getByTestId('chat-tabs'))).toBe(
            Node.DOCUMENT_POSITION_PRECEDING
        );
    });

    it('takes the cloud promo turn on the relay while it shows', () => {
        selectedCloudId = 'default';
        isProfileNudgeVisible = true;
        render(<HomePage />);

        expect(screen.getByTestId('place-profile-banner')).toBeInTheDocument();
        expect(screen.queryByTestId('promo-banner')).not.toBeInTheDocument();
    });

    it('gives the promo its slot back once the banner is gone', () => {
        selectedCloudId = 'default';
        render(<HomePage />);

        expect(screen.queryByTestId('place-profile-banner')).not.toBeInTheDocument();
        expect(screen.getByTestId('promo-banner')).toBeInTheDocument();
    });

    it('hands the nudge my cached nick', () => {
        render(<HomePage />);

        expect(usePlaceProfileNudge).toHaveBeenLastCalledWith({ nick: 'me' });
    });
});

describe('HomePage — find-me row', () => {
    const item = (over: Record<string, unknown>) => ({
        id: String(Math.random()),
        cloudId: 'cloud-1',
        channelId: 'c',
        kind: 'mention',
        ownerName: 'Sis',
        content: 'hi',
        createdAt: 1,
        read: false,
        ...over,
    });

    beforeEach(() => {
        selectedCloudId = 'cloud-1';
        useFindMeSheetRequest.setState({ open: false });
    });

    it('counts unread mentions, replies and reactions to me, and nothing else', () => {
        scopedNotifications = [
            item({ kind: 'mention' }),
            item({ kind: 'replyToMine' }),
            item({ kind: 'reaction' }),
            item({ kind: 'participatedThread' }),
            item({ kind: 'mention', read: true }),
        ];
        render(<HomePage />);

        expect(screen.getByRole('button', { name: /homePage\.findMe/ })).toHaveTextContent('{"count":3}');
    });

    it('asks for the sheet when tapped', () => {
        scopedNotifications = [item({})];
        render(<HomePage />);

        fireEvent.click(screen.getByRole('button', { name: /homePage\.findMe/ }));
        expect(useFindMeSheetRequest.getState().open).toBe(true);
    });

    it('is not drawn while nothing is looking for me', () => {
        scopedNotifications = [item({ kind: 'participatedThread' }), item({ kind: 'reaction', read: true })];
        render(<HomePage />);

        expect(screen.queryByRole('button', { name: /homePage\.findMe/ })).not.toBeInTheDocument();
    });
});
