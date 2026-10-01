import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const syncChannels = vi.fn(() => Promise.resolve({ syncedAt: 0, removedCount: 0 }));
const repositories = { channel: { syncChannels } };
// Every cloud gives the account its own uid; the relay's is the one it keeps everywhere.
const ids = { session: 'u1', relay: 'u1' as string | null };
vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSessionIdentity: () => ({ userId: ids.session }),
            useUidInCloud: (cid: string) => (cid === 'default' ? ids.relay : null),
        },
        data: { useRuntimeRepositories: () => repositories },
    },
}));

import { useOnboardingStore } from '../stores';
import { OnboardingDialog, SELF_CHANNEL_WAIT_MS } from './OnboardingDialog';

// Initialises i18next so the dialog copy resolves.
import '../../../../i18n';

const mount = ({ hasWorkspaces = true } = {}) =>
    render(<OnboardingDialog enabled showChannelStatus={false} isChannelReady={false} hasWorkspaces={hasWorkspaces} />);

describe('OnboardingDialog', () => {
    afterEach(() => {
        // A dialog left mounted re-runs its first-run check when the store resets below.
        cleanup();
        localStorage.clear();
        useOnboardingStore.setState({ checkedFor: null, reopenRequested: false });
        ids.session = 'u1';
        ids.relay = 'u1';
    });

    // The flag was keyed by the session uid, which is a different one in every cloud, so the tips
    // opened again on the first visit to each workspace.
    it('stays closed in another cloud once the account has closed it', () => {
        const first = mount();
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        first.unmount();

        // The switch commits: the session now answers with this cloud's uid, the relay's is unchanged.
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

    // A guest on Home has no workspace or place to pick, so explaining those columns taught nothing;
    // how to join one is what helps.
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

    // The home screen remounts on every return from Profile; closed tips came back each time.
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

// The dialog opens from state with nothing focused, so it has no opener to return to: closing it
// dropped focus on <body> and the next Tab started from the top of the page.
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

// A dismissal used to survive only in memory, so every page reload — the wedge
// self-heal after sleep, a restart, a manual refresh — brought the tips back.
describe('OnboardingDialog after a reload', () => {
    // A page load starts with empty stores and whatever localStorage kept, so the
    // precondition is set here rather than inherited from the suite above.
    beforeEach(() => {
        localStorage.clear();
        useOnboardingStore.setState({ checkedFor: null, reopenRequested: false });
    });

    it('stays closed after the person closed it and the page reloaded', () => {
        const first = mount();
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        first.unmount();

        // A reload keeps localStorage and drops every in-memory store.
        useOnboardingStore.setState({ checkedFor: null, reopenRequested: false });

        mount();
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});

// A new account on Home waits on its Self Channel. When the list dropped that channel the row spun
// for as long as anyone watched, with nothing to do about it.
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
