import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
    isAuthenticated: false,
    loginGuest: vi.fn(),
    startWebTransportInit: vi.fn(),
    createCredentialsByProvider: vi.fn(),
    toast: vi.fn(),
}));

vi.mock('@chatic/bridges', () => ({ isNative: () => true, logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        boot: { startWebTransportInit: session.startWebTransportInit },
        session: {
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

import '../../../../i18n';
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
        session.startWebTransportInit.mockReset().mockResolvedValue(undefined);
        session.loginGuest.mockReset().mockResolvedValue(undefined);
        session.createCredentialsByProvider.mockReset().mockRejectedValue(new Error('relay rejected'));
        session.toast.mockReset();
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

    it('stamps a start that is fresh and has a nonce, without sending the nonce to the relay yet', async () => {
        const before = Date.now();
        const { result } = renderHook(() => useSocialLogin());

        await act(() => result.current.start('google'));

        const record = takeOAuthLoginStart();
        expect(record?.nonce).toMatch(/^[0-9a-f]{32}$/);
        expect(record!.startedAt).toBeGreaterThanOrEqual(before);
        expect(record!.startedAt).toBeLessThan(before + OAUTH_LOGIN_START_TTL_MS);
        expect(String(open.mock.calls[0][0])).not.toContain(record!.nonce);
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
        const startRecord = () => saveOAuthLoginStart({ provider: 'google', startedAt: Date.now(), nonce: 'n1' });

        it('is toasted for a caller that has no screen of its own', async () => {
            startRecord();
            const { result } = renderHook(() => useSocialLogin());

            await act(() =>
                result.current.completeFromHandoff({ provider: 'google', code: 'c' }, { notifyFailure: true })
            );

            expect(session.toast).toHaveBeenCalledTimes(1);
            expect(result.current.isError).toBe(true);
        });

        it('is left to the hand-off page by default, which draws its own failure screen', async () => {
            startRecord();
            const { result } = renderHook(() => useSocialLogin());

            await act(() => result.current.completeFromHandoff({ provider: 'google', code: 'c' }));

            expect(session.toast).not.toHaveBeenCalled();
            expect(result.current.isError).toBe(true);
        });
    });
});
