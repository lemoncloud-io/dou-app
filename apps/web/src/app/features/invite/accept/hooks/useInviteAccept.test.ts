import { act, renderHook } from '@testing-library/react';

import type { InviteContext } from '../types';

const mockRunInviteFlow = jest.fn();
const mockEnterCloud = jest.fn();
const mockEnterSite = jest.fn();
const mockEnterChannel = jest.fn();
const mockCacheWrite = jest.fn();
const mockCacheRead = jest.fn();
const mockUseSessionIdentity = jest.fn();
const mockGetMyProfile = jest.fn();
const mockSyncChannels = jest.fn();
const mockObserveChannel = jest.fn();
const mockLoggerWarn = jest.fn();
const mockToast = jest.fn();
const mockLoggerError = jest.fn();
const mockOwnedClouds = jest.fn();

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@chatic/bridges', () => ({
    logger: {
        error: (...args: unknown[]) => mockLoggerError(...args),
        warn: (...args: unknown[]) => mockLoggerWarn(...args),
        info: jest.fn(),
    },
}));

// The real module opens IndexedDB on import; only the cloud-1:1 rule is needed here.
jest.mock('@chatic/data', () => ({
    isCloudWideChannel: (c: { stereo?: string; cid?: string } | null) =>
        !!c && c.stereo === 'dm' && c.cid !== 'default',
}));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({
                cloud: { cacheWrite: mockCacheWrite, cacheRead: mockCacheRead },
                profile: { getMyProfile: mockGetMyProfile },
                channel: { syncChannels: mockSyncChannels, observeItem: mockObserveChannel },
            }),
        },
        session: {
            useInviteFlow: () => ({ runInviteFlow: mockRunInviteFlow, isInviting: false }),
            // Only the first block sets an identity; the others run without a guest.
            useSessionIdentity: () => mockUseSessionIdentity() ?? {},
        },
    },
}));
jest.mock('../../../../hooks/useCloudCatalog', () => ({
    useCloudSessionCatalog: () => ({ clouds: mockOwnedClouds() ?? [] }),
}));
jest.mock('./useEnterInvitedCloud', () => ({
    useEnterInvitedCloud: () => ({ enterCloud: mockEnterCloud, isEnteringCloud: false }),
}));
jest.mock('./useEnterInvitedSite', () => ({
    useEnterInvitedSite: () => ({ enterSite: mockEnterSite, isEnteringSite: false }),
}));
jest.mock('./useEnterInvitedChannel', () => ({ useEnterInvitedChannel: () => ({ enterChannel: mockEnterChannel }) }));

const { useInviteAccept } = require('./useInviteAccept');

const ctx = (overrides: Partial<InviteContext> = {}): InviteContext =>
    ({
        params: { code: 'invt:1:abc', backend: 'https://cloud.example' },
        info: {
            cloudId: 'cloud-1',
            siteId: 'site-1',
            $envs: { backend: 'https://cloud.example', wss: 'wss://cloud.example' },
        },
        ...overrides,
    }) as InviteContext;

const runAccept = async (context: InviteContext) => {
    const { result } = renderHook(() => useInviteAccept(context));
    await act(async () => {
        await result.current.accept();
    });
    return result;
};

describe('useInviteAccept — 초대 수락 흐름', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRunInviteFlow.mockResolvedValue({});
        mockEnterCloud.mockResolvedValue(undefined);
        mockEnterSite.mockResolvedValue(undefined);
        mockCacheRead.mockResolvedValue(null);
        mockUseSessionIdentity.mockReturnValue({ delegatorId: 'guest-1' });
        mockOwnedClouds.mockReturnValue([]);
    });

    it('logs in, enters the cloud with the login answer, then caches it, enters the place and the room', async () => {
        const inviteToken = { id: 'invitee-1', Token: { identityToken: 'idt' } };
        mockRunInviteFlow.mockResolvedValue(inviteToken);
        const context = ctx();

        const result = await runAccept(context);

        expect(mockRunInviteFlow).toHaveBeenCalledWith({ code: 'invt:1:abc', backend: 'https://cloud.example' });
        expect(mockEnterCloud).toHaveBeenCalledWith(context.info, inviteToken);
        expect(mockCacheWrite).toHaveBeenCalledWith(expect.objectContaining({ id: 'cloud-1', cloudType: 'invited' }));
        expect(mockEnterSite).toHaveBeenCalled();
        expect(mockEnterChannel).toHaveBeenCalled();
        // Entered before cached: a cached cloud is listed, and a listed one gets a re-issued socket.
        expect(mockEnterCloud.mock.invocationCallOrder[0]).toBeLessThan(mockCacheWrite.mock.invocationCallOrder[0]);
        expect(result.current.errorKey).toBeNull();
        expect(result.current.missingDelegator).toBe(false);
        expect(mockToast).not.toHaveBeenCalled();
    });

    it('enters a cloud the account owns as the owner, not with the invitee token, and still caches it', async () => {
        mockRunInviteFlow.mockResolvedValue({ id: 'invitee-1', Token: { identityToken: 'idt' } });
        mockOwnedClouds.mockReturnValue([{ id: 'cloud-1' }]);
        const context = ctx();

        await runAccept(context);

        expect(mockEnterCloud).toHaveBeenCalledWith(context.info, undefined);
        expect(mockCacheWrite).toHaveBeenCalledWith(expect.objectContaining({ id: 'cloud-1', cloudType: 'invited' }));
        expect(mockEnterChannel).toHaveBeenCalled();
    });

    it('checks ownership against the catalog as it is when the cloud is entered, not when Accept was pressed', async () => {
        // Cold start from the link: the catalog is empty at the press and resolves during the login.
        let finishLogin: (token: unknown) => void = () => undefined;
        mockRunInviteFlow.mockReturnValue(new Promise(resolve => (finishLogin = resolve)));
        const context = ctx();
        const { result, rerender } = renderHook(() => useInviteAccept(context));

        let accepting: Promise<void> = Promise.resolve();
        act(() => {
            accepting = result.current.accept();
        });
        mockOwnedClouds.mockReturnValue([{ id: 'cloud-1' }]);
        rerender();
        await act(async () => {
            finishLogin({ id: 'invitee-1', Token: { identityToken: 'idt' } });
            await accepting;
        });

        expect(mockEnterCloud).toHaveBeenCalledWith(context.info, undefined);
    });

    it('still enters with the invitee token when the account owns some other cloud', async () => {
        const inviteToken = { id: 'invitee-1', Token: { identityToken: 'idt' } };
        mockRunInviteFlow.mockResolvedValue(inviteToken);
        mockOwnedClouds.mockReturnValue([{ id: 'cloud-9' }]);
        const context = ctx();

        await runAccept(context);

        expect(mockEnterCloud).toHaveBeenCalledWith(context.info, inviteToken);
    });

    it('backend도 relay 마커도 없으면 missingServerInfo 토스트를 띄우고 login을 시도하지 않는다', async () => {
        await runAccept(ctx({ params: { code: 'invt:1:abc' } } as Partial<InviteContext>));

        expect(mockToast).toHaveBeenCalledWith({ title: 'inviteAccept.missingServerInfo', variant: 'destructive' });
        expect(mockRunInviteFlow).not.toHaveBeenCalled();
    });

    it('relay 마커가 있으면 backend 없이도 login을 진행한다 (web-core가 릴레이 엔드포인트로 폴백)', async () => {
        const result = await runAccept(ctx({ params: { code: 'invt:1:abc', relay: true } } as Partial<InviteContext>));

        // backend stays undefined: registerUserWithInviteCode resolves getDynamicRelayBackend().
        expect(mockRunInviteFlow).toHaveBeenCalledWith({ code: 'invt:1:abc', backend: undefined });
        expect(mockToast).not.toHaveBeenCalled();
        expect(result.current.errorKey).toBeNull();
    });

    it('login-invite 단계 400 실패 시 expired 키를 노출하고 step을 로그에 남긴다', async () => {
        mockRunInviteFlow.mockRejectedValue(new Error('400 INVALID - bad code'));

        const result = await runAccept(ctx());

        expect(result.current.errorKey).toBe('inviteAccept.expired');
        expect(mockToast).toHaveBeenCalledWith({ title: 'inviteAccept.expired', variant: 'destructive' });
        expect(mockLoggerError).toHaveBeenCalledWith(
            'AUTH',
            '[useInviteAccept] accept failed at step=login-invite',
            expect.objectContaining({ data: { step: 'login-invite' } })
        );
        expect(mockEnterCloud).not.toHaveBeenCalled();
    });

    it('delegatorId 오류는 missingDelegator 패널로 분기하고 토스트를 띄우지 않는다', async () => {
        mockRunInviteFlow.mockRejectedValue(new Error('No delegatorId for invite flow'));

        const result = await runAccept(ctx());

        expect(result.current.missingDelegator).toBe(true);
        expect(result.current.errorKey).toBeNull();
        expect(mockToast).not.toHaveBeenCalled();
    });

    it('로그인 성공 후 enter-site 단계 실패는 enterFailed 키로 귀속한다', async () => {
        mockEnterSite.mockRejectedValue(new Error('500 SERVER ERROR'));

        const result = await runAccept(ctx());

        expect(result.current.errorKey).toBe('inviteAccept.enterFailed');
        expect(mockLoggerError).toHaveBeenCalledWith(
            'AUTH',
            '[useInviteAccept] accept failed at step=enter-site',
            expect.objectContaining({ data: { step: 'enter-site' } })
        );
    });

    it('타임아웃은 단계와 무관하게 timeout 키', async () => {
        mockRunInviteFlow.mockRejectedValue(new Error('TIMEOUT: no response'));
        expect((await runAccept(ctx())).current.errorKey).toBe('inviteAccept.timeout');

        jest.clearAllMocks();
        mockRunInviteFlow.mockResolvedValue({});
        mockEnterCloud.mockResolvedValue(undefined);
        mockEnterSite.mockRejectedValue(new Error('TIMEOUT: no response'));
        expect((await runAccept(ctx())).current.errorKey).toBe('inviteAccept.timeout');
    });

    it('네트워크 오류는 단계와 무관하게 networkError 키', async () => {
        mockRunInviteFlow.mockRejectedValue(new Error('ERR_NETWORK'));
        expect((await runAccept(ctx())).current.errorKey).toBe('inviteAccept.networkError');

        jest.clearAllMocks();
        mockRunInviteFlow.mockResolvedValue({});
        mockEnterCloud.mockResolvedValue(undefined);
        mockEnterSite.mockRejectedValue(new Error('Network Error'));
        expect((await runAccept(ctx())).current.errorKey).toBe('inviteAccept.networkError');
    });

    it('login-invite 단계의 401/403은 authVerifyFailed 키', async () => {
        mockRunInviteFlow.mockRejectedValue(new Error('401 UNAUTHORIZED'));
        expect((await runAccept(ctx())).current.errorKey).toBe('inviteAccept.authVerifyFailed');

        jest.clearAllMocks();
        mockRunInviteFlow.mockRejectedValue(new Error('403 FORBIDDEN'));
        expect((await runAccept(ctx())).current.errorKey).toBe('inviteAccept.authVerifyFailed');
    });

    it('login-invite 단계의 그 외 서버 오류는 failed 키', async () => {
        mockRunInviteFlow.mockRejectedValue(new Error('500 SERVER ERROR'));
        expect((await runAccept(ctx())).current.errorKey).toBe('inviteAccept.failed');
    });

    it('records the accepting guest on the cached cloud, keeping guests that accepted it before', async () => {
        mockCacheRead.mockResolvedValue({ id: 'cloud-1', cid: 'cloud-1', acceptedBy: ['guest-0'] });

        await runAccept(ctx());

        expect(mockCacheRead).toHaveBeenCalledWith('cloud-1');
        expect(mockCacheWrite).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'cloud-1', acceptedBy: ['guest-0', 'guest-1'] })
        );
    });

    it('reports accepting for the whole pipeline and ignores a second press while it runs', async () => {
        let releaseCloud: () => void = () => undefined;
        mockEnterCloud.mockReturnValue(new Promise<void>(resolve => (releaseCloud = resolve)));
        const { result } = renderHook(() => useInviteAccept(ctx()));

        let first: Promise<void> = Promise.resolve();
        await act(async () => {
            first = result.current.accept();
            await Promise.resolve();
        });
        expect(result.current.isAccepting).toBe(true);

        await act(async () => {
            await result.current.accept();
        });
        expect(mockRunInviteFlow).toHaveBeenCalledTimes(1);

        await act(async () => {
            releaseCloud();
            await first;
        });
        expect(result.current.isAccepting).toBe(false);
        expect(mockEnterChannel).toHaveBeenCalledTimes(1);
    });
});

describe('useInviteAccept — place profile step', () => {
    const withSite = () => ctx({ info: { cloudId: 'cloud-1', siteId: 'site-9' } } as Partial<InviteContext>);

    beforeEach(() => {
        jest.clearAllMocks();
        mockRunInviteFlow.mockResolvedValue({});
        mockEnterCloud.mockResolvedValue(undefined);
        mockEnterSite.mockResolvedValue(undefined);
    });

    it('stops before the room when the invited place has no profile of mine', async () => {
        // `profile.get-mine` answers even with no real profile; `active: false` is what says so.
        mockGetMyProfile.mockResolvedValue({ id: 'site-9@me', active: false });

        const result = await runAccept(withSite());

        expect(mockEnterSite).toHaveBeenCalled();
        expect(result.current.profilePending).toBe(true);
        expect(mockEnterChannel).not.toHaveBeenCalled();
        expect(result.current.errorKey).toBeNull();
    });

    it('continues into the room once the profile step is left', async () => {
        mockGetMyProfile.mockResolvedValue({ id: 'site-9@me', active: false });
        const result = await runAccept(withSite());

        act(() => result.current.finishProfile());

        expect(result.current.profilePending).toBe(false);
        expect(mockEnterChannel).toHaveBeenCalledWith(expect.objectContaining({ siteId: 'site-9' }));
    });

    it('goes straight into the room when a profile already exists there', async () => {
        mockGetMyProfile.mockResolvedValue({ id: 'site-9@me', nick: 'Raine', active: true });

        const result = await runAccept(withSite());

        expect(result.current.profilePending).toBe(false);
        expect(mockEnterChannel).toHaveBeenCalled();
    });

    it('does not ask when the invite named no place, since the session never moved', async () => {
        const result = await runAccept(ctx({ info: { cloudId: 'cloud-1' } } as Partial<InviteContext>));

        expect(mockGetMyProfile).not.toHaveBeenCalled();
        expect(result.current.profilePending).toBe(false);
        expect(mockEnterChannel).toHaveBeenCalled();
    });

    it('enters the room when the profile read fails, rather than blocking on it', async () => {
        mockGetMyProfile.mockRejectedValue(new Error('read failed'));

        const result = await runAccept(withSite());

        expect(result.current.profilePending).toBe(false);
        expect(mockEnterChannel).toHaveBeenCalled();
    });

    it('does not ask when switching into the place failed', async () => {
        mockEnterSite.mockRejectedValue(new Error('403 NOT ALLOWED'));

        const result = await runAccept(withSite());

        expect(mockGetMyProfile).not.toHaveBeenCalled();
        expect(result.current.profilePending).toBe(false);
        expect(result.current.errorKey).toBe('inviteAccept.enterFailed');
    });
});

describe('useInviteAccept — finding the invited place', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRunInviteFlow.mockResolvedValue({});
        mockEnterCloud.mockResolvedValue(undefined);
        mockEnterSite.mockResolvedValue(undefined);
        mockGetMyProfile.mockResolvedValue({ nick: 'Raine', active: true });
        mockSyncChannels.mockResolvedValue({ syncedAt: 1, removedCount: 0 });
    });

    // The cache answers an observer synchronously or later; emitting from inside the call covers the
    // case where it fires before the subscription handle exists.
    const roomRowIs = (row: Record<string, unknown>) =>
        mockObserveChannel.mockImplementation((_id: string, cb: (item: unknown) => void) => {
            cb(row);
            return jest.fn();
        });

    it('uses the invite place card when the invite carries no siteId', async () => {
        await runAccept(ctx({ info: { cloudId: 'cloud-1', site$: { id: 'site-7' } } } as Partial<InviteContext>));

        expect(mockEnterSite).toHaveBeenCalledWith('site-7');
        expect(mockSyncChannels).not.toHaveBeenCalled();
        expect(mockGetMyProfile).toHaveBeenCalled();
    });

    it('reads the place off the invited room when the invite names none', async () => {
        roomRowIs({ id: 'ch-1', sid: 'site-8', stereo: 'public', cid: 'cloud-1' });

        await runAccept(ctx({ info: { cloudId: 'cloud-1', channelId: 'ch-1' } } as Partial<InviteContext>));

        expect(mockSyncChannels).toHaveBeenCalledWith(0);
        expect(mockObserveChannel).toHaveBeenCalledWith('ch-1', expect.any(Function));
        expect(mockEnterSite).toHaveBeenCalledWith('site-8');
        expect(mockGetMyProfile).toHaveBeenCalled();
    });

    it('treats a cloud 1:1 as placeless: no switch, no profile step, but a warning', async () => {
        roomRowIs({ id: 'ch-1', sid: 'site-8', stereo: 'dm', cid: 'cloud-1' });

        const result = await runAccept(
            ctx({ info: { cloudId: 'cloud-1', channelId: 'ch-1' } } as Partial<InviteContext>)
        );

        expect(mockEnterSite).not.toHaveBeenCalled();
        expect(mockGetMyProfile).not.toHaveBeenCalled();
        expect(mockLoggerWarn).toHaveBeenCalledWith(
            'INVITE',
            expect.stringContaining('names no place'),
            expect.anything()
        );
        expect(mockEnterChannel).toHaveBeenCalled();
        expect(result.current.errorKey).toBeNull();
    });

    it('enters without the step, and says so, when the room cannot be read', async () => {
        mockSyncChannels.mockRejectedValue(new Error('503 SOCKET NOT CONNECTED'));

        const result = await runAccept(
            ctx({ info: { cloudId: 'cloud-1', channelId: 'ch-1' } } as Partial<InviteContext>)
        );

        expect(mockEnterSite).not.toHaveBeenCalled();
        expect(mockLoggerWarn).toHaveBeenCalledWith(
            'INVITE',
            expect.stringContaining('names no place'),
            expect.anything()
        );
        expect(mockEnterChannel).toHaveBeenCalled();
        expect(result.current.errorKey).toBeNull();
    });
});
