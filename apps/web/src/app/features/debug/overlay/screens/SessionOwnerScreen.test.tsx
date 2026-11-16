import '@testing-library/jest-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RESTART_WAIT_MS, SessionOwnerScreen } from './SessionOwnerScreen';
import { setDebugLanguageForTests } from '../../i18n';

const fetchSessionOwner = jest.fn();
const setSessionOwner = jest.fn();

jest.mock('../../../../bridge', () => ({
    appBridge: {
        fetchSessionOwner: () => fetchSessionOwner(),
        setSessionOwner: (owner: string) => setSessionOwner(owner),
    },
}));
jest.mock('@chatic/bridges', () => ({ logger: { warn: jest.fn(), info: jest.fn() } }));
const readLaunchSessionOwner = jest.fn();
jest.mock('../../../../runtime/launchSessionOwner', () => ({
    readLaunchSessionOwner: () => readLaunchSessionOwner(),
}));

const owners = (current: string, next: string) => Promise.resolve({ data: { current, next } });

describe('SessionOwnerScreen', () => {
    let restoreLanguage: () => void;

    beforeEach(() => {
        jest.clearAllMocks();
        fetchSessionOwner.mockImplementation(() => owners('web', 'web'));
        readLaunchSessionOwner.mockReturnValue(undefined);
        restoreLanguage = setDebugLanguageForTests('en');
    });

    afterEach(() => restoreLanguage());

    it('shows the owner of this run and of the next start', async () => {
        fetchSessionOwner.mockImplementation(() => owners('web', 'native'));
        render(<SessionOwnerScreen />);

        expect(await screen.findByText('This run')).toBeInTheDocument();
        expect(screen.getAllByText('Page (web)').length).toBeGreaterThan(0);
        expect(screen.getByRole('button', { name: 'App (native)' })).toHaveAttribute('aria-pressed', 'true');
        // The page has settled no owner here (outside the app), so there is no row for it.
        expect(screen.queryByText('This page')).not.toBeInTheDocument();
    });

    it('shows what this page settled, which tells a launch whose app runtime failed from one that mirrors it', async () => {
        fetchSessionOwner.mockImplementation(() => owners('native', 'native'));
        readLaunchSessionOwner.mockReturnValue('web');
        const { unmount } = render(<SessionOwnerScreen />);

        expect(await screen.findByText('This page')).toBeInTheDocument();
        expect(screen.getByText('Holds its own session')).toBeInTheDocument();
        unmount();

        readLaunchSessionOwner.mockReturnValue('native');
        render(<SessionOwnerScreen />);
        expect(await screen.findByText('Mirrors the app’s runtime')).toBeInTheDocument();
    });

    // The app decides whether the switch exists; a production build leaves both requests unanswered.
    it('says the switch is not offered when the app does not answer', async () => {
        fetchSessionOwner.mockRejectedValue(new Error('NOT_FOUND'));
        render(<SessionOwnerScreen />);

        expect(await screen.findByText(/does not offer the switch/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'App (native)' })).toBeNull();
    });

    it('asks the app to switch and says it is restarting', async () => {
        setSessionOwner.mockResolvedValue({ data: { next: 'native', restarting: true } });
        render(<SessionOwnerScreen />);

        await userEvent.click(await screen.findByRole('button', { name: 'App (native)' }));

        expect(setSessionOwner).toHaveBeenCalledWith('native');
        expect(await screen.findByText('Restarting the app…')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Page (web)' })).toBeDisabled();
    });

    // The app had nothing to reload: the screen must not stay locked on "restarting".
    it('reads the owners again when no restart came, and lets the recorded choice be pressed again', async () => {
        jest.useFakeTimers();
        try {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            setSessionOwner.mockResolvedValue({ data: { next: 'native', restarting: true } });
            render(<SessionOwnerScreen />);
            await user.click(await screen.findByRole('button', { name: 'App (native)' }));
            expect(await screen.findByText('Restarting the app…')).toBeInTheDocument();
            fetchSessionOwner.mockImplementation(() => owners('web', 'native'));

            act(() => {
                jest.advanceTimersByTime(RESTART_WAIT_MS);
            });

            await waitFor(() => expect(screen.queryByText('Restarting the app…')).toBeNull());
            expect(await screen.findByRole('button', { name: 'App (native)' })).toBeEnabled();
        } finally {
            jest.useRealTimers();
        }
    });

    it('reads the owners again when the switch needs no restart', async () => {
        fetchSessionOwner
            .mockImplementationOnce(() => owners('web', 'native'))
            .mockImplementation(() => owners('web', 'web'));
        setSessionOwner.mockResolvedValue({ data: { next: 'web', restarting: false } });
        render(<SessionOwnerScreen />);

        await userEvent.click(await screen.findByRole('button', { name: 'Page (web)' }));

        await waitFor(() => expect(fetchSessionOwner).toHaveBeenCalledTimes(2));
        expect(screen.queryByText('Restarting the app…')).toBeNull();
    });
});
