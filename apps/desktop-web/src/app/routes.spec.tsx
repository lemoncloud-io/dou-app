import { useSyncExternalStore } from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as BridgesModule from '@chatic/bridges';

/** The session signal the router reads, flipped by the fake login the way a guest login flips it. */
const session = (() => {
    const snapshots = { in: { isAuthenticated: true }, out: { isAuthenticated: false } };
    let current = snapshots.out;
    const listeners = new Set<() => void>();
    return {
        subscribe: (listener: () => void) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        get: () => current,
        set: (signedIn: boolean) => {
            current = signedIn ? snapshots.in : snapshots.out;
            listeners.forEach(listener => listener());
        },
    };
})();

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSessionAuth: () => useSyncExternalStore(session.subscribe, session.get, session.get),
        },
    },
}));
vi.mock('@chatic/bridges', async () => ({
    ...(await vi.importActual<typeof BridgesModule>('@chatic/bridges')),
    isNative: () => false,
}));
vi.mock('./features/chat', () => ({
    HomePage: () => <p>home page</p>,
    ShortcutsDialog: () => null,
}));
vi.mock('./features/account', () => ({
    AccountHubPage: () => <p>account page</p>,
}));
vi.mock('./features/auth/components/OAuthDeeplinkListener', () => ({ OAuthDeeplinkListener: () => null }));
vi.mock('./features/auth/components/SignInNotice', () => ({ SignInNotice: () => <p>sign-in notice</p> }));
vi.mock('./features/auth/pages/WelcomePage', () => ({ WelcomePage: () => <p>welcome page</p> }));

const pairing = vi.hoisted(() => ({ enabled: true }));
vi.mock('./features/pairing/utils/devicePairing', () => ({
    isDevicePairingEnabled: () => pairing.enabled,
    canRequestPairing: () => pairing.enabled,
}));
vi.mock('./features/pairing/pages/PairingCodePage', () => ({ PairingCodePage: () => <p>pairing page</p> }));
vi.mock('./features/pairing/pages/PairingApprovePage', () => ({ PairingApprovePage: () => <p>approve page</p> }));
vi.mock('./features/pairing/pages/DevicesPage', () => ({ DevicesPage: () => <p>devices page</p> }));

const login = vi.fn();
vi.mock('./features/auth/hooks/useInviteLogin', () => ({ useInviteLogin: () => ({ login }) }));

import '../i18n';
import { useInviteLoginPageStore } from './features/auth/stores/useInviteLoginPageStore';
import { useJoinDialogStore } from './features/auth/stores/useJoinDialogStore';
import { useOAuthAttemptStore } from './features/auth/stores/useOAuthAttemptStore';
import { usePairingCodePageStore } from './features/pairing/stores/usePairingCodePageStore';
import { AppRouter } from './routes';

/** The exchange needs a guest session, so a real attempt signs in before the code is judged. */
const signInThen = (result: unknown) => async () => {
    session.set(true);
    await Promise.resolve();
    return result;
};

/** The routes are lazy chunks; under a loaded full-suite run they can take longer than the 1s default. */
const WAIT = { timeout: 5000 };

const submitCode = async (code: string) => {
    fireEvent.change(await screen.findByRole('textbox', {}, WAIT), { target: { value: code } });
    await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    });
};

// Signed out, a bad code used to land the person on Home: the guest login flipped the router
// to its signed-in branch, whose `/auth/*` redirect unmounted the page and its error with it.
describe('AppRouter signed-out invite attempt', () => {
    beforeAll(async () => {
        await Promise.all([import('./features/auth'), import('./features/chat')]);
    });
    beforeEach(() => {
        window.history.pushState({}, '', '/auth/login');
    });
    afterEach(() => {
        session.set(false);
        useInviteLoginPageStore.getState().release();
        vi.clearAllMocks();
    });

    it('keeps the invite page and shows why a code was rejected after the guest sign-in', async () => {
        login.mockImplementation(signInThen({ kind: 'server', message: '400 INVALID - code is invalid (not-found)' }));
        await act(async () => {
            render(<AppRouter />);
        });

        await submitCode('invt:abc');

        expect((await screen.findByRole('alert', {}, WAIT)).textContent).toContain("That invite code isn't valid.");
        expect(window.location.pathname).toBe('/auth/login');
        expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('invt:abc');
        expect(screen.queryByText('home page')).toBeNull();
    });

    it('goes Home once the code is accepted', async () => {
        login.mockImplementation(signInThen(null));
        await act(async () => {
            render(<AppRouter />);
        });

        await submitCode('invt:good');

        expect(await screen.findByText('home page', {}, WAIT)).toBeTruthy();
        expect(window.location.pathname).toBe('/');
        expect(useInviteLoginPageStore.getState().held).toBe(false);
    });

    it('does not route a signed-in person to the invite page without an attempt in progress', async () => {
        session.set(true);
        await act(async () => {
            render(<AppRouter />);
        });

        expect(await screen.findByText('home page', {}, WAIT)).toBeTruthy();
        expect(window.location.pathname).toBe('/');
    });

    // The notice is taken from storage when it mounts: signed out, it must wait for the account.
    it('says what a sign-in landed as only once signed in', async () => {
        await act(async () => {
            render(<AppRouter />);
        });
        await screen.findByRole('textbox', {}, WAIT);
        expect(screen.queryByText('sign-in notice')).toBeNull();

        await act(async () => session.set(true));

        expect(await screen.findByText('sign-in notice', {}, WAIT)).toBeTruthy();
    });
});

// A guest taps "join with invite" on the Account hub and nothing happens there: the
// dialog lives on the home route only, so it pops up later on return to chat. It is
// mounted beside ShortcutsDialog instead, and the home mount goes away with it.
describe('AppRouter join dialog', () => {
    beforeAll(async () => {
        await Promise.all([import('./features/auth'), import('./features/chat')]);
    });
    beforeEach(() => {
        window.history.pushState({}, '', '/account');
        session.set(true);
    });
    afterEach(() => {
        session.set(false);
        useJoinDialogStore.getState().close();
    });

    it('opens the join dialog on /account when the store is open', async () => {
        await act(async () => {
            render(<AppRouter />);
        });
        await screen.findByText('account page', {}, WAIT);

        act(() => useJoinDialogStore.getState().open());

        expect(await screen.findByRole('dialog', {}, WAIT)).toBeTruthy();
    });

    it('shows exactly one join dialog on /', async () => {
        window.history.pushState({}, '', '/');
        await act(async () => {
            render(<AppRouter />);
        });
        await screen.findByText('home page', {}, WAIT);

        act(() => useJoinDialogStore.getState().open());

        await screen.findByRole('dialog', {}, WAIT);
        expect(screen.getAllByRole('dialog')).toHaveLength(1);
    });

    it('takes the dialog down with the sign-out', async () => {
        await act(async () => {
            render(<AppRouter />);
        });
        await screen.findByText('account page', {}, WAIT);

        act(() => useJoinDialogStore.getState().open());
        await screen.findByRole('dialog', {}, WAIT);

        await act(async () => session.set(false));

        expect(screen.queryByRole('dialog')).toBeNull();
    });
});
// Starting Google from Welcome registers the device first, which flips the router to its signed-in
// branch while the browser is still open; Welcome has to stay for the attempt.
describe('AppRouter signed-out Google attempt', () => {
    beforeAll(async () => {
        await Promise.all([import('./features/auth'), import('./features/chat')]);
    });
    beforeEach(() => {
        window.history.pushState({}, '', '/auth/welcome');
    });
    afterEach(() => {
        session.set(false);
        useOAuthAttemptStore.getState().clear();
    });

    it('keeps Welcome after the registration signs the device in', async () => {
        useOAuthAttemptStore.getState().begin({ provider: 'google', intent: 'login', signedOutAtStart: true });
        session.set(true);
        await act(async () => {
            render(<AppRouter />);
        });

        expect(await screen.findByText('welcome page', {}, WAIT)).toBeTruthy();
        expect(window.location.pathname).toBe('/auth/welcome');
    });

    it('opens the app once the attempt is over', async () => {
        useOAuthAttemptStore.getState().begin({ provider: 'google', intent: 'login', signedOutAtStart: true });
        session.set(true);
        await act(async () => {
            render(<AppRouter />);
        });
        await screen.findByText('welcome page', {}, WAIT);

        act(() => useOAuthAttemptStore.getState().clear());

        expect(await screen.findByText('home page', {}, WAIT)).toBeTruthy();
    });

    it('keeps nothing for a sign-in begun by someone already signed in', async () => {
        useOAuthAttemptStore.getState().begin({ provider: 'google', intent: 'login', signedOutAtStart: false });
        session.set(true);
        await act(async () => {
            render(<AppRouter />);
        });

        expect(await screen.findByText('home page', {}, WAIT)).toBeTruthy();
    });
});

// The code screen signs in as a guest before it asks for a code, which flips the router to its signed-in
// branch mid-flow; the hold keeps `/auth/pair` there, and nothing else does.
describe('AppRouter device pairing', () => {
    beforeAll(async () => {
        await Promise.all([import('./features/pairing'), import('./features/chat')]);
    });
    beforeEach(() => {
        pairing.enabled = true;
        window.history.pushState({}, '', '/auth/pair');
    });
    afterEach(() => {
        session.set(false);
        usePairingCodePageStore.getState().release();
    });

    it('opens the code screen signed out', async () => {
        await act(async () => {
            render(<AppRouter />);
        });

        expect(await screen.findByText('pairing page', {}, WAIT)).toBeTruthy();
    });

    it('keeps the code screen once its guest sign-in flips the router, while it is held', async () => {
        usePairingCodePageStore.getState().hold(true);
        session.set(true);
        await act(async () => {
            render(<AppRouter />);
        });

        expect(await screen.findByText('pairing page', {}, WAIT)).toBeTruthy();
        expect(window.location.pathname).toBe('/auth/pair');
    });

    it('sends a signed-in session home from the code screen when nothing holds it', async () => {
        session.set(true);
        await act(async () => {
            render(<AppRouter />);
        });

        expect(await screen.findByText('home page', {}, WAIT)).toBeTruthy();
    });

    it('routes nothing of the feature while the flag is off', async () => {
        pairing.enabled = false;
        await act(async () => {
            render(<AppRouter />);
        });
        expect(await screen.findByText('welcome page', {}, WAIT)).toBeTruthy();
    });

    it.each([
        ['/settings/pairing/approve', 'approve page'],
        ['/account/devices', 'devices page'],
    ])('routes %s for a signed-in session', async (path, text) => {
        window.history.pushState({}, '', path);
        session.set(true);
        await act(async () => {
            render(<AppRouter />);
        });

        expect(await screen.findByText(text, {}, WAIT)).toBeTruthy();
    });
});
