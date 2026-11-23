import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const syncChannels = vi.fn(() => Promise.resolve({ syncedAt: 0, removedCount: 0 }));
const repositories = { channel: { syncChannels } };
const ids = { session: 'u1', relay: 'u1' as string | null };
vi.mock('@chatic/runtime', async () =>
    (await import('@chatic/runtime/testing')).fakeRuntimeModule({
        session: {
            useSessionIdentity: () => ({ userId: ids.session }),
            useUidInCloud: (cid: string) => (cid === 'default' ? ids.relay : null),
        },
        data: { useRuntimeRepositories: () => repositories },
    })
);

import { useOnboardingStore } from '../stores';
import { OnboardingDialog, SELF_CHANNEL_WAIT_MS } from './OnboardingDialog';

import '../../../../i18n';

const mount = ({ hasWorkspaces = true } = {}) =>
    render(<OnboardingDialog enabled showChannelStatus={false} isChannelReady={false} hasWorkspaces={hasWorkspaces} />);

describe('OnboardingDialog', () => {
    afterEach(() => {
        cleanup();
        localStorage.clear();
        useOnboardingStore.setState({ checkedFor: null, reopenRequested: false });
        ids.session = 'u1';
        ids.relay = 'u1';
    });

    it('stays closed in another cloud once the account has closed it', () => {
        const first = mount();
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        first.unmount();

        ids.session = 'uid-in-cloud-1';
        useOnboardingStore.setState({ checkedFor: null, reopenRequested: false });
        mount();

        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('opens for another account on the same device', () => {
        const first = mount();
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        first.unmount();

        ids.session = 'u2';
        ids.relay = 'u2';
        mount();

        expect(screen.getByRole('dialog')).toBeTruthy();
    });

    it('tells an account with Home alone how to join a workspace', () => {
        mount({ hasWorkspaces: false });
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));

        expect(
            screen.getByText('Have an invite? Choose “Join with invite” in your profile menu to join a cloud.')
        ).toBeTruthy();
        expect(screen.queryByText(/Pick a workspace/)).toBeNull();
    });

    it('explains the workspace and place columns to an account that has a workspace', () => {
        mount({ hasWorkspaces: true });
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));

        expect(screen.getByText('Pick a cloud at the far left, then one of its places beside it.')).toBeTruthy();
        expect(screen.queryByText(/Have an invite/)).toBeNull();
    });

    it('stays closed after a dismissal when the home screen remounts', () => {
        const first = mount();
        expect(screen.getByRole('dialog')).toBeTruthy();
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        first.unmount();

        mount();
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('opens once for a reopen from Settings, not on every later mount', () => {
        localStorage.setItem('chatic.desktop.onboarded:u1', '1');
        act(() => useOnboardingStore.getState().reopen());
        const first = mount();
        expect(screen.getByRole('dialog')).toBeTruthy();
        first.unmount();

        mount();
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});

describe('OnboardingDialog focus on close', () => {
    let composer: HTMLElement;
    beforeEach(() => {
        localStorage.clear();
        useOnboardingStore.setState({ checkedFor: null, reopenRequested: false });
        const main = document.createElement('main');
        composer = document.createElement('div');
        composer.setAttribute('data-composer-input', '');
        composer.tabIndex = 0;
        main.appendChild(composer);
        document.body.appendChild(main);
    });
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('hands focus to the room composer when closed with Escape', async () => {
        mount();
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

        await waitFor(() => expect(document.activeElement).toBe(composer));
    });

    it('hands focus to the room composer when closed with Done', async () => {
        mount();
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        fireEvent.click(screen.getByRole('button', { name: 'Start chatting' }));

        await waitFor(() => expect(document.activeElement).toBe(composer));
    });
});

describe('OnboardingDialog after a reload', () => {
    beforeEach(() => {
        localStorage.clear();
        useOnboardingStore.setState({ checkedFor: null, reopenRequested: false });
    });

    it('stays closed after the person closed it and the page reloaded', () => {
        const first = mount();
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        first.unmount();

        useOnboardingStore.setState({ checkedFor: null, reopenRequested: false });

        mount();
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});

describe('OnboardingDialog Self Channel row', () => {
    const mountHome = (isChannelReady: boolean) => (
        <OnboardingDialog enabled showChannelStatus isChannelReady={isChannelReady} hasWorkspaces={false} />
    );

    beforeEach(() => {
        vi.useFakeTimers();
        localStorage.clear();
        useOnboardingStore.setState({ checkedFor: null, reopenRequested: false });
        syncChannels.mockClear();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('says the channel did not load once the wait runs out, and offers a retry', () => {
        render(mountHome(false));
        expect(screen.getByRole('status').textContent).toBe('Setting up your Self Channel…');
        expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();

        act(() => vi.advanceTimersByTime(SELF_CHANNEL_WAIT_MS));

        expect(screen.getByRole('status').textContent).toBe("Couldn't load your Self Channel.");
        expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    });

    it('asks for the channels again on retry and waits afresh', () => {
        render(mountHome(false));
        act(() => vi.advanceTimersByTime(SELF_CHANNEL_WAIT_MS));

        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

        expect(syncChannels).toHaveBeenCalledWith(0);
        expect(screen.getByRole('status').textContent).toBe('Setting up your Self Channel…');
        act(() => vi.advanceTimersByTime(SELF_CHANNEL_WAIT_MS));
        expect(screen.getByRole('status').textContent).toBe("Couldn't load your Self Channel.");
    });

    it('shows the failure at once when the retry sync fails', async () => {
        syncChannels.mockRejectedValueOnce(new Error('offline'));
        render(mountHome(false));
        act(() => vi.advanceTimersByTime(SELF_CHANNEL_WAIT_MS));

        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

        expect(screen.getByRole('status').textContent).toBe('Setting up your Self Channel…');
        await act(async () => {
            await Promise.resolve();
        });

        expect(screen.getByRole('status').textContent).toBe("Couldn't load your Self Channel.");
        expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    });

    it('turns ready when the channel arrives after the wait ran out', () => {
        const view = render(mountHome(false));
        act(() => vi.advanceTimersByTime(SELF_CHANNEL_WAIT_MS));

        view.rerender(mountHome(true));

        expect(screen.getByRole('status').textContent).toBe('Your Self Channel is ready.');
        expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    });

    it('keeps waiting while the channel arrives within the window', () => {
        const view = render(mountHome(false));
        act(() => vi.advanceTimersByTime(SELF_CHANNEL_WAIT_MS - 1000));
        view.rerender(mountHome(true));
        act(() => vi.advanceTimersByTime(SELF_CHANNEL_WAIT_MS));

        expect(screen.getByRole('status').textContent).toBe('Your Self Channel is ready.');
    });
});
