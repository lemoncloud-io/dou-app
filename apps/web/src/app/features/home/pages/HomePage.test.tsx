import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { HomePage } from './HomePage';
import { ROUTES } from '../../../routes/paths';

// This suite covers ONE thing: how HomePage branches on relay vs cloud (ADR-0034). Children are
// stubbed to markers so the assertions are about which sections mount, not their internals.

let selectedCloudId: string | null = 'default';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
const navigateMock = jest.fn();
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigateMock }));
jest.mock('@chatic/app-runtime', () => ({ useRuntimeProfile: () => ({ isGuest: false }) }));
jest.mock('@chatic/web-core', () => ({
    useCloudSessionCatalog: () => ({ clouds: [] }),
    useMembershipInfo: () => ({ data: { isValid: false }, isLoading: false }),
    useSessionSelection: () => ({ selectedCloudId, selectedSiteId: 'site-1' }),
}));
jest.mock('@chatic/web-ui-kit', () => ({
    AppHeader: ({ kind }: { kind: string }) => <header data-testid="header" data-kind={kind} />,
    EmptyState: () => <div data-testid="empty-state" />,
    ProfileAvatar: () => <img alt="" />,
}));
jest.mock('@chatic/ui-kit/components/ui/dropdown-menu', () => ({
    DropdownMenu: ({ children }: any) => <div>{children}</div>,
    DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
    DropdownMenuItem: ({ children }: any) => <div>{children}</div>,
    DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
}));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
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
    ChannelList: () => <div data-testid="channel-list" />,
    CloudPromoBanner: ({ onAddCloud }: { onAddCloud?: () => void }) => (
        <button data-testid="promo-banner" onClick={onAddCloud} />
    ),
    CloudSessionSheet: () => null,
    CreateChannelDialog: () => null,
    CreatePlaceDialog: () => null,
    InviteDialog: () => null,
    PlaceList: () => <div data-testid="place-list" />,
    SubscriptionRequiredDialog: () => null,
}));
jest.mock('../components/cloud-session', () => ({ getCloudDisplayName: () => 'Cloud' }));

// The two hooks the ADR calls out as load-bearing on relay. Spies so we can assert they still run.
const useHomePlaces = jest.fn(() => ({ places: [{ id: 'site-1', stereo: 'group' }], isLoading: false }));
const useSwitchPlace = jest.fn(() => ({ selectedPlaceId: 'site-1', switchPlace: jest.fn(), isSwitching: false }));

jest.mock('../hooks', () => ({
    useAddCloudFlow: () => ({ requestAddCloud: jest.fn(), addCloudDialog: null }),
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

beforeEach(() => jest.clearAllMocks());

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
