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
vi.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: session.toast }));
vi.mock('@chatic/config', () => ({
    config: { get: (key: string) => (key === 'net.socialOauth.endpoint' ? 'https://relay.example' : undefined) },
}));

import i18n from '../../../../i18n';
import { setStorageAdapter } from '@chatic/shared';

import { OAUTH_LOGIN_START_TTL_MS, saveOAuthLoginStart, takeOAuthLoginStart } from '../utils';
import { useSocialLogin } from './useSocialLogin';

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
            ['occupied', 'account.signIn.link.occupied'],
            ['type-linked', 'account.signIn.link.typeLinked'],
        ])('stops at verify when the server says %s', async (reason, key) => {
            signedIn();
            session.verifySocialAccount.mockResolvedValue({ step: 'verify', linkable: false, reason });
            const { result, nonce } = await startedLink();

            await act(() => result.current.completeFromHandoff({ provider: 'google', code: 'auth2:x', nonce }));

            expect(session.confirmSocialAccount).not.toHaveBeenCalled();
            expect(session.patchRelaySessionUser).not.toHaveBeenCalled();
            expect(session.toast).toHaveBeenCalledWith(
                expect.objectContaining({ variant: 'destructive', description: i18n.t(key) })
            );
        });

        it.each([
            ['409 CONFLICT', 'account.signIn.link.occupied'],
            // 403 from confirm can also be a session that is not a main user: only verify names type-linked.
            ['403 FORBIDDEN', 'account.signIn.link.failed'],
            ['500 ERROR', 'account.signIn.link.failed'],
        ])('reads a confirm refused with %s', async (message, key) => {
            signedIn();
            session.confirmSocialAccount.mockRejectedValue(new Error(message));
            const { result, nonce } = await startedLink();

            await act(() => result.current.completeFromHandoff({ provider: 'google', code: 'auth2:x', nonce }));

            expect(result.current.isError).toBe(true);
            expect(session.toast).toHaveBeenCalledWith(
                expect.objectContaining({ variant: 'destructive', description: i18n.t(key) })
            );
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
            expect(session.toast).toHaveBeenCalledTimes(1);
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
            expect(session.toast).toHaveBeenCalledWith(
                expect.objectContaining({ description: i18n.t('account.signIn.link.failed') })
            );
        });
    });
});
