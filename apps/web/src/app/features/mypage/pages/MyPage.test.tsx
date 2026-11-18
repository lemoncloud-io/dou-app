import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { MyPage } from './MyPage';

const navigate = jest.fn();
let mockNative = true;
let mockPaired = false;
let mockPairingEnabled = true;
let mockGuest = false;

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
// Who signs a person in, as the host's `signIn` port says.
jest.mock('@chatic/host', () => ({
    host: {
        get ports() {
            return { signIn: { kind: mockNative ? 'shell' : 'browser', os: null } };
        },
    },
}));
jest.mock('@chatic/runtime', () => ({ runtime: { session: { useIsPairedSession: () => mockPaired } } }));
jest.mock('@chatic/config/react', () => ({
    useConfigValue: (key: string) => (key === 'feature.auth.devicePairing' ? mockPairingEnabled : undefined),
}));
jest.mock('@chatic/web-ui-kit', () => ({
    DefaultAvatar: () => null,
    IconChevronRight: () => null,
    IconSettings: () => null,
    IconUserOutline: () => null,
    MenuCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    ListRow: ({ title, onClick }: { title: string; onClick?: () => void }) => (
        <button type="button" onClick={onClick}>
            {title}
        </button>
    ),
}));
jest.mock('../../../ui/components', () => ({ BottomNavSpacer: () => null }));
jest.mock('../../../hooks', () => ({
    useIsAccountGuest: () => mockGuest,
    useMyUser: () => ({ name: 'me' }),
    useScrollChrome: jest.requireActual('../../../hooks/useScrollChrome').useScrollChrome,
}));
jest.mock('../../auth/hooks', () => ({ useNavigateToLogin: () => jest.fn() }));

beforeEach(() => {
    jest.clearAllMocks();
    mockNative = true;
    mockPaired = false;
    mockPairingEnabled = true;
    mockGuest = false;
});

describe('MyPage — web sign-in approval entry', () => {
    it('opens the approval screen inside the app', () => {
        render(<MyPage />);

        fireEvent.click(screen.getByText('pairing.entry.approve'));
        expect(navigate).toHaveBeenCalledWith('/mypage/pairing/approve');
    });

    it.each([
        ['in a browser', () => (mockNative = false)],
        ['on a secondary device', () => (mockPaired = true)],
        ['on a guest app', () => (mockGuest = true)],
        ['with the flag off', () => (mockPairingEnabled = false)],
    ])('is hidden %s', (_label, arrange) => {
        arrange();
        render(<MyPage />);

        expect(screen.queryByText('pairing.entry.approve')).toBeNull();
    });
});

describe('MyPage — devices entry', () => {
    it('opens device management for an account', () => {
        render(<MyPage />);

        fireEvent.click(screen.getByText('pairing.entry.devices'));
        expect(navigate).toHaveBeenCalledWith('/mypage/devices');
    });

    it('is there for a guest app, and not for a guest browser', () => {
        mockGuest = true;
        const { unmount } = render(<MyPage />);
        expect(screen.queryByText('pairing.entry.devices')).not.toBeNull();
        unmount();

        mockNative = false;
        render(<MyPage />);
        expect(screen.queryByText('pairing.entry.devices')).toBeNull();
    });
});

describe('MyPage — subscription entry', () => {
    it('opens the subscription list for an account', () => {
        render(<MyPage />);

        fireEvent.click(screen.getByText('mypage.subscription.hubEntry'));
        expect(navigate).toHaveBeenCalledWith('/subscription');
    });

    it('is there for a guest browser, which the website signs in itself, and not for a guest app', () => {
        mockGuest = true;
        mockNative = false;
        const { unmount } = render(<MyPage />);
        expect(screen.queryByText('mypage.subscription.hubEntry')).not.toBeNull();
        unmount();

        mockNative = true;
        render(<MyPage />);
        expect(screen.queryByText('mypage.subscription.hubEntry')).toBeNull();
    });
});

describe('MyPage — secondary device', () => {
    it('says this app is signed in through another device', () => {
        mockPaired = true;
        render(<MyPage />);

        expect(screen.getByTestId('mypage-secondary-device').textContent).toBe('pairing.secondary.notice');
    });

    it('says nothing on an ordinary sign-in or in a browser', () => {
        const { unmount } = render(<MyPage />);
        expect(screen.queryByTestId('mypage-secondary-device')).toBeNull();
        unmount();

        mockPaired = true;
        mockNative = false;
        render(<MyPage />);
        expect(screen.queryByTestId('mypage-secondary-device')).toBeNull();
    });
});

describe('MyPage — header as the cards scroll', () => {
    it('steps the title down and draws the divider once the cards move, and undoes both at the top', () => {
        const { container } = render(<MyPage />);
        const title = screen.getByRole('heading', { level: 1 });
        const header = container.querySelector('header') as HTMLElement;
        const page = container.querySelector('.overflow-y-auto') as HTMLElement;

        expect(title).toHaveAttribute('data-compact', 'false');
        expect(header).toHaveClass('border-transparent');

        page.scrollTop = 40;
        fireEvent.scroll(page);
        expect(title).toHaveAttribute('data-compact', 'true');
        expect(header).toHaveClass('border-input-border');

        page.scrollTop = 0;
        fireEvent.scroll(page);
        expect(title).toHaveAttribute('data-compact', 'false');
        expect(header).toHaveClass('border-transparent');
    });
});
