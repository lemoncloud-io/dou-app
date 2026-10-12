import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
    isAuthenticated: false,
    loginGuest: vi.fn(),
    startWebTransportInit: vi.fn(),
    createCredentialsByProvider: vi.fn(),
    toast: vi.fn(),
    warn: vi.fn(),
    user: null as Record<string, unknown> | null,
    verifySocialAccount: vi.fn(),
    confirmSocialAccount: vi.fn(),
    patchRelaySessionUser: vi.fn(),
    signOutGuest: vi.fn(),
}));

vi.mock('@chatic/bridges', () => ({ isNative: () => true, logger: { error: vi.fn(), warn: session.warn } }));
vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        boot: { startWebTransportInit: session.startWebTransportInit },
        data: {
            useRuntimeRepositories: () => ({
                auth: {
                    verifySocialAccount: session.verifySocialAccount,
                    confirmSocialAccount: session.confirmSocialAccount,
                },
            }),
        },
        session: {
            getRelaySessionUser: () => session.user,
            patchRelaySessionUser: session.patchRelaySessionUser,
            getIdentityContext: () => ({ isAuthenticated: session.isAuthenticated }),
            createCredentialsByProvider: session.createCredentialsByProvider,
            useDynamicDeviceId: () => ({ deviceId: 'device-1' }),
            useLoginRelayGuestByDevice: () => ({ mutateAsync: session.loginGuest }),
        },
    },
}));
vi.mock('./useSignOutGuest', () => ({ useSignOutGuest: () => session.signOutGuest }));
vi.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: session.toast }));
vi.mock('@chatic/config', () => ({
    config: { get: (key: string) => (key === 'net.socialOauth.endpoint' ? 'https://relay.example' : undefined) },
}));

import i18n from '../../../../i18n';
import { setStorageAdapter } from '@chatic/shared';

import { OAUTH_LOGIN_START_TTL_MS, saveOAuthLoginStart, takeOAuthLoginStart, takeSignInNotice } from '../utils';
import { useOAuthAttemptStore } from '../stores/useOAuthAttemptStore';
import { useSocialLogin } from './useSocialLogin';

beforeEach(() => {
    useOAuthAttemptStore.setState({ attempt: null, failed: false, linkFailure: null });
    session.signOutGuest.mockReset().mockResolvedValue(undefined);
});

describe('useSocialLogin.start', () => {
    const open = vi.fn();

    beforeEach(() => {
        // The shell's persistent backing, as main.tsx wires it.
        setStorageAdapter(localStorage);
        localStorage.clear();
        open.mockReset();
        session.isAuthenticated = false;
        session.user = null;
        session.verifySocialAccount.mockReset().mockResolvedValue({ step: 'verify', linkable: true });
        session.confirmSocialAccount
            .mockReset()
            .mockResolvedValue({ step: 'confirm', linked: true, provider: 'google', hint: 'a***@gmail.com' });
        session.patchRelaySessionUser.mockReset();
        session.startWebTransportInit.mockReset().mockResolvedValue(undefined);
        session.loginGuest.mockReset().mockResolvedValue(undefined);
        session.createCredentialsByProvider.mockReset().mockRejectedValue(new Error('relay rejected'));
        session.toast.mockReset();
        session.warn.mockReset();
        vi.stubGlobal('open', open);
    });

    it('records the start before opening the browser', async () => {
        let recordedAtOpen: unknown = null;
        open.mockImplementation(() => {
            recordedAtOpen = JSON.parse(localStorage.getItem('chatic-oauth-login-start') ?? 'null');
        });
        const { result } = renderHook(() => useSocialLogin());

        await act(() => result.current.start('google'));

        expect(recordedAtOpen).toMatchObject({ provider: 'google' });
        expect(open).toHaveBeenCalledWith(expect.stringContaining('/oauth/google/authorize?redirect='), '_blank');
    });

    it('stamps a fresh start and sends its nonce on the relay redirect address', async () => {
        const before = Date.now();
        const { result } = renderHook(() => useSocialLogin());

        await act(() => result.current.start('google'));

        const record = takeOAuthLoginStart();
        expect(record?.nonce).toMatch(/^[0-9a-f]{32}$/);
        expect(record!.startedAt).toBeGreaterThanOrEqual(before);
        expect(record!.startedAt).toBeLessThan(before + OAUTH_LOGIN_START_TTL_MS);
        const redirect = new URL(String(open.mock.calls[0][0])).searchParams.get('redirect') ?? '';
        expect(new URL(redirect).searchParams.get('nonce')).toBe(record!.nonce);
    });

    it('replaces an earlier start, so only the latest login can be completed', async () => {
        const { result } = renderHook(() => useSocialLogin());

        await act(() => result.current.start('google'));
        const first = JSON.parse(localStorage.getItem('chatic-oauth-login-start') ?? 'null');
        await act(() => result.current.start('google'));

        expect(takeOAuthLoginStart()?.nonce).not.toBe(first.nonce);
    });

    describe('device registration comes first', () => {
        it('registers the device before the start is recorded and the browser opens', async () => {
            const order: string[] = [];
            session.loginGuest.mockImplementation(async () => {
                await Promise.resolve();
                order.push('register');
            });
            open.mockImplementation(() => {
                order.push(localStorage.getItem('chatic-oauth-login-start') ? 'open-with-record' : 'open');
            });
            const { result } = renderHook(() => useSocialLogin());

            await act(() => result.current.start('google'));

            expect(session.loginGuest).toHaveBeenCalledWith('device-1');
            expect(order).toEqual(['register', 'open-with-record']);
        });

        it('leaves the registration out when a session already exists', async () => {
            session.isAuthenticated = true;
            const { result } = renderHook(() => useSocialLogin());

            await act(() => result.current.start('google'));

            expect(session.loginGuest).not.toHaveBeenCalled();
            expect(open).toHaveBeenCalledTimes(1);
        });

        it('does not start the social flow when the registration fails, and reports the failure', async () => {
            session.loginGuest.mockRejectedValue(new Error('offline'));
            const { result } = renderHook(() => useSocialLogin());

            await act(() => result.current.start('google'));

            expect(open).not.toHaveBeenCalled();
            expect(takeOAuthLoginStart()).toBeNull();
            expect(result.current.isError).toBe(true);
            expect(result.current.isStarting).toBe(false);
        });

        it('is starting while the registration is pending, and ignores a second tap', async () => {
            let finish: () => void = () => undefined;
            session.loginGuest.mockReturnValue(new Promise<void>(resolve => (finish = resolve)));
            const { result } = renderHook(() => useSocialLogin());

            let first: Promise<boolean> = Promise.resolve(false);
            act(() => {
                first = result.current.start('google');
            });
            expect(result.current.isStarting).toBe(true);
            await act(async () => void (await result.current.start('google')));
            expect(session.loginGuest).toHaveBeenCalledTimes(1);

            await act(async () => {
                finish();
                await first;
            });
            expect(result.current.isStarting).toBe(false);
            expect(open).toHaveBeenCalledTimes(1);
        });

        it('still opens the browser when the registration unmounts the caller', async () => {
            let finish: () => void = () => undefined;
            session.loginGuest.mockReturnValue(new Promise<void>(resolve => (finish = resolve)));
            const { result, unmount } = renderHook(() => useSocialLogin());

            let started: Promise<boolean> = Promise.resolve(false);
            act(() => {
                started = result.current.start('google');
            });
            // Registering flips the router to the signed-in branch, which unmounts the Welcome page.
            unmount();
            await act(async () => {
                finish();
                await started;
            });

            expect(takeOAuthLoginStart()).toMatchObject({ provider: 'google' });
            expect(open).toHaveBeenCalledTimes(1);
        });

        it('clears an earlier failure when the next start succeeds', async () => {
            session.loginGuest.mockRejectedValueOnce(new Error('offline'));
            const { result } = renderHook(() => useSocialLogin());

            await act(() => result.current.start('google'));
            expect(result.current.isError).toBe(true);
            await act(() => result.current.start('google'));

            expect(result.current.isError).toBe(false);
            expect(open).toHaveBeenCalledTimes(1);
        });
    });

    describe('a failed exchange', () => {
        const startRecord = () =>
            saveOAuthLoginStart({ provider: 'google', intent: 'login', startedAt: Date.now(), nonce: 'n1' });

        it('is toasted for a caller that has no screen of its own', async () => {
            startRecord();
            const { result } = renderHook(() => useSocialLogin());

            await act(() =>
                result.current.completeFromHandoff(
                    { provider: 'google', code: 'c', nonce: 'n1' },
                    { notifyFailure: true }
                )
            );

            expect(session.toast).toHaveBeenCalledTimes(1);
            expect(result.current.isError).toBe(true);
        });

        it('is left to the hand-off page by default, which draws its own failure screen', async () => {
            startRecord();
            const { result } = renderHook(() => useSocialLogin());

            await act(() => result.current.completeFromHandoff({ provider: 'google', code: 'c', nonce: 'n1' }));

            expect(session.toast).not.toHaveBeenCalled();
            expect(result.current.isError).toBe(true);
        });
    });

    describe('a link that comes back', () => {
        const startRecord = () =>
            saveOAuthLoginStart({ provider: 'google', intent: 'login', startedAt: Date.now(), nonce: 'n1' });

        it('is exchanged once when it carries the nonce of the start', async () => {
            startRecord();
            session.createCredentialsByProvider.mockResolvedValue(undefined);
            const { result } = renderHook(() => useSocialLogin());

            await act(() => result.current.completeFromHandoff({ provider: 'google', code: 'c', nonce: 'n1' }));

            expect(session.createCredentialsByProvider).toHaveBeenCalledTimes(1);
            expect(session.createCredentialsByProvider).toHaveBeenCalledWith('google', 'c');
            expect(session.toast).not.toHaveBeenCalled();
        });

        it.each([
            ['carries no nonce', undefined],
            ['carries another nonce', 'other'],
        ])('is refused, told once and used up when it %s', async (_name, nonce) => {
            startRecord();
            const { result } = renderHook(() => useSocialLogin());

            await act(() => result.current.completeFromHandoff({ provider: 'google', code: 'secret-code', nonce }));

            expect(session.createCredentialsByProvider).not.toHaveBeenCalled();
            expect(session.toast).toHaveBeenCalledTimes(1);
            expect(session.toast).toHaveBeenCalledWith(
                expect.objectContaining({ description: i18n.t('auth.social.notStarted') })
            );
            expect(takeOAuthLoginStart()).toBeNull();
            // The reason is logged; neither the code nor the nonce is.
            expect(session.warn).toHaveBeenCalledWith('AUTH', expect.any(String), {
                reason: nonce ? 'nonce-mismatch' : 'nonce-missing',
            });
        });
    });

    describe('linking a provider account to the signed-in account', () => {
        const signedIn = () => {
            session.isAuthenticated = true;
            session.user = { id: 'u-1', userRole: 'user', link$: { phone: { hint: '1234' } } };
        };
        const startedLink = async () => {
            const { result } = renderHook(() => useSocialLogin());
            await act(async () => void result.current.startLink('google'));
            const nonce = new URL(
                new URL(String(open.mock.calls[0][0])).searchParams.get('redirect') ?? ''
            ).searchParams.get('nonce');
            return { result, nonce: nonce ?? undefined };
        };

        it('opens the browser without registering the device, recording a link start', async () => {
            signedIn();
            const { result } = renderHook(() => useSocialLogin());

            let started = false;
            act(() => void (started = result.current.startLink('google')));

            expect(started).toBe(true);
            expect(session.loginGuest).not.toHaveBeenCalled();
            expect(open).toHaveBeenCalledWith(expect.stringContaining('/oauth/google/authorize?redirect='), '_blank');
            expect(takeOAuthLoginStart()).toMatchObject({ provider: 'google', intent: 'link', account: 'u-1' });
        });

        it('does not start for a guest session', () => {
            session.isAuthenticated = true;
            session.user = { userRole: 'guest' };
            const { result } = renderHook(() => useSocialLogin());

            expect(result.current.startLink('google')).toBe(false);
            expect(open).not.toHaveBeenCalled();
        });

        it('verifies then confirms with the same code, keeps the session and records the link', async () => {
            signedIn();
            const { result, nonce } = await startedLink();

            let done: unknown;
            await act(async () => {
                done = await result.current.completeFromHandoff({ provider: 'google', code: 'auth2:x', nonce });
            });

            expect(done).toBe('link');
            expect(session.verifySocialAccount).toHaveBeenCalledWith({ provider: 'google', code: 'auth2:x' });
            expect(session.confirmSocialAccount).toHaveBeenCalledWith({ provider: 'google', code: 'auth2:x' });
            expect(session.createCredentialsByProvider).not.toHaveBeenCalled();
            expect(session.patchRelaySessionUser).toHaveBeenCalledWith({
                link$: {
                    phone: { hint: '1234' },
                    social: expect.objectContaining({ provider: 'google', hint: 'a***@gmail.com' }),
                },
            });
            expect(session.toast).toHaveBeenCalledWith({ description: i18n.t('account.signIn.link.done') });
        });

        it.each([
            ['occupied', 'occupied'],
            ['type-linked', 'typeLinked'],
        ])('stops at verify when the server says %s', async (reason, failure) => {
            signedIn();
            session.verifySocialAccount.mockResolvedValue({ step: 'verify', linkable: false, reason });
            const { result, nonce } = await startedLink();

            await act(() => result.current.completeFromHandoff({ provider: 'google', code: 'auth2:x', nonce }));

            expect(session.confirmSocialAccount).not.toHaveBeenCalled();
            expect(session.patchRelaySessionUser).not.toHaveBeenCalled();
            // Left for the account hub's sign-in card, which keeps it until dismissed; no toast.
            expect(useOAuthAttemptStore.getState().linkFailure).toBe(failure);
            expect(session.toast).not.toHaveBeenCalled();
        });

        it.each([
            ['409 CONFLICT', 'occupied'],
            // 403 from confirm can also be a session that is not a main user: only verify names type-linked.
            ['403 FORBIDDEN', 'failed'],
            ['500 ERROR', 'failed'],
        ])('reads a confirm refused with %s', async (message, failure) => {
            signedIn();
            session.confirmSocialAccount.mockRejectedValue(new Error(message));
            const { result, nonce } = await startedLink();

            await act(() => result.current.completeFromHandoff({ provider: 'google', code: 'auth2:x', nonce }));

            expect(result.current.isError).toBe(true);
            expect(useOAuthAttemptStore.getState().linkFailure).toBe(failure);
        });

        it('links nothing to another account that signed in while the browser was open', async () => {
            signedIn();
            const { result, nonce } = await startedLink();
            session.user = { id: 'u-2', userRole: 'user', link$: {} };

            await act(() => result.current.completeFromHandoff({ provider: 'google', code: 'auth2:x', nonce }));

            expect(session.verifySocialAccount).not.toHaveBeenCalled();
            expect(session.confirmSocialAccount).not.toHaveBeenCalled();
        });

        it('answers link even when the link failed, so a screen can leave for the hub', async () => {
            signedIn();
            session.verifySocialAccount.mockRejectedValue(new Error('500 ERROR'));
            const { result, nonce } = await startedLink();

            let done: unknown;
            await act(async () => {
                done = await result.current.completeFromHandoff({ provider: 'google', code: 'auth2:x', nonce });
            });

            expect(done).toBe('link');
            expect(useOAuthAttemptStore.getState().linkFailure).toBe('failed');
            // The attempt is over either way: the hub's link button comes back.
            expect(useOAuthAttemptStore.getState().attempt).toBeNull();
        });

        it('signs in, never links, for a login start while an account is signed in', async () => {
            signedIn();
            session.createCredentialsByProvider.mockResolvedValue(undefined);
            saveOAuthLoginStart({ provider: 'google', intent: 'login', startedAt: Date.now(), nonce: 'n1' });
            vi.stubGlobal('location', { ...window.location, replace: vi.fn() });
            const { result } = renderHook(() => useSocialLogin());

            await act(() => result.current.completeFromHandoff({ provider: 'google', code: 'auth2:x', nonce: 'n1' }));

            expect(session.createCredentialsByProvider).toHaveBeenCalledWith('google', 'auth2:x');
            expect(session.verifySocialAccount).not.toHaveBeenCalled();
            vi.unstubAllGlobals();
        });

        it('links nothing when the account signed out while the browser was open', async () => {
            signedIn();
            const { result, nonce } = await startedLink();
            session.user = { userRole: 'guest' };

            await act(() => result.current.completeFromHandoff({ provider: 'google', code: 'auth2:x', nonce }));

            expect(session.verifySocialAccount).not.toHaveBeenCalled();
            expect(useOAuthAttemptStore.getState().linkFailure).toBe('failed');
        });
    });
    describe('what the app says after a Google sign-in', () => {
        const signIn = async () => {
            const { result } = renderHook(() => useSocialLogin());
            await act(() => result.current.start('google'));
            const nonce =
                new URL(new URL(String(open.mock.calls[0][0])).searchParams.get('redirect') ?? '').searchParams.get(
                    'nonce'
                ) ?? undefined;
            await act(() => result.current.completeFromHandoff({ provider: 'google', code: 'c', nonce }));
        };

        it('leaves word of a new account when the server made it during the sign-in', async () => {
            session.createCredentialsByProvider.mockResolvedValue({ createdAt: Date.now() + 1000 });

            await signIn();

            expect(takeSignInNotice()).toEqual({ provider: 'google', isNew: true });
        });

        it('leaves word of an existing account otherwise', async () => {
            session.createCredentialsByProvider.mockResolvedValue({ createdAt: 1 });

            await signIn();

            expect(takeSignInNotice()).toEqual({ provider: 'google', isNew: false });
        });

        it('leaves nothing when the exchange fails', async () => {
            await signIn();

            expect(takeSignInNotice()).toBeNull();
        });
    });

    describe('the attempt waiting on the browser', () => {
        const store = () => useOAuthAttemptStore.getState();
        const nonceOf = (call: number) =>
            new URL(new URL(String(open.mock.calls[call][0])).searchParams.get('redirect') ?? '').searchParams.get(
                'nonce'
            );

        it('is begun before the device registration flips the router, marked as signed out at the start', async () => {
            let atRegistration: unknown = 'unset';
            session.loginGuest.mockImplementation(async () => {
                atRegistration = store().attempt;
            });
            const { result } = renderHook(() => useSocialLogin());

            await act(() => result.current.start('google'));

            expect(atRegistration).toEqual({ provider: 'google', intent: 'login', signedOutAtStart: true });
            expect(store().attempt).toMatchObject({ signedOutAtStart: true, nonce: nonceOf(0) });
        });

        it('is dropped when the registration fails', async () => {
            session.loginGuest.mockRejectedValue(new Error('503'));
            const { result } = renderHook(() => useSocialLogin());

            await act(() => result.current.start('google'));

            expect(store().attempt).toBeNull();
        });

        it('keeps the guest as its own when the start is retried, though a session exists by then', async () => {
            const { result } = renderHook(() => useSocialLogin());
            await act(() => result.current.start('google'));
            session.isAuthenticated = true;

            await act(() => result.current.start('google'));

            expect(store().attempt?.signedOutAtStart).toBe(true);
        });

        it('reopens the browser with the same nonce', async () => {
            const { result } = renderHook(() => useSocialLogin());
            await act(() => result.current.start('google'));

            act(() => void result.current.reopen());

            expect(open).toHaveBeenCalledTimes(2);
            expect(nonceOf(1)).toBe(nonceOf(0));
        });

        it('cancels by dropping the start and signing out the guest the start registered', async () => {
            const { result } = renderHook(() => useSocialLogin());
            await act(() => result.current.start('google'));
            session.isAuthenticated = true;

            await act(() => result.current.cancel());

            expect(takeOAuthLoginStart()).toBeNull();
            expect(store().attempt).toBeNull();
            expect(session.signOutGuest).toHaveBeenCalledTimes(1);
        });

        it('holds Welcome until the sign-out has run, so the app never opens as that guest', async () => {
            let heldDuringSignOut: unknown = 'unset';
            session.signOutGuest.mockImplementation(async () => {
                heldDuringSignOut = store().attempt;
            });
            const { result } = renderHook(() => useSocialLogin());
            await act(() => result.current.start('google'));
            session.isAuthenticated = true;

            await act(() => result.current.cancel());

            expect(heldDuringSignOut).not.toBeNull();
            expect(store().attempt).toBeNull();
        });

        it('says so when the sign-out fails, and lets go of Welcome anyway', async () => {
            session.signOutGuest.mockRejectedValue(new Error('logout failed'));
            const { result } = renderHook(() => useSocialLogin());
            await act(() => result.current.start('google'));
            session.isAuthenticated = true;

            await act(() => result.current.cancel());

            expect(store().attempt).toBeNull();
            expect(session.toast).toHaveBeenCalledWith(
                expect.objectContaining({ variant: 'destructive', description: i18n.t('auth.social.cancelFailed') })
            );
        });

        it('keeps the guest when the cancel moves on to phone sign-in', async () => {
            const { result } = renderHook(() => useSocialLogin());
            await act(() => result.current.start('google'));
            session.isAuthenticated = true;

            await act(() => result.current.cancel({ keepSession: true }));

            expect(store().attempt).toBeNull();
            expect(session.signOutGuest).not.toHaveBeenCalled();
        });

        it('never signs out a session that was there before the start', async () => {
            session.isAuthenticated = true;
            const { result } = renderHook(() => useSocialLogin());
            await act(() => result.current.start('google'));

            await act(() => result.current.cancel());

            expect(session.signOutGuest).not.toHaveBeenCalled();
        });

        it('is marked failed, not dropped, when the exchange fails', async () => {
            const { result } = renderHook(() => useSocialLogin());
            await act(() => result.current.start('google'));
            const nonce = nonceOf(0) ?? undefined;

            await act(() => result.current.completeFromHandoff({ provider: 'google', code: 'c', nonce }));

            expect(store().failed).toBe(true);
            expect(store().attempt).not.toBeNull();
        });

        it('starts no second link while one is out in the browser', async () => {
            session.isAuthenticated = true;
            session.user = { id: 'u-1', userRole: 'user' };
            const { result } = renderHook(() => useSocialLogin());

            act(() => void result.current.startLink('google'));
            let second: boolean | undefined;
            act(() => {
                second = result.current.startLink('google');
            });

            expect(second).toBe(false);
            expect(open).toHaveBeenCalledTimes(1);
        });
    });
});
