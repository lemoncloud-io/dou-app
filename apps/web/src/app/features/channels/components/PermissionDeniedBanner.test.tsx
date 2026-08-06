import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

const openSettings = jest.fn();
let isNativeValue = true;

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/bridges', () => ({ isNative: () => isNativeValue }));
jest.mock('../../../bridge', () => ({ appBridge: { openSettings } }));
jest.mock('@chatic/web-ui-kit', () => ({
    Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
    IconChevronRight: () => <span />,
}));

import { PermissionDeniedBanner } from './PermissionDeniedBanner';

beforeEach(() => {
    jest.clearAllMocks();
    isNativeValue = true;
});

describe('PermissionDeniedBanner', () => {
    it('opens the OS settings from its explicit call to action', () => {
        render(<PermissionDeniedBanner />);
        fireEvent.click(screen.getByText('inviteFriends.permissionDenied.action'));
        expect(openSettings).toHaveBeenCalledTimes(1);
    });

    it('does not reach the bridge off-device', () => {
        isNativeValue = false;
        render(<PermissionDeniedBanner />);
        fireEvent.click(screen.getByText('inviteFriends.permissionDenied.action'));
        expect(openSettings).not.toHaveBeenCalled();
    });
});
