import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

const openSettings = jest.fn();
let isNativeValue = true;

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
// Who picks, as the host's media port says: the app when the case runs in the app.
jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({
        get media() {
            return { kind: isNativeValue ? 'shell' : 'browser' };
        },
    })
);
jest.mock('../../../bridge', () => ({ appBridge: { openSettings } }));
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
        // The row replaced a labelled button, so the accessible name has to survive the change.
        const row = screen.getByRole('button', { name: 'inviteFriends.permissionDenied.action' });
        expect(row).toHaveTextContent('inviteFriends.permissionDenied.title');
    });

    it('opens the OS settings when the heading row is tapped', () => {
        render(<PermissionDeniedBanner />);
        fireEvent.click(screen.getByRole('button', { name: 'inviteFriends.permissionDenied.action' }));
        expect(openSettings).toHaveBeenCalledTimes(1);
    });

    it('does not reach the bridge off-device', () => {
        isNativeValue = false;
        render(<PermissionDeniedBanner />);
        fireEvent.click(screen.getByRole('button', { name: 'inviteFriends.permissionDenied.action' }));
        expect(openSettings).not.toHaveBeenCalled();
    });
});
