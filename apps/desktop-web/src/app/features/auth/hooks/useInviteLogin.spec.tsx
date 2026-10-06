import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { loginGuest, registerUserWithInviteCode, getIdentityContext, getActiveSessionUser, fetchInviteCodeInfo } =
    vi.hoisted(() => ({
        loginGuest: vi.fn(),
        registerUserWithInviteCode: vi.fn(),
        getIdentityContext: vi.fn(),
        getActiveSessionUser: vi.fn(),
        fetchInviteCodeInfo: vi.fn(),
    }));

vi.mock('../apis', () => ({ fetchInviteCodeInfo }));

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        boot: { startWebTransportInit: vi.fn() },
        session: {
            useDynamicDeviceId: () => ({ deviceId: 'device-1' }),
            useLoginRelayGuestByDevice: () => ({ mutateAsync: loginGuest }),
            useSwitchCloudSession: () => ({ switchCloud: vi.fn() }),
            useSiteSwitch: () => ({ switchSite: vi.fn() }),
            getIdentityContext,
            getActiveSessionUser,
            registerUserWithInviteCode,
        },
        data: { useRuntimeRepositories: () => ({ cloud: { cacheWrite: vi.fn() } }), cloudsKeys: { all: ['clouds'] } },
    },
}));
vi.mock('@chatic/config', () => ({
    config: {
        get: (key: string) =>
            ({
                'net.relay.backend': 'https://api.eureka.codes/dou-d1',
                'net.admin.backend': 'https://api.eureka.codes/d1',
            })[key],
    },
}));

import { useInviteLogin } from './useInviteLogin';

const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

// The exchange is signed with the device's guest delegation; a pasted link naming another server
// used to be followed, handing that delegation to whoever runs it.
describe('useInviteLogin with a link naming an untrusted backend', () => {
    beforeEach(() => getIdentityContext.mockReturnValue({ delegatorId: null, isAuthenticated: false }));
    afterEach(() => vi.clearAllMocks());

    it('refuses before any guest session is created or the code is sent', async () => {
        const { result } = renderHook(() => useInviteLogin(), { wrapper });

        let failure: unknown;
        await act(async () => {
            failure = await result.current.login(
                'https://app.chatic.io/s?code=invt:1:abc&backend=https://evil.example/x'
            );
        });

        expect(failure).toEqual({ kind: 'backend' });
        expect(result.current.error).toEqual({ kind: 'backend' });
        expect(loginGuest).not.toHaveBeenCalled();
        expect(registerUserWithInviteCode).not.toHaveBeenCalled();
    });

    it('goes on to the guest login for a configured backend', async () => {
        loginGuest.mockRejectedValue(new Error('offline'));
        const { result } = renderHook(() => useInviteLogin(), { wrapper });

        await act(async () => {
            await result.current.login('https://app.chatic.io/s?code=invt:1:abc&backend=https://api.eureka.codes/d1');
        });

        expect(loginGuest).toHaveBeenCalledWith('device-1');
        expect(result.current.error).toMatchObject({ kind: 'server' });
    });
});

const encodedLink = (payload: unknown): string =>
    `https://app-dev.chatic.io/i?t=${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}`;

describe('useInviteLogin with an encoded link', () => {
    beforeEach(() => getIdentityContext.mockReturnValue({ delegatorId: 'delegator-1', isAuthenticated: true }));
    afterEach(() => vi.clearAllMocks());

    it('exchanges the code against the backend the link names', async () => {
        fetchInviteCodeInfo.mockResolvedValue(null);
        registerUserWithInviteCode.mockResolvedValue({});
        const { result } = renderHook(() => useInviteLogin(), { wrapper });

        let failure: unknown;
        await act(async () => {
            failure = await result.current.login(encodedLink({ c: 'invt:1:abc', a: 'uzjpiaey7a', s: 'dev' }));
        });

        expect(failure).toBeNull();
        expect(registerUserWithInviteCode).toHaveBeenCalledWith(
            'invt:1:abc',
            'delegator-1',
            'https://uzjpiaey7a.execute-api.ap-northeast-2.amazonaws.com/dev'
        );
    });

    it('refuses a relay invite before any guest session is created or the code is sent', async () => {
        const { result } = renderHook(() => useInviteLogin(), { wrapper });

        let failure: unknown;
        await act(async () => {
            failure = await result.current.login(encodedLink({ c: 'invt:1:abc', r: 1 }));
        });

        expect(failure).toEqual({ kind: 'relay' });
        expect(result.current.error).toEqual({ kind: 'relay' });
        expect(loginGuest).not.toHaveBeenCalled();
        expect(registerUserWithInviteCode).not.toHaveBeenCalled();
    });

    it('refuses a link with no address rather than falling back to the relay server', async () => {
        const { result } = renderHook(() => useInviteLogin(), { wrapper });

        let failure: unknown;
        await act(async () => {
            failure = await result.current.login(encodedLink({ c: 'invt:1:abc' }));
        });

        expect(failure).toEqual({ kind: 'unmarked' });
        expect(registerUserWithInviteCode).not.toHaveBeenCalled();
    });
});

// The identity context carries no guest flag; guest-ness is the active token's `userRole`.
describe('useInviteLogin while a session is already signed in', () => {
    beforeEach(() => getIdentityContext.mockReturnValue({ delegatorId: null, isAuthenticated: true }));
    afterEach(() => vi.clearAllMocks());

    it('answers an account with a typed error the dialog can translate, and sends nothing', async () => {
        getActiveSessionUser.mockReturnValue({ userRole: 'main' });
        const { result } = renderHook(() => useInviteLogin(), { wrapper });

        let failure: unknown;
        await act(async () => {
            failure = await result.current.login('invt:1:abc');
        });

        expect(failure).toEqual({ kind: 'loggedIn' });
        expect(result.current.error).toEqual({ kind: 'loggedIn' });
        expect(result.current.isSubmitting).toBe(false);
        expect(loginGuest).not.toHaveBeenCalled();
        expect(registerUserWithInviteCode).not.toHaveBeenCalled();
    });

    it('lets a guest session that has no delegatorId yet go on to the guest login', async () => {
        getActiveSessionUser.mockReturnValue({ userRole: 'guest' });
        loginGuest.mockRejectedValue(new Error('offline'));
        const { result } = renderHook(() => useInviteLogin(), { wrapper });

        await act(async () => {
            await result.current.login('invt:1:abc');
        });

        expect(loginGuest).toHaveBeenCalledWith('device-1');
        expect(result.current.error).toMatchObject({ kind: 'server' });
    });
});
