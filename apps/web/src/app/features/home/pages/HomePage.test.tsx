import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';

import { HomePage } from './HomePage';

// This suite covers ONE thing: how HomePage branches on relay vs cloud (ADR-0034). Children are
// stubbed to markers so the assertions are about which sections mount, not their internals.

let selectedCloudId: string | null = 'default';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => jest.fn() }));
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

jest.mock('../../../hooks', () => ({
    useMyProfile: () => ({ profile: { nick: 'me' } }),
    useUserPermissions: () => ({ canCreatePlace: true }),
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
    CloudPromoBanner: () => <div data-testid="promo-banner" />,
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
    useActiveCloudChannels: () => [],
    useAddCloudFlow: () => ({ requestAddCloud: jest.fn(), addCloudDialog: null }),
    useCachedCloudNames: () => ({}),
    useChannelUnreads: () => ({ byChannel: {}, byPlace: {} }),
    useHomeChannels: () => ({ channels: [], isLoading: false }),
    useHomePlaces: (...args: unknown[]) => useHomePlaces(...(args as [])),
    useInvitedClouds: () => ({ invitedClouds: [] }),
    useMyJoins: () => new Map(),
    useScrollRestoration: () => ({ containerRef: { current: null }, onScroll: jest.fn() }),
    useSwitchPlace: (...args: unknown[]) => useSwitchPlace(...(args as [])),
}));
jest.mock('../lib', () => ({ resolveHeaderProfile: () => ({ kind: 'site', name: 'me' }) }));

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
