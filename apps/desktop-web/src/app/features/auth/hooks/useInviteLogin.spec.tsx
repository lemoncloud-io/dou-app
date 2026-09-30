import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { loginGuest, registerUserWithInviteCode } = vi.hoisted(() => ({
    loginGuest: vi.fn(),
    registerUserWithInviteCode: vi.fn(),
}));

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        boot: { startWebTransportInit: vi.fn() },
        session: {
            useDynamicDeviceId: () => ({ deviceId: 'device-1' }),
            useLoginRelayGuestByDevice: () => ({ mutateAsync: loginGuest }),
            useSwitchCloudSession: () => ({ switchCloud: vi.fn() }),
            useSiteSwitch: () => ({ switchSite: vi.fn() }),
            getIdentityContext: () => ({ delegatorId: null, isAuthenticated: false, isGuest: false }),
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
