import { fireEvent, render, screen } from '@testing-library/react';

import { SettingsPage } from './SettingsPage';

const mockHaptic = jest.fn();
const setTheme = jest.fn();

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/shared', () => ({
    ...jest.requireActual('@chatic/shared'),
    useNavigateWithTransition: () => jest.fn(),
}));
// A browser tab by default: the frame checks no store, as the `appShell` port says there. A test that
// needs the phone app's store lays `storeUpdate` on it.
const mockOpenStore = jest.fn();
let mockStoreUpdate = false;
jest.mock('@chatic/runtime', () => {
    const { browserAppShell, fakeRuntimeModule } = require('@chatic/runtime/testing');
    return fakeRuntimeModule({
        session: {
            useRuntimeProfile: () => ({ isGuest: false }),
            usePairingAwareLogout: () => ({ start: jest.fn() }),
        },
        get appShell() {
            const storeUpdate = { check: jest.fn(), openStore: mockOpenStore };
            return { ...browserAppShell(), storeUpdate: mockStoreUpdate ? storeUpdate : null };
        },
    });
});
jest.mock('@chatic/web-ui-kit', () => ({
    IconChevronRight: () => null,
    IconSpinner: () => null,
    MenuCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    ListRow: ({ title, trailing, onClick }: { title: string; trailing?: React.ReactNode; onClick?: () => void }) => (
        <div>
            <button type="button" onClick={onClick}>
                {title}
            </button>
            {trailing}
        </div>
    ),
    Switch: ({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (on: boolean) => void }) => (
        <button type="button" role="switch" aria-checked={checked} onClick={() => onCheckedChange(!checked)} />
    ),
}));
jest.mock('../../../bridge/haptics', () => ({ haptics: { play: (kind: string) => mockHaptic(kind) } }));
let mockPlatform: string | undefined;
jest.mock('../../../hooks/useDeviceInfo', () => ({
    useDeviceInfo: () => ({ deviceInfo: mockPlatform ? { platform: mockPlatform } : undefined }),
}));
jest.mock('../../../hooks/useDevicePairingEnabled', () => ({ useDevicePairingEnabled: () => false }));
jest.mock('../../../hooks', () => ({
    useOnboarding: () => ({ resetOnboarding: jest.fn() }),
    useTheme: () => ({ setTheme, isDarkTheme: false }),
}));
let mockUpdateAvailable = false;
jest.mock('../../appUpdate', () => ({ useAppUpdateStatus: () => ({ updateAvailable: mockUpdateAvailable }) }));
jest.mock('../../../ui/components', () => ({ PageHeader: () => null }));
let mockIconSupported = false;
jest.mock('../hooks', () => ({
    useAppIcon: () => ({ isSupported: mockIconSupported, currentIcon: null, availableIcons: [], currentIconLabel: '' }),
    useClearLocalCaches: () => ({ clearLocalCaches: jest.fn(), isClearing: false }),
    useLanguagePreference: () => ({ preference: 'system' }),
}));
jest.mock('../components', () => ({
    AppIconSelectSheet: () => null,
    LanguageSelectSheet: () => null,
    PairingLogoutDialog: () => null,
    LogoutDialog: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div role="dialog" /> : null),
}));

beforeEach(() => {
    jest.clearAllMocks();
    mockStoreUpdate = false;
    mockPlatform = undefined;
    mockUpdateAvailable = false;
    mockIconSupported = false;
});

describe('SettingsPage — haptics', () => {
    it('ticks as dark mode flips, and switches the theme', () => {
        render(<SettingsPage />);
        fireEvent.click(screen.getByRole('switch'));

        expect(setTheme).toHaveBeenCalledWith('dark');
        expect(mockHaptic.mock.calls).toEqual([['selection']]);
    });

    it('warns as the logout confirm opens', () => {
        render(<SettingsPage />);
        expect(screen.queryByRole('dialog')).toBeNull();

        fireEvent.click(screen.getByText('mypage.logout'));

        expect(screen.getByRole('dialog')).toBeTruthy();
        expect(mockHaptic.mock.calls).toEqual([['warning']]);
    });
});

describe('SettingsPage — the version row', () => {
    it('opens the store listing through the frame that found the newer build', () => {
        mockStoreUpdate = true;
        mockPlatform = 'ios';
        mockUpdateAvailable = true;
        render(<SettingsPage />);

        fireEvent.click(screen.getByText('mypage.appVersion'));

        expect(mockOpenStore).toHaveBeenCalledTimes(1);
    });

    it('goes nowhere while no update is pending', () => {
        mockStoreUpdate = true;
        mockPlatform = 'ios';
        render(<SettingsPage />);

        fireEvent.click(screen.getByText('mypage.appVersion'));

        expect(mockOpenStore).not.toHaveBeenCalled();
    });
});

describe('SettingsPage — the app icon row', () => {
    it('shows once the frame says this device can change its icon', () => {
        mockIconSupported = true;
        render(<SettingsPage />);

        expect(screen.getByText('mypage.appIconSettings')).toBeTruthy();
    });

    it('stays hidden where the icon cannot be changed', () => {
        render(<SettingsPage />);

        expect(screen.queryByText('mypage.appIconSettings')).toBeNull();
    });
});
