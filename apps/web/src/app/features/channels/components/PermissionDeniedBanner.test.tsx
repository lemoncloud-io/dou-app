import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

const mockOpenSettings = jest.fn();
let isNativeValue = true;

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/runtime-react', () => {
    const { browserAppShell, fakeRuntimeModule } = require('@chatic/runtime-react/testing');
    return fakeRuntimeModule({
        get appShell() {
            return {
                ...browserAppShell(),
                systemSettings: isNativeValue ? { open: () => mockOpenSettings() } : null,
            };
        },
    });
});
jest.mock('@chatic/web-ui-kit', () => ({
    IconChevronRight: () => <span />,
    IconDangerCircle: () => <span />,
}));

import { PermissionDeniedBanner } from './PermissionDeniedBanner';

beforeEach(() => {
    jest.clearAllMocks();
    isNativeValue = true;
});

describe('PermissionDeniedBanner', () => {
    it('names the tappable heading row after the settings action', () => {
        render(<PermissionDeniedBanner />);
        const row = screen.getByRole('button', { name: 'inviteFriends.permissionDenied.action' });
        expect(row).toHaveTextContent('inviteFriends.permissionDenied.title');
    });

    it('opens the OS settings when the heading row is tapped', () => {
        render(<PermissionDeniedBanner />);
        fireEvent.click(screen.getByRole('button', { name: 'inviteFriends.permissionDenied.action' }));
        expect(mockOpenSettings).toHaveBeenCalledTimes(1);
    });

    it('opens nothing where the host has no settings page of its own', () => {
        isNativeValue = false;
        render(<PermissionDeniedBanner />);
        fireEvent.click(screen.getByRole('button', { name: 'inviteFriends.permissionDenied.action' }));
        expect(mockOpenSettings).not.toHaveBeenCalled();
    });
});
