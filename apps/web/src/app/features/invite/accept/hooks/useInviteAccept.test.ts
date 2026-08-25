import { act, renderHook } from '@testing-library/react';

import type { InviteContext } from '../types';

const mockRunInviteFlow = jest.fn();
const mockEnterCloud = jest.fn();
const mockEnterSite = jest.fn();
const mockEnterChannel = jest.fn();
const mockCacheWrite = jest.fn();
const mockToast = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@chatic/bridges', () => ({
    logger: {
        error: (...args: unknown[]) => mockLoggerError(...args),
        warn: jest.fn(),
        info: jest.fn(),
    },
}));
jest.mock('@chatic/web-core', () => ({
    useInviteFlow: () => ({ runInviteFlow: mockRunInviteFlow, isInviting: false }),
}));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock('@chatic/app-runtime', () => ({ useRuntimeRepositories: () => ({ cloud: { cacheWrite: mockCacheWrite } }) }));
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
        info: { cloudId: 'cloud-1', $envs: { backend: 'https://cloud.example', wss: 'wss://cloud.example' } },
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
    });

    it('성공 시 login → cacheWrite → cloud → site → channel 순서로 실행하고 에러 상태가 없다', async () => {
        const result = await runAccept(ctx());

        expect(mockRunInviteFlow).toHaveBeenCalledWith({ code: 'invt:1:abc', backend: 'https://cloud.example' });
        expect(mockCacheWrite).toHaveBeenCalledWith(expect.objectContaining({ id: 'cloud-1', cloudType: 'invited' }));
        expect(mockEnterCloud).toHaveBeenCalled();
        expect(mockEnterSite).toHaveBeenCalled();
        expect(mockEnterChannel).toHaveBeenCalled();
        expect(result.current.errorKey).toBeNull();
        expect(result.current.missingDelegator).toBe(false);
        expect(mockToast).not.toHaveBeenCalled();
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
});
