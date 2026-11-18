import { fireEvent, render, screen } from '@testing-library/react';

import { SettingsPage } from './SettingsPage';

const mockHaptic = jest.fn();
const setTheme = jest.fn();

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/shared', () => ({ getStoreUrl: () => undefined, useNavigateWithTransition: () => jest.fn() }));
// A browser tab: the page runs no app frame, as the `appShell` port says there.
jest.mock('@chatic/host', () => ({ host: { ports: { appShell: { kind: 'browser', os: null } } } }));
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useRuntimeProfile: () => ({ isGuest: false }),
            usePairingAwareLogout: () => ({ start: jest.fn() }),
        },
    },
}));
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
jest.mock('../../../bridge', () => ({ appBridge: {} }));
jest.mock('../../../bridge/haptics', () => ({ haptics: { play: (kind: string) => mockHaptic(kind) } }));
jest.mock('../../../hooks/useDeviceInfo', () => ({ useDeviceInfo: () => ({}) }));
jest.mock('../../../hooks/useDevicePairingEnabled', () => ({ useDevicePairingEnabled: () => false }));
jest.mock('../../../hooks', () => ({
    useOnboarding: () => ({ resetOnboarding: jest.fn() }),
    useTheme: () => ({ setTheme, isDarkTheme: false }),
}));
jest.mock('../../appUpdate', () => ({ useAppUpdateStatus: () => ({ updateAvailable: false }) }));
jest.mock('../../../ui/components', () => ({ PageHeader: () => null }));
jest.mock('../hooks', () => ({
    useAppIcon: () => ({ isSupported: false, currentIcon: null, availableIcons: [], currentIconLabel: '' }),
    useClearLocalCaches: () => ({ clearLocalCaches: jest.fn(), isClearing: false }),
    useLanguagePreference: () => ({ preference: 'system' }),
}));
jest.mock('../components', () => ({
    AppIconSelectSheet: () => null,
    LanguageSelectSheet: () => null,
    PairingLogoutDialog: () => null,
    LogoutDialog: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div role="dialog" /> : null),
}));

beforeEach(() => jest.clearAllMocks());

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
