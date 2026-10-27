import { StrictMode } from 'react';
import { useSyncExternalStore, type ReactNode } from 'react';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { runtime as Runtime } from '@chatic/app-runtime';

type PairingState = ReturnType<typeof Runtime.session.usePairingRequest>['state'];

const env = vi.hoisted(() => {
    let signedIn = false;
    const listeners = new Set<() => void>();
    return {
        relayUser: null as { userRole?: string } | null,
        pairing: { phase: 'requesting' } as unknown,
        usePairingRequest: vi.fn(),
        restart: vi.fn(),
        submit: vi.fn(),
        guestError: false,
        signOutGuest: vi.fn(),
        toast: vi.fn(),
        auth: {
            subscribe: (listener: () => void) => {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
            get: () => signedIn,
            set: (value: boolean) => {
                signedIn = value;
                listeners.forEach(listener => listener());
            },
        },
    };
});

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSessionAuth: () => ({
                isAuthenticated: useSyncExternalStore(env.auth.subscribe, env.auth.get, env.auth.get),
            }),
            getIdentityContext: () => ({ isAuthenticated: env.auth.get() }),
            getRelaySessionUser: () => env.relayUser,
            usePairingRequest: (...args: unknown[]) => {
                env.usePairingRequest(...args);
                return { state: env.pairing, restart: env.restart };
            },
            pairingClientOf: () => ({ name: 'Chrome · macOS', platform: 'macos' }),
        },
    },
}));
vi.mock('qrcode.react', () => ({
    QRCodeSVG: ({ value }: { value: string }) => <svg data-testid="pairing-qr" data-value={value} />,
}));
vi.mock('@chatic/ui-kit/components/ui/use-toast', async importOriginal => ({
    ...(await importOriginal<object>()),
    toast: env.toast,
}));
vi.mock('../../auth/components/AuthCard', () => ({
    AuthCard: ({ title, children, onBack }: { title: string; children: ReactNode; onBack?: () => void }) => (
        <div>
            {onBack && (
                <button type="button" onClick={onBack}>
                    back
                </button>
            )}
            <h1>{title}</h1>
            {children}
        </div>
    ),
}));
vi.mock('../../auth/hooks/useGuestLogin', () => ({
    useGuestLogin: () => ({ submit: env.submit, isSubmitting: false, isError: env.guestError }),
}));
vi.mock('../../auth/hooks/useSignOutGuest', () => ({ useSignOutGuest: () => env.signOutGuest }));

import '../../../../i18n';
import { usePairingCodePageStore } from '../stores/usePairingCodePageStore';
import { PairingCodePage } from './PairingCodePage';

const NOW = 1_000_000_000;

const renderPage = () =>
    render(
        <MemoryRouter initialEntries={['/auth/pair']}>
            <Routes>
                <Route path="/auth/pair" element={<PairingCodePage />} />
                <Route path="/" element={<p>home</p>} />
                <Route path="/auth/welcome" element={<p>welcome</p>} />
            </Routes>
        </MemoryRouter>
    );

/** Signed in as the guest this screen registered, as after the router's branch flip. */
const asRegisteredGuest = () => {
    env.auth.set(true);
    env.relayUser = { userRole: 'guest' };
    usePairingCodePageStore.getState().hold(true);
};

describe('PairingCodePage', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(NOW);
        vi.clearAllMocks();
        env.auth.set(false);
        env.relayUser = null;
        env.pairing = { phase: 'requesting' };
        env.guestError = false;
        usePairingCodePageStore.getState().release();
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
    });

    describe('signed out', () => {
        it('holds the page before it signs in as a guest, and asks for no code yet', () => {
            env.submit.mockImplementation(() => {
                expect(usePairingCodePageStore.getState()).toMatchObject({ held: true, registeredGuest: true });
                return Promise.resolve(true);
            });
            renderPage();

            expect(env.submit).toHaveBeenCalledTimes(1);
            expect(env.usePairingRequest).not.toHaveBeenCalled();
            expect(screen.getByText('Getting this browser ready…')).toBeTruthy();
        });

        it('asks for a code only once the guest session is there', () => {
            renderPage();
            expect(env.usePairingRequest).not.toHaveBeenCalled();

            act(() => {
                env.relayUser = { userRole: 'guest' };
                env.auth.set(true);
            });

            expect(env.usePairingRequest).toHaveBeenCalled();
            expect(env.submit).toHaveBeenCalledTimes(1);
        });

        it('offers a retry when the guest sign-in failed', () => {
            env.guestError = true;
            renderPage();

            expect(screen.getByRole('alert').textContent).toContain("Couldn't get this browser ready.");
            fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
            expect(env.submit).toHaveBeenCalledTimes(2);
        });

        it('goes back to Welcome and lets go of the page when left before signing in', () => {
            renderPage();

            fireEvent.click(screen.getByRole('button', { name: 'back' }));

            expect(screen.getByText('welcome')).toBeTruthy();
            expect(usePairingCodePageStore.getState().held).toBe(false);
            expect(env.signOutGuest).not.toHaveBeenCalled();
        });
    });

    it('turns away an account that is already signed in', () => {
        env.auth.set(true);
        env.relayUser = { userRole: 'user' };
        renderPage();

        expect(screen.getByText('home')).toBeTruthy();
        expect(env.usePairingRequest).not.toHaveBeenCalled();
    });

    it('shows the code in two groups, its QR of the bare digits, the time left and this browser', () => {
        asRegisteredGuest();
        env.pairing = { phase: 'waiting', code: '07344168', expiredAt: NOW + 125_000, pairingId: 'p-1' };
        renderPage();

        expect(screen.getByTestId('pairing-code').textContent).toBe('0734-4168');
        expect(screen.getByTestId('pairing-qr').getAttribute('data-value')).toBe('07344168');
        expect(screen.getByTestId('pairing-remaining').textContent).toBe('Expires in 2:05');
        expect(screen.getByText('Check that the approval screen in the app shows "Chrome · macOS".')).toBeTruthy();
    });

    it('strikes out an expired code and offers a new one', () => {
        asRegisteredGuest();
        env.pairing = { phase: 'expired', code: '07344168' };
        renderPage();

        expect(screen.getByTestId('pairing-code').className).toContain('line-through');
        expect(screen.getByText('This code has expired.')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Get a new code' }));
        expect(env.restart).toHaveBeenCalledTimes(1);
    });

    it.each([
        [{ phase: 'denied' }, 'The sign-in was declined.', 'Try again'],
        [{ phase: 'lost' }, "The sign-in couldn't finish. Please start over.", 'Start over'],
        [{ phase: 'failed', status: 403 }, "Couldn't get a code.", 'Try again'],
    ])('offers a fresh start when it ends %j', (state, message, action) => {
        asRegisteredGuest();
        env.pairing = state;
        renderPage();

        expect(screen.getByRole('alert').textContent).toBe(message);
        fireEvent.click(screen.getByRole('button', { name: action }));
        expect(env.restart).toHaveBeenCalledTimes(1);
    });

    it.each([{ phase: 'requesting' }, { phase: 'applying', target: { type: 'relay' } }])(
        'shows a spinner while %j',
        state => {
            asRegisteredGuest();
            env.pairing = state;
            renderPage();

            expect(screen.getByRole('status')).toBeTruthy();
            expect(screen.queryByTestId('pairing-code')).toBeNull();
        }
    );

    it('says which account a relay approval signed in as, then opens the app and lets go of the page', () => {
        asRegisteredGuest();
        env.pairing = { phase: 'done', target: { type: 'relay' }, approverName: 'developer' } satisfies PairingState;
        renderPage();

        expect(env.toast).toHaveBeenCalledTimes(1);
        expect(env.toast).toHaveBeenCalledWith({
            title: 'Signed in as developer',
            description: 'You can use your whole account in this browser. Closing the tab ends the sign-in.',
        });
        expect(screen.getByText('home')).toBeTruthy();
        expect(usePairingCodePageStore.getState().held).toBe(false);
    });

    it('says a cloud approval entered the cloud', () => {
        asRegisteredGuest();
        env.pairing = { phase: 'done', target: { type: 'cloud', cloudId: '1000002' } } satisfies PairingState;
        renderPage();

        expect(env.toast).toHaveBeenCalledWith({ title: "You're in the cloud that was approved." });
        expect(screen.getByText('home')).toBeTruthy();
    });

    it('signs out the guest it registered when left, rather than opening the app as that guest', async () => {
        asRegisteredGuest();
        env.pairing = { phase: 'waiting', code: '07344168', expiredAt: NOW + 60_000, pairingId: 'p-1' };
        let finishSignOut: () => void = () => undefined;
        env.signOutGuest.mockImplementation(() => new Promise<void>(resolve => (finishSignOut = resolve)));
        renderPage();

        fireEvent.click(screen.getByRole('button', { name: 'back' }));

        expect(env.signOutGuest).toHaveBeenCalledTimes(1);
        // Held while the sign-out runs, so the router does not open the app as the guest meanwhile.
        expect(usePairingCodePageStore.getState()).toMatchObject({ held: true, leaving: true });
        expect(screen.getByText('Going back…')).toBeTruthy();
        await act(async () => finishSignOut());
        expect(usePairingCodePageStore.getState().held).toBe(false);
    });

    it('undoes the same way when the page is left without its back button', async () => {
        asRegisteredGuest();
        env.pairing = { phase: 'waiting', code: '07344168', expiredAt: NOW + 60_000, pairingId: 'p-1' };
        env.signOutGuest.mockResolvedValue(undefined);
        const { unmount } = renderPage();

        unmount();
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        expect(env.signOutGuest).toHaveBeenCalledTimes(1);
        expect(usePairingCodePageStore.getState().held).toBe(false);
    });

    it('does not undo anything on a strict-mode remount', async () => {
        asRegisteredGuest();
        env.pairing = { phase: 'waiting', code: '07344168', expiredAt: NOW + 60_000, pairingId: 'p-1' };
        render(
            <StrictMode>
                <MemoryRouter initialEntries={['/auth/pair']}>
                    <Routes>
                        <Route path="/auth/pair" element={<PairingCodePage />} />
                    </Routes>
                </MemoryRouter>
            </StrictMode>
        );
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        expect(env.signOutGuest).not.toHaveBeenCalled();
        expect(usePairingCodePageStore.getState().held).toBe(true);
    });
});
