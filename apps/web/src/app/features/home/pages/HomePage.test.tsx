import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { HomePage } from './HomePage';
import { ROUTES } from '../../../routes/paths';
import { MAX_PLACES } from '../../../utils';

// This suite covers ONE thing: how HomePage branches on relay vs cloud (ADR-0034). Children are
// stubbed to markers so the assertions are about which sections mount, not their internals.

let selectedCloudId: string | null = 'default';
// The active place (site). Mutable so a test can drop to "no place active", where the place-settings
// route has no id to key off.
let selectedSiteId: string | null = 'site-1';
// Membership drives the tier pill (header + profile menu). Mutable so a test can be a subscriber,
// and so the "still fetching" state — where the tier is undecided — can be reproduced.
let membership: { isValid: boolean } | undefined = { isValid: false };
let isMembershipLoading = false;

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
const navigateMock = jest.fn();
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigateMock }));
jest.mock('@chatic/app-runtime', () => ({ useRuntimeProfile: () => ({ isGuest: false }) }));
jest.mock('@chatic/web-core', () => ({
    useCloudSessionCatalog: () => ({ clouds: [] }),
    useMembershipInfo: () => ({ data: membership, isLoading: isMembershipLoading }),
    useSessionSelection: () => ({ selectedCloudId, selectedSiteId }),
}));
jest.mock('@chatic/web-ui-kit', () => ({
    // The profile dropdown (and its tier pill) hangs off the header's `avatar` slot, so the stub has
    // to render it — otherwise the menu never mounts.
    AppHeader: ({ kind, avatar }: { kind: string; avatar?: any }) => (
        <header data-testid="header" data-kind={kind}>
            {avatar}
        </header>
    ),
    EmptyState: () => <div data-testid="empty-state" />,
    ProfileAvatar: () => <img alt="" />,
    SubscriptionBadge: ({ tier }: { tier: string }) => <span data-testid="tier-badge">{tier}</span>,
}));
jest.mock('@chatic/ui-kit/components/ui/dropdown-menu', () => ({
    DropdownMenu: ({ children }: any) => <div>{children}</div>,
    DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
    DropdownMenuItem: ({ children }: any) => <div>{children}</div>,
    DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
}));
// Stable across renders so a test can assert a branch does NOT toast.
const toastMock = jest.fn();
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));
// `buildEnv` reads `import.meta`, which ts-jest's CommonJS transform cannot parse.
jest.mock('../../../utils/buildEnv', () => ({ isDevBuild: () => false }));

jest.mock('../../../hooks', () => ({
    useMyProfile: () => ({ profile: { nick: 'me' } }),
    useUserPermissions: () => ({ canCreatePlace: true }),
    useCachedCloudNames: () => ({}),
    useChannelUnreads: () => ({ byChannel: {}, byPlace: {} }),
    // The app-wide shared observation home reads instead of subscribing for itself.
    useActiveCloudData: () => ({
        channels: [],
        isLoaded: true,
        myJoins: new Map(),
        unreads: { byChannel: {}, byPlace: {}, total: 0 },
    }),
    useActiveCloudUnreads: () => ({ byChannel: {}, byPlace: {}, total: 0 }),
    useHomeChannels: () => ({ channels: [], isLoading: false }),
    useInvitedClouds: () => ({ invitedClouds: [] }),
    // Registration is the one join concern still scoped to home — a no-op here.
    useJoinSyncRegistration: jest.fn(),
    // Same for the active site's chat sync (message freshness) — a no-op here.
    useChatSyncRegistration: jest.fn(),
    useMyJoins: () => new Map(),
    useOtherCloudUnread: () => ({ byCloud: {}, total: 0, refresh: jest.fn() }),
    useScrollRestoration: () => ({ containerRef: { current: null }, onScroll: jest.fn() }),
}));
jest.mock('../stores/useCloudPushMarkStore', () => ({
    useCloudPushMarkStore: (selector: (state: { badged: Record<string, true> }) => unknown) => selector({ badged: {} }),
}));
jest.mock('../../../stores/usePreferenceStore', () => ({
    usePreferenceStore: (sel?: (s: unknown) => unknown) => {
        const state = { isFirstRun: false, completeOnboarding: jest.fn(), channelSort: {}, pinnedChannels: {} };
        return sel ? sel(state) : state;
    },
}));
jest.mock('../../../stores/usePendingInviteChannel', () => ({ usePendingInviteChannel: () => null }));
jest.mock('../../../ui/components', () => ({ BottomNavSpacer: () => <div /> }));
jest.mock('../../onboarding', () => ({ OnboardingModal: () => null }));

jest.mock('../components', () => ({
    // Mirrors the create-group entry back out: the popover is the list's, but what the tap does
    // (upsell vs create dialog) is decided here, in the page.
    ChannelList: ({ isPro, onCreateGroup }: { isPro?: boolean; onCreateGroup: () => void }) => (
        <div data-testid="channel-list" data-is-pro={String(isPro)}>
            <button data-testid="create-group" onClick={onCreateGroup} />
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
    PlaceList: ({ onCreatePlace }: { onCreatePlace: () => void }) => (
        <div data-testid="place-list">
            <button data-testid="add-place" onClick={onCreatePlace} />
        </div>
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
    SubscriptionRequiredDialog: ({ open }: { open: boolean }) =>
        open ? <div data-testid="subscription-required" /> : null,
}));
jest.mock('../components/cloud-session', () => ({ getCloudDisplayName: () => 'Cloud' }));

// The two hooks the ADR calls out as load-bearing on relay. Spies so we can assert they still run.
// `places` is mutable so a test can seed the cloud up to (and past) the place cap.
let places: { id: string; stereo: string }[] = [{ id: 'site-1', stereo: 'group' }];
const useHomePlaces = jest.fn(() => ({ places, isLoading: false }));
const useSwitchPlace = jest.fn(() => ({ selectedPlaceId: 'site-1', switchPlace: jest.fn(), isSwitching: false }));
const requestAddCloudMock = jest.fn();

jest.mock('../hooks', () => ({
    useAddCloudFlow: () => ({ requestAddCloud: requestAddCloudMock }),
    useHomePlaces: (...args: unknown[]) => useHomePlaces(...(args as [])),
    useSwitchPlace: (...args: unknown[]) => useSwitchPlace(...(args as [])),
}));
jest.mock('../lib', () => ({ resolveHeaderProfile: () => ({ kind: 'site', name: 'me' }) }));
// Relay invite rows (added to the page independently of this change).
jest.mock('../../invite/hooks/useInviteListRows', () => ({
    useInviteListRows: () => ({ invites: [], isLoading: false }),
}));
// Home is where the locally-canceled reconcile runs once per boot (ADR-0043). It reaches the invite
// list and mutations through the hooks barrel, which this suite stubs down to the two entries the
// page itself reads — so it is stubbed out here rather than widening that stub for a pass this
// suite is not about.
jest.mock('../../invite/hooks/useCanceledInviteReconcile', () => ({
    useCanceledInviteReconcile: () => undefined,
}));
// Same reasoning — the one-time dismiss-migration hook (ADR-0052) reaches the preference store
// and repositories this suite doesn't stub for; it is not what this suite is testing.
jest.mock('../../invite/hooks/useInviteDismissMigration', () => ({
    useInviteDismissMigration: () => undefined,
}));

beforeEach(() => {
    jest.clearAllMocks();
    places = [{ id: 'site-1', stereo: 'group' }];
    selectedSiteId = 'site-1';
    membership = { isValid: false };
    isMembershipLoading = false;
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

    it('still runs useHomePlaces and useSwitchPlace', () => {
        render(<HomePage />);

        // THE load-bearing invariant: ChannelList keys off selectedPlaceId, which on relay only
        // ever comes from useSwitchPlace's auto-select. Dropping these empties the relay home.
        expect(useHomePlaces).toHaveBeenCalled();
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
});

describe('HomePage — cloud mode', () => {
    beforeEach(() => {
        selectedCloudId = 'cloud-1';
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

// 프로필 드롭다운의 구독 뱃지(Figma 3108:25868) — 두유홈은 FREE 고정, 클라우드는 내 등급을 읽는다.
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

    it('등급이 아직 정해지지 않았으면(멤버십 조회 중) 뱃지를 아예 안 보인다', () => {
        // FREE를 깜빡였다가 PRO로 뒤집히는 것보다 아무것도 안 보이는 편이 낫다 — 헤더 필과 같은 규칙.
        selectedCloudId = 'cloud-1';
        membership = undefined;
        isMembershipLoading = true;
        render(<HomePage />);

        expect(screen.queryByTestId('tier-badge')).not.toBeInTheDocument();
    });
});

// 중계의 "그룹 방 만들기"는 업셀 전용 입구다 — 채널 수와 무관하게 구독 유도로만 간다.
describe('HomePage — 그룹 방 만들기', () => {
    it('중계에선 구독 유도 다이얼로그를 띄우고 생성 다이얼로그로 가지 않는다', () => {
        selectedCloudId = 'default';
        render(<HomePage />);
        fireEvent.click(screen.getByTestId('create-group'));

        expect(screen.getByTestId('subscription-required')).toBeInTheDocument();
        expect(screen.queryByTestId('create-channel-dialog')).not.toBeInTheDocument();
        // 상한 토스트는 중계 업셀 경로를 가로막지 않는다.
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
});
