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

const TRUSTED_LINK = 'https://app.chatic.io/s?code=invt:1:abc&backend=https://api.eureka.codes/d1';

const previewOf = async (input: string) => {
    const { result } = renderHook(() => useInviteLogin(), { wrapper });
    let outcome: Awaited<ReturnType<typeof result.current.preview>> | undefined;
    await act(async () => {
        outcome = await result.current.preview(input);
    });
    if (!outcome) throw new Error('preview did not resolve');
    return outcome;
};

describe('useInviteLogin.preview', () => {
    beforeEach(() => getIdentityContext.mockReturnValue({ delegatorId: null, isAuthenticated: false }));
    afterEach(() => vi.clearAllMocks());

    it('resolves a pending invite to its place and inviter without sending the code', async () => {
        loginGuest.mockImplementation(async () =>
            getIdentityContext.mockReturnValue({ delegatorId: 'delegator-1', isAuthenticated: true })
        );
        fetchInviteCodeInfo.mockResolvedValue({
            id: '1',
            state: 'pending',
            cloudName: 'Design Team',
            inviter$: { id: 'u1', name: 'Mina' },
        });

        const outcome = await previewOf(TRUSTED_LINK);

        expect(outcome).toMatchObject({
            preview: { placeName: 'Design Team', inviterName: 'Mina', createdGuest: true },
        });
        expect(loginGuest).toHaveBeenCalledWith('device-1');
        expect(fetchInviteCodeInfo).toHaveBeenCalledWith('invt:1:abc', 'https://api.eureka.codes/d1');
        expect(registerUserWithInviteCode).not.toHaveBeenCalled();
    });

    it('reuses a guest session that already exists and says it did not create one', async () => {
        getIdentityContext.mockReturnValue({ delegatorId: 'delegator-1', isAuthenticated: true });
        fetchInviteCodeInfo.mockResolvedValue({ id: '1', state: 'pending', cloudName: 'Design Team' });

        const outcome = await previewOf(TRUSTED_LINK);

        expect(outcome).toMatchObject({ preview: { createdGuest: false } });
        expect(loginGuest).not.toHaveBeenCalled();
    });

    it('lets a bare code through with no details, since it names no backend to look up', async () => {
        getIdentityContext.mockReturnValue({ delegatorId: 'delegator-1', isAuthenticated: true });

        const outcome = await previewOf('invt:1:abc');

        expect(outcome).toMatchObject({ preview: { code: 'invt:1:abc', placeName: undefined } });
        expect(fetchInviteCodeInfo).not.toHaveBeenCalled();
    });

    it('treats an invite with no state as pending, so an older backend still previews', async () => {
        getIdentityContext.mockReturnValue({ delegatorId: 'delegator-1', isAuthenticated: true });
        fetchInviteCodeInfo.mockResolvedValue({ id: '1', cloudName: 'Design Team' });

        expect(await previewOf(TRUSTED_LINK)).toMatchObject({ preview: { placeName: 'Design Team' } });
    });
});

describe('useInviteLogin.preview blocks', () => {
    beforeEach(() => getIdentityContext.mockReturnValue({ delegatorId: 'delegator-1', isAuthenticated: true }));
    afterEach(() => vi.clearAllMocks());

    it.each([
        ['accepted', 'used'],
        ['expired', 'expired'],
        ['canceled', 'canceled'],
        ['rejected', 'canceled'],
    ])('blocks an invite whose state is %s as %s and shows no place', async (state, kind) => {
        fetchInviteCodeInfo.mockResolvedValue({ id: '1', state, cloudName: 'Design Team' });

        const outcome = await previewOf(TRUSTED_LINK);

        expect(outcome).toMatchObject({ error: { kind } });
        expect(outcome).not.toHaveProperty('preview');
        expect(registerUserWithInviteCode).not.toHaveBeenCalled();
    });

    it('blocks an invite still marked pending whose expiry time has passed', async () => {
        fetchInviteCodeInfo.mockResolvedValue({
            id: '1',
            state: 'pending',
            cloudName: 'Design Team',
            expiredAt: Date.now() - 60_000,
        });

        const outcome = await previewOf(TRUSTED_LINK);

        expect(outcome).toMatchObject({ error: { kind: 'expired' } });
        expect(outcome).not.toHaveProperty('preview');
        expect(registerUserWithInviteCode).not.toHaveBeenCalled();
    });

    it('previews a pending invite whose expiry time is still ahead, or not given', async () => {
        fetchInviteCodeInfo.mockResolvedValueOnce({
            id: '1',
            state: 'pending',
            cloudName: 'Design Team',
            expiredAt: Date.now() + 3_600_000,
        });
        expect(await previewOf(TRUSTED_LINK)).toMatchObject({ preview: { placeName: 'Design Team' } });

        fetchInviteCodeInfo.mockResolvedValueOnce({
            id: '1',
            state: 'pending',
            cloudName: 'Design Team',
            expiredAt: 0,
        });
        expect(await previewOf(TRUSTED_LINK)).toMatchObject({ preview: { placeName: 'Design Team' } });
    });

    it('blocks when the lookup is rejected, instead of going on as the login does', async () => {
        fetchInviteCodeInfo.mockRejectedValue(new Error('400 INVALID - @code[invt:1:abc] is invalid (not-found)'));

        const outcome = await previewOf(TRUSTED_LINK);

        expect(outcome).toMatchObject({ error: { kind: 'server' } });
        expect(outcome).not.toHaveProperty('preview');
    });

    it('blocks a link naming an untrusted backend before any guest session is created', async () => {
        getIdentityContext.mockReturnValue({ delegatorId: null, isAuthenticated: false });

        const outcome = await previewOf('https://app.chatic.io/s?code=invt:1:abc&backend=https://evil.example/x');

        expect(outcome).toMatchObject({ error: { kind: 'backend' }, createdGuest: false });
        expect(loginGuest).not.toHaveBeenCalled();
        expect(fetchInviteCodeInfo).not.toHaveBeenCalled();
    });

    it('blocks an empty paste', async () => {
        const outcome = await previewOf('   ');

        expect(outcome).toMatchObject({ error: { kind: 'format' } });
    });

    it('blocks a signed-in account instead of replacing it with a guest', async () => {
        getIdentityContext.mockReturnValue({ delegatorId: null, isAuthenticated: true });
        getActiveSessionUser.mockReturnValue({ userRole: 'user' });

        const outcome = await previewOf(TRUSTED_LINK);

        expect(outcome).toMatchObject({ error: { kind: 'loggedIn' } });
        expect(loginGuest).not.toHaveBeenCalled();
    });

    it('reports a guest it registered even when the lookup then fails, so the page can undo it', async () => {
        getIdentityContext.mockReturnValue({ delegatorId: null, isAuthenticated: false });
        loginGuest.mockImplementation(async () =>
            getIdentityContext.mockReturnValue({ delegatorId: 'delegator-1', isAuthenticated: true })
        );
        fetchInviteCodeInfo.mockRejectedValue(new Error('offline'));

        const outcome = await previewOf(TRUSTED_LINK);

        expect(outcome).toMatchObject({ error: { kind: 'server' }, createdGuest: true });
    });
});

describe('useInviteLogin.enter', () => {
    beforeEach(() => getIdentityContext.mockReturnValue({ delegatorId: 'delegator-1', isAuthenticated: true }));
    afterEach(() => vi.clearAllMocks());

    it('exchanges the previewed code against the previewed backend', async () => {
        registerUserWithInviteCode.mockResolvedValue({});
        const { result } = renderHook(() => useInviteLogin(), { wrapper });

        let failure: unknown;
        await act(async () => {
            failure = await result.current.enter({
                code: 'invt:1:abc',
                backend: 'https://api.eureka.codes/d1',
                info: null,
                createdGuest: false,
            });
        });

        expect(failure).toBeNull();
        expect(registerUserWithInviteCode).toHaveBeenCalledWith(
            'invt:1:abc',
            'delegator-1',
            'https://api.eureka.codes/d1'
        );
    });

    it('reports a rejected exchange as a server failure', async () => {
        registerUserWithInviteCode.mockRejectedValue(new Error('400 INVALID - used'));
        const { result } = renderHook(() => useInviteLogin(), { wrapper });

        let failure: unknown;
        await act(async () => {
            failure = await result.current.enter({ code: 'invt:1:abc', info: null, createdGuest: false });
        });

        expect(failure).toMatchObject({ kind: 'server' });
    });
});
