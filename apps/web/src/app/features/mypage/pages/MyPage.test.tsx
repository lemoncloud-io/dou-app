import { fireEvent, render, screen } from '@testing-library/react';

import { MyPage } from './MyPage';

const navigate = jest.fn();
let mockNative = true;
let mockPaired = false;
let mockPairingEnabled = true;
let mockGuest = false;

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
jest.mock('@chatic/bridges', () => ({ isNative: () => mockNative }));
jest.mock('@chatic/app-runtime', () => ({ runtime: { session: { useIsPairedSession: () => mockPaired } } }));
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
jest.mock('../../../hooks', () => ({ useIsAccountGuest: () => mockGuest, useMyUser: () => ({ name: 'me' }) }));
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

    it('is there for a guest too — a guest app can approve its clouds', () => {
        mockGuest = true;
        render(<MyPage />);

        expect(screen.queryByText('pairing.entry.approve')).not.toBeNull();
    });

    it.each([
        ['in a browser', () => (mockNative = false)],
        ['on a secondary device', () => (mockPaired = true)],
        ['with the flag off', () => (mockPairingEnabled = false)],
    ])('is hidden %s', (_label, arrange) => {
        arrange();
        render(<MyPage />);

        expect(screen.queryByText('pairing.entry.approve')).toBeNull();
    });
});
