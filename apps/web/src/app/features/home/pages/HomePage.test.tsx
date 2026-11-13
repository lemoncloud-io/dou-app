import '@testing-library/jest-dom';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { HomePage } from './HomePage';
import { useHomeChatTabStore } from '../stores/useHomeChatTabStore';
import { ROUTES } from '../../../routes/paths';
import { MAX_PLACES } from '../../../utils';

// This suite covers ONE thing: how HomePage branches on relay vs cloud (ADR-0091). Children are
// stubbed to markers so the assertions are about which sections mount, not their internals.

let selectedCloudId: string | null = 'default';
let pairedCloudIds: string[] = [];
let pairedCloudNames: Record<string, string> = {};
// The active place (site). Mutable so a test can drop to "no place active", where the place-settings
// route has no id to key off.
let selectedSiteId: string | null = 'site-1';
// Membership drives the tier pill (header + profile menu). Mutable so a test can be a subscriber,
// and so the "still fetching" state — where the tier is undecided — can be reproduced.
let membership: { isValid: boolean } | undefined = { isValid: false };
let isMembershipLoading = false;
// Whether a session exists — the catalog refetch on a pull is gated on it, as its query is.
let isAuthenticated = true;
// The relay cloud catalog. `hasCloudCatalog` is whether it has answered at all — the banner waits for
// it — and `isPendingClouds` keeps the tier open, since an active cloud alone makes it PRO.
let catalog: { clouds: { id: string; status?: string }[]; hasCloudCatalog: boolean; isPendingClouds: boolean } = {
    clouds: [],
    hasCloudCatalog: true,
    isPendingClouds: false,
};
// The Lab switch behind "Invite to place". On by default here so the menu's own gate is what the
// invite tests drive; one test turns it off.
let isPlaceInviteEnabled = true;

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o ? `${k}:${JSON.stringify(o)}` : k) }),
}));
const navigateMock = jest.fn();
jest.mock('@chatic/shared', () => ({
    ...jest.requireActual('@chatic/shared'),
    useNavigateWithTransition: () => navigateMock,
    // Pinned channels moved to @chatic/shared — stub the hook (needs the config store).
    usePinnedChannels: () => ({ pinnedIds: [], toggle: jest.fn(), reorder: jest.fn() }),
}));
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useRuntimeProfile: () => ({ isGuest: false }),
            useSessionAuth: () => ({ isAuthenticated }),
            useSessionSelection: () => ({ selectedCloudId, selectedSiteId }),
            usePairedCloudIds: () => pairedCloudIds,
            usePairedCloudNames: () => pairedCloudNames,
        },
    },
}));

// The three things a pull re-asks. Spies, so the pull-to-refresh block can see each one go out.
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
    // The profile dropdown (and its tier pill) hangs off the header's `avatar` slot, so the stub has
    // to render it — otherwise the menu never mounts.
    AppHeader: ({
        kind,
        name,
        avatar,
        planTier,
        planLoading,
    }: {
        kind: string;
        name?: string;
        avatar?: any;
        planTier?: string;
        planLoading?: boolean;
    }) => (
        <header
            data-testid="header"
            data-kind={kind}
            data-plan-tier={planTier ?? ''}
            data-plan-loading={String(!!planLoading)}
            data-name={name ?? ''}
        >
            {avatar}
        </header>
    ),
    EmptyState: () => <div data-testid="empty-state" />,
    ProfileAvatar: () => <img alt="" />,
    // The cloud home's conversation tabs: each tab a button carrying its count, the trailing ＋ beside.
    SegmentedTabs: ({ items, value, onChange, trailing }: any) => (
        <div data-testid="chat-tabs" data-value={value}>
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
    // The gesture is the kit's to test; here a button stands in for a completed pull.
    PullToRefresh: ({ children, onRefresh }: { children: any; onRefresh: () => Promise<unknown> }) => (
        <div>
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
    // A button, so a menu entry's own `disabled` and `onClick` are what the tests drive.
    DropdownMenuItem: ({ children, disabled, onClick }: any) => (
        <button type="button" disabled={disabled} onClick={onClick}>
            {children}
        </button>
    ),
    DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
}));
// Stable across renders so a test can assert a branch does NOT toast.
const toastMock = jest.fn();
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));
// `buildEnv` reads `import.meta`, which ts-jest's CommonJS transform cannot parse.
jest.mock('../../../utils/buildEnv', () => ({ isDevBuild: () => false }));

jest.mock('../../../hooks', () => ({
    useActiveCloudPlaces: (...args: unknown[]) => useActiveCloudPlaces(...(args as [])),
    useMyProfile: () => ({ profile: { nick: 'me' } }),
    useUserPermissions: () => ({ canCreatePlace: true }),
    useCachedCloudNames: () => ({}),
    useChannelUnreads: () => ({ byChannel: {}, byPlace: {} }),
    // The app-wide shared observation home reads instead of subscribing for itself.
    useActiveCloudData: () => ({
        channels: activeCloudChannels,
        isLoaded: true,
        myJoins: new Map(),
        unreads: { byChannel: {}, byPlace: {}, total: 0 },
    }),
    useActiveCloudUnreads: () => ({ byChannel: {}, byPlace: {}, total: 0 }),
    useHomeChannels: () => ({ channels: homeChannels, isLoading: false }),
    useInvitedClouds: () => ({ invitedClouds }),
    // Registration is the one join concern still scoped to home — a no-op here.
    useJoinSyncRegistration: jest.fn(),
    // Same for the active site's chat sync (message freshness) — a no-op here.
    useChatSyncRegistration: jest.fn(),
    useMyJoins: () => new Map(),
    useOtherCloudUnread: () => ({ byCloud: {}, total: 0 }),
    useScrollRestoration: () => ({ containerRef: { current: null }, onScroll: jest.fn() }),
    useOnboarding: () => ({ isFirstRun: false, completeOnboarding: jest.fn() }),
    useChannelSort: () => ({ channelSort: {}, setChannelSort: jest.fn() }),
    // The dropdown entries navigate through this rather than through `navigate` directly, so that
    // an open menu finishes leaving before the page transition snapshots the screen. Here it is
    // just the navigate spy: the waiting is `menuDismissal`'s to test, not home's.
    useMenuNavigate: () => navigateMock,
    usePlaceInviteExperiment: () => ({ isEnabled: isPlaceInviteEnabled, setEnabled: jest.fn() }),
}));
jest.mock('../stores/useCloudPushMarkStore', () => ({
    useCloudPushMarkStore: (selector: (state: { badged: Record<string, true> }) => unknown) => selector({ badged: {} }),
}));
jest.mock('../../../ui/components', () => ({ BottomNavSpacer: () => <div /> }));
jest.mock('../../onboarding', () => ({ OnboardingModal: () => null }));

jest.mock('../components', () => ({
    // Mirrors the create entries back out: the popover is the list's, but what the tap does (upsell
    // vs create dialog) is decided here, in the page. The buttons follow their handlers (and the 1:1
    // one its flag) so the stub says the same thing the real popover does: no handler, no entry.
    // The relay's one list is `channel-list`; a cloud's tabbed, heading-less list is `cloud-list`.
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
    // Surfaces the "+" so the place-cap branch can be driven from the page, as a user would.
    PlaceChipRow: ({ onCreatePlace }: { onCreatePlace: () => void }) => (
        <div data-testid="place-list">
            <button data-testid="add-place" onClick={onCreatePlace} />
        </div>
    ),
    // The cloud home's ＋: one button per entry it would offer, so "no handler, no entry" reads the same.
    ChannelCreateMenu: ({ showOneOnOneCreate, onCreateOneOnOne, showGroupCreate, onCreateGroup }: any) => (
        <>
            {showOneOnOneCreate && onCreateOneOnOne && <button data-testid="start-dm" onClick={onCreateOneOnOne} />}
            {showGroupCreate && onCreateGroup && <button data-testid="create-group" onClick={onCreateGroup} />}
        </>
    ),
    // Mirrors the props back out: the cap dialog's two actions are wired here, in the page.
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

// The two hooks the ADR calls out as load-bearing on relay. Spies so we can assert they still run.
// `places` is mutable so a test can seed the cloud up to (and past) the place cap.
let places: { id: string; stereo: string; isOwner?: boolean }[] = [{ id: 'site-1', stereo: 'group' }];
// The three inputs that decide what fills the Chat slot: the channel list, the "no place" empty
// state, or — while none of it is known yet — the loading state.
let isPlacesLoading = false;
let selectedPlaceId: string | null = 'site-1';
let isSwitchingPlace = false;
// The active cloud's rooms as the shared observation holds them — the self chat atop the 1:1
// section is read from it.
let activeCloudChannels: unknown[] = [];
// The active place's rooms, as `useHomeChannels` slices them out of that observation.
let homeChannels: unknown[] = [];
// Clouds I am a guest in. The active cloud listed here makes me an invited member, not its owner.
let invitedClouds: { id: string }[] = [];
const useActiveCloudPlaces = jest.fn(() => ({ places, isLoading: isPlacesLoading }));
const useSwitchPlace = jest.fn(() => ({ selectedPlaceId, switchPlace: jest.fn(), isSwitching: isSwitchingPlace }));
const requestAddCloudMock = jest.fn();
// Whether the profile banner is up is the nudge hook's call; the page only places it.
let isProfileNudgeVisible = false;
const usePlaceProfileNudge = jest.fn((_options: { nick?: string | null }) => ({
    isVisible: isProfileNudgeVisible,
    dismiss: jest.fn(),
    markPresent: jest.fn(),
}));

// Folded sections, as the stored record reports them. Mutable so a test can start with one folded.
let collapsedSections: Record<string, true> = {};
const setSectionOpenMock = jest.fn();

jest.mock('../hooks', () => ({
    useAddCloudFlow: () => ({ requestAddCloud: requestAddCloudMock }),
    useHomeSections: () => ({ isOpen: (id: string) => !collapsedSections[id], setOpen: setSectionOpenMock }),
    useSwitchPlace: (...args: unknown[]) => useSwitchPlace(...(args as [])),
    usePlaceProfileNudge: (options: { nick?: string | null }) => usePlaceProfileNudge(options),
}));
jest.mock('../lib', () => ({ resolveHeaderProfile: () => ({ kind: 'site', name: 'me' }) }));
// Relay invite rows (added to the page independently of this change).
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

        // A relay cloud always has exactly one auto-connected place, so the list adds nothing.
        expect(screen.queryByTestId('place-list')).not.toBeInTheDocument();
    });

    it('renders the cloud promo banner in the Place section slot', () => {
        render(<HomePage />);

        expect(screen.getByTestId('promo-banner')).toBeInTheDocument();
    });

    it('keeps the banner off until the cloud catalog has answered', () => {
        // Before the first answer `clouds` is an empty stand-in that reads as "owns no cloud", so an
        // owner used to see the pitch on every cold start and watch it vanish a beat later.
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

        // THE load-bearing invariant: ChannelList keys off selectedPlaceId, which on relay only
        // ever comes from useSwitchPlace's auto-select. Dropping these empties the relay home.
        expect(useActiveCloudPlaces).toHaveBeenCalled();
        expect(useSwitchPlace).toHaveBeenCalled();
    });

    it('still renders the Chat section', () => {
        render(<HomePage />);

        expect(screen.getByTestId('channel-list')).toBeInTheDocument();
        expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
    });

    it('uses the no-cloud header kind', () => {
        render(<HomePage />);

        expect(screen.getByTestId('header')).toHaveAttribute('data-kind', 'no-cloud');
    });

    it('sends the banner action to the cloud guide, not straight to the plan picker', () => {
        render(<HomePage />);
        fireEvent.click(screen.getByTestId('promo-banner'));

        // First-time users get the explanation before being asked to pay. The switcher sheet's own
        // footer button still opens the plan picker directly.
        expect(navigateMock).toHaveBeenCalledWith(ROUTES.subscription.guide);
    });

    // The relay keeps one list: its 1:1s and its self chat stay beside each other, untitled.
    it('keeps one untitled list with every room in it and no 1:1 section', () => {
        homeChannels = [
            { id: 'r-dm', stereo: 'dm', cid: 'default', sid: '0000' },
            { id: 'r-self', stereo: 'self', cid: 'default', sid: '0000' },
        ];
        render(<HomePage />);

        expect(screen.getByTestId('channel-list')).toHaveAttribute('data-channel-ids', 'r-dm,r-self');
        expect(screen.getByTestId('channel-list')).toHaveAttribute('data-title', '');
        expect(screen.queryByTestId('cloud-list')).not.toBeInTheDocument();
        expect(screen.queryByTestId('chat-tabs')).not.toBeInTheDocument();
    });

    // On relay a 1:1 is reached by phone number, so the entry stays and goes to the contact form.
    it('offers the 1:1 entry and sends it to the contact invite form', () => {
        render(<HomePage />);
        fireEvent.click(screen.getByTestId('create-direct'));

        expect(navigateMock).toHaveBeenCalledWith(ROUTES.invite.contact);
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
        // The pitch is pointless once a cloud is connected.
        expect(screen.queryByTestId('promo-banner')).not.toBeInTheDocument();
    });

    it('uses the cloud header kind', () => {
        render(<HomePage />);

        expect(screen.getByTestId('header')).toHaveAttribute('data-kind', 'cloud');
    });

    // A cloud lists its rooms in one list under three tabs: every room, the group rooms, the 1:1s.
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

    // Home unmounts on every navigation; the tab is held outside it so a trip into a room keeps it.
    it('comes back on the tab that was left', () => {
        const { unmount } = render(<HomePage />);
        fireEvent.click(screen.getByTestId('tab-dm'));
        unmount();

        render(<HomePage />);
        expect(screen.getByTestId('chat-tabs')).toHaveAttribute('data-value', 'dm');
    });

    // A count while the rooms are still arriving would claim an answer we do not have.
    it('withholds the tab counts while a place switch is in flight', () => {
        isSwitchingPlace = true;
        render(<HomePage />);

        expect(screen.getByTestId('tab-all')).toHaveAttribute('data-count', '');
    });

    // The cloud's notes-to-self room belongs to the account, not the place: it leads All and the
    // 1:1 tab, and the place's copy of it (it carries a place too) is listed under neither kind.
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

    // The ＋ at the end of the tabs is how a cloud 1:1 starts, so it is there before any 1:1 exists.
    it('starts a 1:1 from the tab row before any 1:1 exists', () => {
        render(<HomePage />);

        fireEvent.click(screen.getByTestId('start-dm'));

        expect(navigateMock).toHaveBeenCalledWith(ROUTES.channels.startDm);
    });

    it('offers the owner group creation from the same ＋', () => {
        render(<HomePage />);

        expect(screen.getByTestId('create-group')).toBeInTheDocument();
    });

    // A 1:1 is between two people, not a room the place's owner hands out: an invited member may
    // start one too, but not a group room.
    it('offers an invited member the 1:1 start but not group creation', () => {
        invitedClouds = [{ id: 'cloud-1' }];
        render(<HomePage />);

        expect(screen.getByTestId('start-dm')).toBeInTheDocument();
        expect(screen.queryByTestId('create-group')).not.toBeInTheDocument();
    });

    // The relay's phone-number entry has no place in a cloud.
    it('offers no relay 1:1 entry in a cloud', () => {
        render(<HomePage />);

        expect(screen.queryByTestId('create-direct')).not.toBeInTheDocument();
        expect(screen.queryByTestId('channel-list')).not.toBeInTheDocument();
    });

    // The picker lists the session's place; while home shows another one, a switch is still moving.
    it('holds the 1:1 start while the shown place and the session place disagree', () => {
        selectedSiteId = 'site-2';
        render(<HomePage />);

        expect(screen.getByTestId('cloud-list')).toBeInTheDocument();
        expect(screen.queryByTestId('start-dm')).not.toBeInTheDocument();
    });

    // While the place's rooms are still loading the picker has no place to read members from.
    it('holds the 1:1 start while a place switch is in flight', () => {
        isSwitchingPlace = true;
        render(<HomePage />);

        expect(screen.getByTestId('cloud-list')).toBeInTheDocument();
        expect(screen.queryByTestId('start-dm')).not.toBeInTheDocument();
    });

    // An empty tab says only that its kind is empty; the place's own empty state (create one / rooms
    // arrive by invitation, leave the place) is for All, where it means the place has no room at all.
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

        expect(screen.getByTestId('channel-list')).toHaveAttribute('data-empty-label', '');
    });

    // The empty room list's "you can leave this place" link opens the active place's information
    // screen, where the Leave row is.
    it("points the empty room list's leave hint at the active place's information screen", () => {
        render(<HomePage />);

        fireEvent.click(screen.getByTestId('open-place-info'));

        expect(navigateMock).toHaveBeenCalledWith(ROUTES.place.settingsDetail('site-1'));
    });
});

// The relay's list still folds, and its fold comes from the stored record — that is what lets it
// survive leaving home. A cloud's home has no folding sections any more.
describe('HomePage — section folds', () => {
    beforeEach(() => {
        selectedCloudId = 'default';
    });

    it('opens the relay list from its stored entry and writes a toggle under it', () => {
        collapsedSections = { channels: true };
        render(<HomePage />);

        expect(screen.getByTestId('channel-list')).toHaveAttribute('data-open', 'false');
        fireEvent.click(screen.getByTestId('channel-toggle'));
        expect(setSectionOpenMock.mock.calls).toEqual([['channels', true]]);
    });
});

// Switching into a cloud this device has never opened leaves the Chat slot with nothing to show:
// no place is selected yet, so there is no channel list, and the answer that would produce one has
// not arrived. That slot used to render blank, which reads as an empty cloud.
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
        // The empty state is an ANSWER; claiming it here is the bug.
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

    // Where the last place of a cloud leaves the user: the cloud stays, and so does its self chat,
    // which belongs to the account rather than to any place.
    it('keeps the cloud self chat on a cloud with no place left', () => {
        activeCloudChannels = [{ id: 'self', stereo: 'self', cid: 'cloud-1', sid: 'S:one' }];

        render(<HomePage />);

        expect(screen.getByTestId('empty-state')).toBeInTheDocument();
        expect(screen.getByTestId('cloud-list')).toHaveAttribute('data-channel-ids', 'self');
        // With no place there is nobody to pick, so the ＋ starts nothing.
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
        // Relay renders the promo banner instead of a Place rail, so there is no skeleton beside
        // this slot — a cold first launch would otherwise show a header over nothing at all.
        selectedCloudId = 'default';
        isPlacesLoading = true;

        render(<HomePage />);

        expect(screen.queryByTestId('place-list')).not.toBeInTheDocument();
        expect(screen.getByRole('status')).toBeInTheDocument();
    });
});

// The place cap used to be a bare toast; it is now a dialog that offers the two ways out.
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
        // MAX_PLACES creatable places. Relay subscription rows (stereo 'place') don't count, so all
        // five are 'group'.
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

            // The active site — not the first row of the list — is the place whose settings can free
            // a slot.
            expect(navigateMock).toHaveBeenCalledWith(ROUTES.place.settings('site-1'));
        });

        it('offers no 플레이스 관리 target when no place is active', () => {
            selectedSiteId = null;
            render(<HomePage />);
            addPlace();

            // Disabled rather than navigating to a route with no id.
            expect(screen.getByTestId('place-limit-dialog')).toHaveAttribute('data-can-manage', 'false');
        });

        it('sends 클라우드 추가 through the one add-cloud entry point', () => {
            render(<HomePage />);
            addPlace();
            fireEvent.click(screen.getByTestId('limit-add-cloud'));

            // The same request the switcher sheet raises — the cloud quota check lives in that flow.
            expect(requestAddCloudMock).toHaveBeenCalledTimes(1);
            expect(navigateMock).not.toHaveBeenCalled();
        });
    });
});

// The subscription badge in the profile dropdown (Figma 3108:25868) — DoU Home is always FREE; a cloud reads my actual tier.
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
        // The server files the invite under the session's site, so mid-switch it could land in the
        // place being left.
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
        // Guessing FREE and flipping to PRO tells a subscriber the wrong thing — same rule as the header pill.
        selectedCloudId = 'cloud-1';
        membership = undefined;
        isMembershipLoading = true;
        render(<HomePage />);

        expect(screen.queryByTestId('tier-badge')).not.toBeInTheDocument();
        expect(screen.getByTestId('tier-badge-skeleton')).toBeInTheDocument();
    });
});

// The tier is read in the profile menu on a cloud; the header carries no pill since the home redesign.
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
        // The catalog can still turn up an active cloud, which alone makes the account PRO — so FREE
        // here would be a guess that flips a beat later.
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
        // A failed fetch is no longer pending, so it counts as answered for the tier — unlike the
        // banner, which waits for actual data.
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

// On relay, "그룹 방 만들기" is an upsell-only entry point — it always leads to a subscription prompt, regardless of channel count.
describe('HomePage — 그룹 방 만들기', () => {
    it('중계에선 구독 유도 다이얼로그를 띄우고 생성 다이얼로그로 가지 않는다', () => {
        selectedCloudId = 'default';
        render(<HomePage />);
        fireEvent.click(screen.getByTestId('create-group'));

        expect(screen.getByTestId('subscription-required')).toBeInTheDocument();
        expect(screen.queryByTestId('create-channel-dialog')).not.toBeInTheDocument();
        // The limit-reached toast doesn't block the relay upsell path.
        expect(toastMock).not.toHaveBeenCalled();
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

    // A room is created under the ACTIVE place. With none, `createChannel` falls back to an empty
    // sid and writes the room into a scope no list reads — so the attempt is refused, not silently
    // succeeded.
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
            // The dialog is mounted outside the Chat section, so a cloud switch or a revoked place
            // would otherwise leave a form that submits with no sid.
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
    it('shows the banner in a cloud, above the Place section', () => {
        selectedCloudId = 'cloud-1';
        isProfileNudgeVisible = true;
        render(<HomePage />);

        const banner = screen.getByTestId('place-profile-banner');
        expect(banner.compareDocumentPosition(screen.getByTestId('place-list'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    // One banner at a time on the relay: naming yourself comes before the cloud upsell.
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

    // The nick is what hides the banner the moment a save writes it, from wherever it was saved.
    it('hands the nudge my cached nick', () => {
        render(<HomePage />);

        expect(usePlaceProfileNudge).toHaveBeenLastCalledWith({ nick: 'me' });
    });
});
