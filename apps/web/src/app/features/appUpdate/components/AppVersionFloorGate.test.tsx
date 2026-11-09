import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { AppVersionFloorGate } from './AppVersionFloorGate';

const mockOpenStore = jest.fn();
const mockRelease = jest.fn();
const mockInfo = jest.fn();

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@chatic/bridges', () => ({
    ...jest.requireActual('@chatic/bridges'),
    logger: { info: (...args: unknown[]) => mockInfo(...args), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../../bridge', () => ({ appBridge: { openStore: () => mockOpenStore() } }));
jest.mock('../../../runtime/bootSplash', () => ({ bootSplash: { release: (reason: string) => mockRelease(reason) } }));

const shell = (platform: string | undefined, version: string | undefined) => {
    window.CHATIC_APP_PLATFORM = platform;
    window.CHATIC_APP_CURRENT_VERSION = version;
};

describe('AppVersionFloorGate', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        shell(undefined, undefined);
    });

    it('renders the app for a phone app at the floor or above', () => {
        shell('ios', '0.31.2');
        render(<AppVersionFloorGate>app</AppVersionFloorGate>);

        expect(screen.getByText('app')).toBeInTheDocument();
        expect(screen.queryByText('appUpdate.required.title')).not.toBeInTheDocument();
        expect(mockInfo).not.toHaveBeenCalled();
    });

    it('renders the app in a browser', () => {
        render(<AppVersionFloorGate>app</AppVersionFloorGate>);
        expect(screen.getByText('app')).toBeInTheDocument();
    });

    it('shows only the update screen for a phone app below the floor, and lifts the boot cover', () => {
        shell('android', '0.29.2');
        render(<AppVersionFloorGate>app</AppVersionFloorGate>);

        expect(screen.queryByText('app')).not.toBeInTheDocument();
        expect(screen.getByText('appUpdate.required.title')).toBeInTheDocument();
        expect(mockRelease).toHaveBeenCalledWith('first-screen');
        expect(mockInfo).toHaveBeenCalledWith('VERSION', expect.stringContaining('below the version floor'), {
            platform: 'android',
            version: '0.29.2',
        });
    });

    it('sends the update button to the store', () => {
        shell('ios', '0.28.1');
        render(<AppVersionFloorGate>app</AppVersionFloorGate>);

        fireEvent.click(screen.getByRole('button', { name: 'appUpdate.update' }));
        expect(mockOpenStore).toHaveBeenCalledTimes(1);
    });
});
