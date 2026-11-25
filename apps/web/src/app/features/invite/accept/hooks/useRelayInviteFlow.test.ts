import { act, renderHook, waitFor } from '@testing-library/react';

import { configurePerfTraces, resetPerfTraces } from '@chatic/perf';

import { useRelayInviteFlow } from './useRelayInviteFlow';

const getInvite = jest.fn();
const acceptInvite = jest.fn();
const rejectInvite = jest.fn();
const resolveChannel = jest.fn();
const setPendingChannel = jest.fn();
const enterStack = jest.fn();
const toast = jest.fn();
const mockWaitUntilVerified = jest.fn();
const isPlaceProfileAbsent = jest.fn();
let mockSid: string | null = 'site-1';
let mockIsGuest = true;
let mockActiveIsGuest = true;
let mockActiveKind: 'relay' | 'cloud' = 'relay';
const logoutCloudSession = jest.fn();
let mockRelaySid: string | null = null;
const loggerError = jest.fn();
const loggerWarn = jest.fn();

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/runtime-react', () =>
    require('@chatic/runtime-react/testing').fakeRuntimeModule({
        connection: {
            RELAY_SLOT: 'default',
            waitUntilVerified: (...args: unknown[]) => mockWaitUntilVerified(...args),
        },
        data: {
            useRuntimeRepositories: () => ({ profile: { id: 'profile-repo' } }),
        },
        session: {
            useRuntimeProfile: () => ({ isGuest: mockActiveIsGuest }),
            getGlobalSessionContext: () => ({ activeServer: { kind: mockActiveKind, siteId: mockSid } }),
        },
    })
);
jest.mock('@chatic/bridges', () => ({
    logger: {
        error: (...a: unknown[]) => loggerError(...a),
        warn: (...a: unknown[]) => loggerWarn(...a),
        info: jest.fn(),
    },
}));
jest.mock('../../../../navigation', () => ({ useStackNavigate: () => enterStack }));
jest.mock('../../../../runtime/useLogoutCloudSession', () => ({
    useLogoutCloudSession: () => ({ logoutCloudSession }),
}));

jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('../../../../hooks', () => ({
    useRelayInviteMutations: () => ({ getInvite, acceptInvite, rejectInvite }),
    useIsAccountGuest: () => mockIsGuest,
}));
jest.mock('../../../../utils/placeProfile', () => ({
    isPlaceProfileAbsent: (...args: unknown[]) => isPlaceProfileAbsent(...args),
}));
jest.mock('./useResolveInviteChannel', () => ({ useResolveInviteChannel: () => ({ resolveChannel }) }));
jest.mock('../../../../stores/usePendingInviteChannel', () => ({
    usePendingInviteChannel: (selector: (s: unknown) => unknown) => selector({ setPendingChannel }),
}));

const CODE = 'invt:1:secret';

const view = (over: Record<string, unknown> = {}) => ({ id: 'inv-1', state: 'pending', ...over });

const socketError = (status: number) => Object.assign(new Error(`${status} FORBIDDEN - nope`), { errorCode: status });

const holdResolution = () => {
    let release: (channelId: string | null) => void = () => undefined;
    resolveChannel.mockReturnValue(
        new Promise<string | null>(resolve => {
            release = resolve;
        })
    );
    return { release: (channelId: string | null) => release(channelId) };
};

const mount = () => renderHook(() => useRelayInviteFlow(CODE));

beforeEach(() => {
    jest.clearAllMocks();
    mockWaitUntilVerified.mockResolvedValue(true);
    getInvite.mockResolvedValue(view());
    acceptInvite.mockResolvedValue(view({ state: 'accepted' }));
    rejectInvite.mockResolvedValue(view({ state: 'rejected' }));
    mockSid = 'site-1';
    mockIsGuest = true;
    mockActiveIsGuest = true;
    mockActiveKind = 'relay';
    logoutCloudSession.mockImplementation(async () => {
        mockActiveKind = 'relay';
        mockSid = mockRelaySid;
    });
    mockRelaySid = null;
    isPlaceProfileAbsent.mockResolvedValue(false);
    resolveChannel.mockResolvedValue('ch-new');
});

describe('useRelayInviteFlow — 진입 조회', () => {
    it('pending이면 수락 화면으로 간다', async () => {
        const { result } = mount();

        await waitFor(() => expect(result.current.phase).toBe('review'));
        expect(getInvite).toHaveBeenCalledWith(CODE);
        expect(result.current.invite?.id).toBe('inv-1');
    });

    it('expired면 만료 안내로 간다', async () => {
        getInvite.mockResolvedValue(view({ state: 'expired' }));
        const { result } = mount();

        await waitFor(() => expect(result.current.phase).toBe('notice'));
        expect(result.current.notice).toBe('expired');
    });

    it('accepted면 이미 참여 안내로 간다', async () => {
        getInvite.mockResolvedValue(view({ state: 'accepted' }));
        const { result } = mount();

        await waitFor(() => expect(result.current.notice).toBe('alreadyJoined'));
    });

    it('404는 유효하지 않은 초대다 — 취소는 이제 상태로 오므로 에러와 섞이지 않는다', async () => {
        getInvite.mockRejectedValue(socketError(404));
        const { result } = mount();

        await waitFor(() => expect(result.current.notice).toBe('notFound'));
    });

    it('canceled면 초대 취소 안내로 간다 — 초대자가 거둔 초대 (ADR-0043)', async () => {
        getInvite.mockResolvedValue(view({ state: 'canceled' }));
        const { result } = mount();

        await waitFor(() => expect(result.current.notice).toBe('inviteCanceled'));
    });

    it('rejected면 거절한 초대 안내로 간다 — 같은 딥링크 재진입 (ADR-0043)', async () => {
        getInvite.mockResolvedValue(view({ state: 'rejected' }));
        const { result } = mount();

        await waitFor(() => expect(result.current.notice).toBe('rejected'));
    });
});

describe('useRelayInviteFlow — relay 핸드셰이크 게이트', () => {
    const holdHandshake = () => {
        let release: (verified: boolean) => void = () => undefined;
        mockWaitUntilVerified.mockReturnValue(
            new Promise<boolean>(resolve => {
                release = resolve;
            })
        );
        return { release: (verified: boolean) => release(verified) };
    };

    it('relay 슬롯이 인증될 때까지 invite.get을 보내지 않는다', async () => {
        const held = holdHandshake();
        const { result } = mount();

        await waitFor(() => expect(mockWaitUntilVerified).toHaveBeenCalledWith('default', 10_000));
        expect(getInvite).not.toHaveBeenCalled();
        expect(result.current.phase).toBe('loading');

        await act(async () => held.release(true));
        await waitFor(() => expect(getInvite).toHaveBeenCalledWith(CODE));
    });

    it('active 슬롯이 아니라 relay 슬롯을 기다린다', async () => {
        mount();

        await waitFor(() => expect(mockWaitUntilVerified).toHaveBeenCalled());
        expect(mockWaitUntilVerified.mock.calls[0][0]).toBe('default');
    });

    it('핸드셰이크가 타임아웃해도 조회는 시도한다 (best-effort)', async () => {
        mockWaitUntilVerified.mockResolvedValue(false);
        const { result } = mount();

        await waitFor(() => expect(result.current.phase).toBe('review'));
        expect(getInvite).toHaveBeenCalledWith(CODE);
        expect(loggerWarn).toHaveBeenCalled();
    });

    it('분류되지 않는 실패는 generic으로 떨어뜨리되 원인을 남긴다', async () => {
        getInvite.mockRejectedValue(new Error('[SocketManager] no relay slot bound for request(invite.get)'));
        const { result } = mount();

        await waitFor(() => expect(result.current.notice).toBe('generic'));
        expect(loggerError).toHaveBeenCalled();
    });
});

describe('useRelayInviteFlow — relay socket closed under a request', () => {
    const socketClosed = () => new Error('499 CLIENT CLOSED REQUEST - socket closed - relay.request(invite.get)');
    const notConnected = () => new Error('503 SOCKET NOT CONNECTED - WebSocketTransport.send()');

    it('reads the invite again once the relay is back, instead of showing the generic notice', async () => {
        getInvite.mockRejectedValueOnce(socketClosed());
        const { result } = mount();

        await waitFor(() => expect(result.current.phase).toBe('review'));
        expect(getInvite).toHaveBeenCalledTimes(2);
        expect(mockWaitUntilVerified).toHaveBeenCalledTimes(2);
        expect(loggerError).not.toHaveBeenCalled();
        expect(loggerWarn).toHaveBeenCalledWith(
            'INVITE',
            '[useRelayInviteFlow] relay socket closed during entry; retrying after reconnect',
            expect.anything()
        );
    });

    it('treats a request sent while the socket was down (503) the same way', async () => {
        getInvite.mockRejectedValueOnce(notConnected());
        const { result } = mount();

        await waitFor(() => expect(result.current.phase).toBe('review'));
        expect(getInvite).toHaveBeenCalledTimes(2);
    });

    it('retries once only: a second lost socket is the generic notice, with its retry', async () => {
        getInvite.mockRejectedValueOnce(socketClosed()).mockRejectedValueOnce(socketClosed());
        const { result } = mount();

        await waitFor(() => expect(result.current.notice).toBe('generic'));
        expect(getInvite).toHaveBeenCalledTimes(2);
    });

    it('does not send the read again when the relay did not come back within the wait', async () => {
        getInvite.mockRejectedValueOnce(socketClosed());
        mockWaitUntilVerified.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
        const { result } = mount();

        await waitFor(() => expect(result.current.notice).toBe('generic'));
        expect(getInvite).toHaveBeenCalledTimes(1);
    });

    it('does not retry a server answer', async () => {
        getInvite.mockRejectedValue(socketError(404));
        const { result } = mount();

        await waitFor(() => expect(result.current.notice).toBe('notFound'));
        expect(getInvite).toHaveBeenCalledTimes(1);
        expect(mockWaitUntilVerified).toHaveBeenCalledTimes(1);
    });

    it('sends nothing more once the flow is gone while the retry waits for the relay', async () => {
        getInvite.mockRejectedValueOnce(socketClosed());
        let release: (verified: boolean) => void = () => undefined;
        mockWaitUntilVerified.mockResolvedValueOnce(true).mockReturnValueOnce(
            new Promise<boolean>(resolve => {
                release = resolve;
            })
        );
        const { unmount } = mount();
        await waitFor(() => expect(mockWaitUntilVerified).toHaveBeenCalledTimes(2));

        unmount();
        await act(async () => release(true));

        expect(getInvite).toHaveBeenCalledTimes(1);
        expect(loggerError).not.toHaveBeenCalled();
    });

    it("retries advance()'s re-read the same way and goes on to accept", async () => {
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));
        getInvite.mockRejectedValueOnce(socketClosed());

        act(() => result.current.accept());

        await waitFor(() => expect(setPendingChannel).toHaveBeenCalledWith('ch-new'));
        expect(acceptInvite).toHaveBeenCalledTimes(1);
    });

    it('sends the accept again after its answer was lost — the server answers its own accept as accepted', async () => {
        acceptInvite.mockRejectedValueOnce(socketClosed());
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());

        await waitFor(() => expect(setPendingChannel).toHaveBeenCalledWith('ch-new'));
        expect(acceptInvite).toHaveBeenCalledTimes(2);
        expect(result.current.notice).toBeNull();
    });

    it('ends a twice-lost accept at the generic notice', async () => {
        acceptInvite.mockRejectedValueOnce(socketClosed()).mockRejectedValueOnce(socketClosed());
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());

        await waitFor(() => expect(result.current.notice).toBe('generic'));
        expect(acceptInvite).toHaveBeenCalledTimes(2);
    });

    it('still routes an accept refused as a guest (403) to verification without retrying it', async () => {
        acceptInvite.mockRejectedValueOnce(socketError(403));
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());

        await waitFor(() => expect(result.current.phase).toBe('verifying'));
        expect(acceptInvite).toHaveBeenCalledTimes(1);
    });
});

describe('useRelayInviteFlow — 인증 모드 결정', () => {
    it('게스트는 세션을 여는 login이다', async () => {
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        expect(result.current.verifyMode).toBe('login');
    });

    it('이미 메인 유저(번호만 없는 소셜 계정)면 link다 — login은 서버가 400으로 막는다', async () => {
        mockIsGuest = false;
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        expect(result.current.verifyMode).toBe('link');
    });

    it('reads the relay account, so a guest inside a cloud still verifies with login', async () => {
        mockActiveIsGuest = false;
        mockIsGuest = true;
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        expect(result.current.verifyMode).toBe('login');
    });

    it('reads the relay account, so a main user inside a cloud where they are a guest still links', async () => {
        mockActiveIsGuest = true;
        mockIsGuest = false;
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        expect(result.current.verifyMode).toBe('link');
    });
});

describe('useRelayInviteFlow — 스텝 순서', () => {
    it('needVerify면 인증 → 수락 순으로 진행한다', async () => {
        getInvite.mockResolvedValue(view({ needVerify: true }));
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());
        await waitFor(() => expect(result.current.phase).toBe('verifying'));
        expect(acceptInvite).not.toHaveBeenCalled();

        getInvite.mockResolvedValue(view({ needVerify: false }));
        act(() => result.current.onVerified());
        await waitFor(() => expect(acceptInvite).toHaveBeenCalledWith(CODE));
    });

    it('인증을 마쳤는데도 needVerify가 남아 있으면 무한 반복 대신 번호 불일치로 끝낸다', async () => {
        getInvite.mockResolvedValue(view({ needVerify: true }));
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());
        await waitFor(() => expect(result.current.phase).toBe('verifying'));

        act(() => result.current.onVerified());

        await waitFor(() => expect(result.current.notice).toBe('wrongNumber'));
        expect(result.current.phase).toBe('notice');
        expect(acceptInvite).not.toHaveBeenCalled();
    });

    it('link 모드인데 초대에 last4가 없으면 대조할 수단이 없으므로 인증을 시작하지 않는다', async () => {
        mockIsGuest = false;
        getInvite.mockResolvedValue(view({ needVerify: true, last4: undefined }));
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());

        await waitFor(() => expect(result.current.notice).toBe('generic'));
        expect(result.current.phase).toBe('notice');
    });

    it('login 모드는 last4가 없어도 진행한다 — 대조는 서버가 초대 코드로 한다', async () => {
        getInvite.mockResolvedValue(view({ needVerify: true, last4: undefined }));
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());

        await waitFor(() => expect(result.current.phase).toBe('verifying'));
    });

    it('프로필이 없으면 수락하지 않고 프로필 설정으로 보낸다 (ADR-0041)', async () => {
        isPlaceProfileAbsent.mockResolvedValue(true);
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());

        await waitFor(() => expect(result.current.phase).toBe('profiling'));
        expect(acceptInvite).not.toHaveBeenCalled();
    });

    it('프로필을 저장하면 재검증 후 수락한다', async () => {
        isPlaceProfileAbsent.mockResolvedValue(true);
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));
        act(() => result.current.accept());
        await waitFor(() => expect(result.current.phase).toBe('profiling'));

        act(() => result.current.onProfileSaved());

        await waitFor(() => expect(acceptInvite).toHaveBeenCalledWith(CODE));
        expect(getInvite).toHaveBeenCalledTimes(3);
    });

    it('accepts without a profile when the profile step is skipped', async () => {
        isPlaceProfileAbsent.mockResolvedValue(true);
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));
        act(() => result.current.accept());
        await waitFor(() => expect(result.current.phase).toBe('profiling'));
        expect(acceptInvite).not.toHaveBeenCalled();

        act(() => result.current.skipProfile());

        await waitFor(() => expect(acceptInvite).toHaveBeenCalledWith(CODE));
        expect(result.current.phase).not.toBe('review');
    });

    it('저장 뒤에는 판정을 다시 묻지 않는다 — profile.set이 곧바로 읽히지 않을 수 있다', async () => {
        isPlaceProfileAbsent.mockResolvedValue(true);
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));
        act(() => result.current.accept());
        await waitFor(() => expect(result.current.phase).toBe('profiling'));

        act(() => result.current.onProfileSaved());

        await waitFor(() => expect(acceptInvite).toHaveBeenCalledWith(CODE));
    });

    it('인증이 프로필보다 먼저다 — 승격 전에는 쓸 사이트가 없다', async () => {
        getInvite.mockResolvedValue(view({ needVerify: true }));
        isPlaceProfileAbsent.mockResolvedValue(true);
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());

        await waitFor(() => expect(result.current.phase).toBe('verifying'));
        expect(isPlaceProfileAbsent).not.toHaveBeenCalled();
    });

    it('프로필 화면에 머무는 동안 만료되면 수락하지 않고 만료 안내로 간다', async () => {
        isPlaceProfileAbsent.mockResolvedValue(true);
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));
        act(() => result.current.accept());
        await waitFor(() => expect(result.current.phase).toBe('profiling'));

        getInvite.mockResolvedValue(view({ state: 'expired' }));
        act(() => result.current.onProfileSaved());

        await waitFor(() => expect(result.current.notice).toBe('expired'));
        expect(acceptInvite).not.toHaveBeenCalled();
    });

    it('인증이 필요 없으면 곧바로 수락한다', async () => {
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());

        await waitFor(() => expect(acceptInvite).toHaveBeenCalledWith(CODE));
    });

    it('스텝 전환마다 getInvite로 재검증한다', async () => {
        getInvite.mockResolvedValue(view({ needVerify: true }));
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));
        expect(getInvite).toHaveBeenCalledTimes(1);

        act(() => result.current.accept());
        await waitFor(() => expect(getInvite).toHaveBeenCalledTimes(2));

        getInvite.mockResolvedValue(view());
        act(() => result.current.onVerified());
        await waitFor(() => expect(getInvite).toHaveBeenCalledTimes(3));
    });

    it('인증 도중 만료되면 수락하지 않고 만료 안내로 떨어진다', async () => {
        getInvite.mockResolvedValue(view({ needVerify: true }));
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());
        await waitFor(() => expect(result.current.phase).toBe('verifying'));

        getInvite.mockResolvedValue(view({ state: 'expired' }));
        act(() => result.current.onVerified());

        await waitFor(() => expect(result.current.notice).toBe('expired'));
        expect(acceptInvite).not.toHaveBeenCalled();
    });

    it('인증/프로필을 중단하면 수락 화면으로 돌아간다', async () => {
        getInvite.mockResolvedValue(view({ needVerify: true }));
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());
        await waitFor(() => expect(result.current.phase).toBe('verifying'));

        act(() => result.current.cancelStep());
        expect(result.current.phase).toBe('review');
    });

    it('활성 사이트가 없으면 프로필을 묻지 않고 수락한다 (수락 불가 방지)', async () => {
        mockSid = null;
        isPlaceProfileAbsent.mockResolvedValue(true);
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());

        await waitFor(() => expect(acceptInvite).toHaveBeenCalledWith(CODE));
        expect(isPlaceProfileAbsent).not.toHaveBeenCalled();
    });

    it('프로필 설정을 그만두고 다시 수락하면 판정을 다시 묻는다', async () => {
        isPlaceProfileAbsent.mockResolvedValue(true);
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));
        act(() => result.current.accept());
        await waitFor(() => expect(result.current.phase).toBe('profiling'));

        act(() => result.current.cancelStep());
        act(() => result.current.accept());

        await waitFor(() => expect(result.current.phase).toBe('profiling'));
        expect(isPlaceProfileAbsent).toHaveBeenCalledTimes(2);
        expect(acceptInvite).not.toHaveBeenCalled();
    });

    it('인증을 지나면 저장 기록을 버리고 프로필을 다시 판정한다', async () => {
        isPlaceProfileAbsent.mockResolvedValue(true);
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());
        await waitFor(() => expect(result.current.phase).toBe('profiling'));
        act(() => result.current.onProfileSaved());

        acceptInvite.mockRejectedValueOnce(socketError(403));
        await waitFor(() => expect(result.current.phase).toBe('verifying'));

        act(() => result.current.onVerified());

        await waitFor(() => expect(result.current.phase).toBe('profiling'));
        expect(acceptInvite).toHaveBeenCalledTimes(1);
    });

    it('프로필 설정을 그만두면 수락하지 않고 수락 화면으로 돌아간다 (ADR-0041)', async () => {
        isPlaceProfileAbsent.mockResolvedValue(true);
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));
        act(() => result.current.accept());
        await waitFor(() => expect(result.current.phase).toBe('profiling'));

        act(() => result.current.cancelStep());

        expect(result.current.phase).toBe('review');
        expect(acceptInvite).not.toHaveBeenCalled();
    });
});

describe('useRelayInviteFlow — 수락 결과', () => {
    it('hands a resolved room over and leaves by the deeplink rule, not by replacing with home', async () => {
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());

        await waitFor(() => expect(setPendingChannel).toHaveBeenCalledWith('ch-new'));
        expect(enterStack).toHaveBeenCalledWith('deeplink', '/');
        expect(toast).not.toHaveBeenCalled();
    });

    it('채널이 제때 안 오면 안내 토스트와 함께 홈으로 보낸다', async () => {
        resolveChannel.mockResolvedValue(null);
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());

        await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'relayInviteAccept.channelPending' }));
        expect(setPendingChannel).not.toHaveBeenCalled();
        expect(enterStack).toHaveBeenCalledWith('deeplink', '/');
    });

    it('수락 응답의 channelId를 해소 1단으로 넘긴다 (ADR-0035)', async () => {
        acceptInvite.mockResolvedValue(view({ state: 'accepted', channelId: 'ch-accepted' }));
        resolveChannel.mockResolvedValue('ch-accepted');
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());

        await waitFor(() => expect(setPendingChannel).toHaveBeenCalledWith('ch-accepted'));
        expect(resolveChannel).toHaveBeenCalledWith(
            CODE,
            expect.objectContaining({ acceptedChannelId: 'ch-accepted' })
        );
    });

    it('수락 응답에 channelId가 없으면 1단을 비운 채로 해소를 맡긴다', async () => {
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());

        await waitFor(() => expect(setPendingChannel).toHaveBeenCalledWith('ch-new'));
        expect(resolveChannel).toHaveBeenCalledWith(CODE, expect.objectContaining({ acceptedChannelId: undefined }));
    });

    it('hands the inviter from the re-read to the resolver, so the room push can be watched', async () => {
        getInvite.mockResolvedValue(view({ inviterId: 'inviter-1' }));
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());

        await waitFor(() => expect(setPendingChannel).toHaveBeenCalledWith('ch-new'));
        expect(resolveChannel).toHaveBeenCalledWith(CODE, expect.objectContaining({ inviterId: 'inviter-1' }));
    });

    it('1단으로 즉시 해소되면 채널 대기 페이즈를 거치지 않는다', async () => {
        acceptInvite.mockResolvedValue(view({ state: 'accepted', channelId: 'ch-accepted' }));
        const held = holdResolution();
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());
        await waitFor(() => expect(resolveChannel).toHaveBeenCalled());
        expect(result.current.phase).not.toBe('awaitingChannel');

        await act(async () => held.release('ch-accepted'));
        expect(setPendingChannel).toHaveBeenCalledWith('ch-accepted');
    });

    it('1단이 비면 해소가 끝날 때까지 채널 대기 페이즈에 머문다', async () => {
        const held = holdResolution();
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());

        await waitFor(() => expect(result.current.phase).toBe('awaitingChannel'));
        await act(async () => held.release('ch-new'));
        expect(result.current.phase).toBe('closed');
    });

    it('accepted가 아니면 성공으로 치지 않는다', async () => {
        acceptInvite.mockResolvedValue(view({ state: 'pending' }));
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());

        await waitFor(() => expect(result.current.notice).toBe('generic'));
        expect(setPendingChannel).not.toHaveBeenCalled();
    });

    it('아직 메인유저가 아니어서 403이면 인증으로 보낸다', async () => {
        acceptInvite.mockRejectedValue(socketError(403));
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());

        await waitFor(() => expect(result.current.phase).toBe('verifying'));
    });

    it('인증을 마쳤는데도 403이면 번호 불일치로 끝낸다', async () => {
        acceptInvite.mockRejectedValue(socketError(403));
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.onVerified());

        await waitFor(() => expect(result.current.notice).toBe('wrongNumber'));
    });

    it('403으로 인증에 보내질 때는 role 캐시와 무관하게 login으로 고정한다', async () => {
        mockIsGuest = false;
        acceptInvite.mockRejectedValue(socketError(403));
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));
        expect(result.current.verifyMode).toBe('link');

        act(() => result.current.accept());

        await waitFor(() => expect(result.current.phase).toBe('verifying'));
        expect(result.current.verifyMode).toBe('login');
    });

    it('수락 시점 400은 만료, 409는 선점으로 매핑한다', async () => {
        acceptInvite.mockRejectedValue(socketError(400));
        const expired = mount();
        await waitFor(() => expect(expired.result.current.phase).toBe('review'));
        act(() => expired.result.current.accept());
        await waitFor(() => expect(expired.result.current.notice).toBe('expired'));

        acceptInvite.mockRejectedValue(socketError(409));
        const taken = mount();
        await waitFor(() => expect(taken.result.current.phase).toBe('review'));
        act(() => taken.result.current.accept());
        await waitFor(() => expect(taken.result.current.notice).toBe('taken'));
    });
});

describe('useRelayInviteFlow — 다시 시도', () => {
    it('진입 조회부터 다시 돌려서 수락 화면으로 복구한다', async () => {
        getInvite.mockRejectedValueOnce(new Error('500 INTERNAL'));
        const { result } = mount();
        await waitFor(() => expect(result.current.notice).toBe('generic'));

        act(() => result.current.retry());

        await waitFor(() => expect(result.current.phase).toBe('review'));
        expect(getInvite).toHaveBeenCalledTimes(2);
        expect(result.current.notice).toBeNull();
    });

    it('수락 실패 뒤에도 조회부터 다시 시작한다', async () => {
        acceptInvite.mockRejectedValueOnce(new Error('500 INTERNAL'));
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));
        act(() => result.current.accept());
        await waitFor(() => expect(result.current.notice).toBe('generic'));

        act(() => result.current.retry());

        await waitFor(() => expect(result.current.phase).toBe('review'));
        expect(acceptInvite).toHaveBeenCalledTimes(1);
    });

    it('다시 시도 직후의 닫기 신호는 홈으로 보내지 않는다', async () => {
        getInvite.mockRejectedValueOnce(new Error('500 INTERNAL'));
        const { result } = mount();
        await waitFor(() => expect(result.current.notice).toBe('generic'));

        act(() => {
            result.current.retry();
            result.current.dismissNotice();
        });

        await waitFor(() => expect(result.current.phase).toBe('review'));
        expect(enterStack).not.toHaveBeenCalled();
    });

    it('안내를 그대로 닫으면 홈으로 간다', async () => {
        getInvite.mockRejectedValue(new Error('503 SOCKET NOT CONNECTED'));
        const { result } = mount();
        await waitFor(() => expect(result.current.notice).toBe('generic'));

        act(() => result.current.dismissNotice());

        expect(result.current.phase).toBe('closed');
        expect(enterStack).toHaveBeenCalledWith('deeplink', '/');
    });
});

describe('useRelayInviteFlow — 거절 (실 invite.reject, ADR-0043)', () => {
    it('decline은 확인 다이얼로그(declining)만 연다 — 종국 액션은 확인 전에 나가지 않는다', async () => {
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.decline());

        expect(result.current.phase).toBe('declining');
        expect(rejectInvite).not.toHaveBeenCalled();
        expect(acceptInvite).not.toHaveBeenCalled();
        expect(enterStack).not.toHaveBeenCalled();
    });

    it('다이얼로그에서 물러나면(cancelStep) 아무것도 보내지 않고 review로 돌아간다', async () => {
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.decline());
        act(() => result.current.cancelStep());

        expect(result.current.phase).toBe('review');
        expect(rejectInvite).not.toHaveBeenCalled();
    });

    it('확인하면 invite.reject를 보내고 rejected 응답에 토스트 후 홈으로 간다', async () => {
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.decline());
        await act(async () => result.current.confirmDecline());

        expect(rejectInvite).toHaveBeenCalledWith(CODE);
        expect(toast).toHaveBeenCalledWith({ title: 'relayInviteAccept.declinedToast' });
        expect(enterStack).toHaveBeenCalledWith('deeplink', '/');
        expect(result.current.phase).toBe('closed');
    });

    it('요청이 나가 있는 동안 phase는 declining에 머물고 isRejecting만 켜진다 — submitting으로 넘어가면 수락 화면 스피너가 잘못 뜬다', async () => {
        let release: (view: unknown) => void = () => undefined;
        rejectInvite.mockReturnValue(new Promise(resolve => (release = resolve)));
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));
        act(() => result.current.decline());

        act(() => void result.current.confirmDecline());
        await waitFor(() => expect(result.current.isRejecting).toBe(true));
        expect(result.current.phase).toBe('declining');

        await act(async () => release(view({ state: 'rejected' })));
        expect(result.current.phase).toBe('closed');
    });

    it('응답 state가 rejected가 아니면 generic으로 떨어지고 isRejecting은 꺼진다 — 성공 플래그는 state뿐이다', async () => {
        rejectInvite.mockResolvedValue(view({ state: 'pending' }));
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.decline());
        await act(async () => result.current.confirmDecline());

        await waitFor(() => expect(result.current.notice).toBe('generic'));
        expect(result.current.isRejecting).toBe(false);
    });

    it('409(이미 수락)는 alreadyJoined 안내다 — 가로챈 남이 아니라 본인이 수락한 것이다', async () => {
        rejectInvite.mockRejectedValue(socketError(409));
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.decline());
        await act(async () => result.current.confirmDecline());

        await waitFor(() => expect(result.current.notice).toBe('alreadyJoined'));
        expect(enterStack).not.toHaveBeenCalled();
    });

    it('그 외 실패는 조회 단계와 같은 매핑이다 (404 → notFound)', async () => {
        rejectInvite.mockRejectedValue(socketError(404));
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.decline());
        await act(async () => result.current.confirmDecline());

        await waitFor(() => expect(result.current.notice).toBe('notFound'));
    });

    it('진행 중에는 닫기를 무시한다', async () => {
        let release: (v: unknown) => void = () => undefined;
        acceptInvite.mockReturnValue(new Promise(resolve => (release = resolve)));
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());
        await waitFor(() => expect(acceptInvite).toHaveBeenCalled());

        act(() => result.current.close());
        expect(enterStack).not.toHaveBeenCalled();

        await act(async () => {
            release(view({ state: 'accepted' }));
        });
    });
});

describe('useRelayInviteFlow — invite_accept trace', () => {
    const backend = { start: jest.fn(), stop: jest.fn() };
    const stopped = () => backend.stop.mock.calls.map(([record]) => record);

    beforeEach(() => configurePerfTraces(backend));
    afterEach(() => resetPerfTraces());

    it('times a run from Accept to the room, with each step marked and the way the room was found', async () => {
        resolveChannel.mockImplementation(async (_code: string, options: { onResolved?: (s: string) => void }) => {
            options.onResolved?.('push');
            return 'ch-new';
        });
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());

        await waitFor(() => expect(stopped()).toHaveLength(1));
        expect(stopped()[0]).toMatchObject({
            name: 'invite_accept',
            attributes: { lane: 'relay', room: 'push', outcome: 'ok' },
        });
        expect(Object.keys(stopped()[0].metrics)).toEqual(['invite_read', 'accepted', 'room']);
    });

    it('records a room that never came as pending', async () => {
        resolveChannel.mockResolvedValue(null);
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());

        await waitFor(() => expect(stopped()).toHaveLength(1));
        expect(stopped()[0].attributes).toEqual({ lane: 'relay', room: 'none', outcome: 'pending' });
    });

    it('ends a run at verification and times the resumed run on its own', async () => {
        getInvite.mockResolvedValue(view({ needVerify: true }));
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());
        await waitFor(() => expect(result.current.phase).toBe('verifying'));
        getInvite.mockResolvedValue(view({ needVerify: false }));
        act(() => result.current.onVerified());

        await waitFor(() => expect(stopped()).toHaveLength(2));
        expect(stopped().map(record => record.attributes.outcome)).toEqual(['verify', 'ok']);
    });

    it('records a final state found on the re-read as a notice, not an error', async () => {
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));
        getInvite.mockResolvedValue(view({ state: 'expired' }));

        act(() => result.current.accept());

        await waitFor(() => expect(stopped()).toHaveLength(1));
        expect(stopped()[0].attributes).toEqual({ lane: 'relay', outcome: 'notice' });
    });

    it('names the accept step when invite.accept fails', async () => {
        acceptInvite.mockRejectedValue(socketError(409));
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());

        await waitFor(() => expect(stopped()).toHaveLength(1));
        expect(stopped()[0].attributes).toEqual({ lane: 'relay', step: 'accept', outcome: 'error' });
    });
});

describe('useRelayInviteFlow — accepting from inside a cloud', () => {
    beforeEach(() => {
        mockActiveKind = 'cloud';
        mockSid = 'cloud-place';
    });

    it("returns to relay before the profile check, so the cloud place's profile is never read", async () => {
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());

        await waitFor(() => expect(acceptInvite).toHaveBeenCalledWith(CODE));
        expect(logoutCloudSession).toHaveBeenCalledTimes(1);
        expect(isPlaceProfileAbsent).not.toHaveBeenCalled();
    });

    it("checks the relay place's profile once back on relay", async () => {
        mockRelaySid = 'relay-place';
        isPlaceProfileAbsent.mockImplementation(async () => {
            expect(mockSid).toBe('relay-place');
            return false;
        });
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());

        await waitFor(() => expect(acceptInvite).toHaveBeenCalledWith(CODE));
        expect(isPlaceProfileAbsent).toHaveBeenCalledTimes(1);
        expect(logoutCloudSession.mock.invocationCallOrder[0]).toBeLessThan(
            isPlaceProfileAbsent.mock.invocationCallOrder[0]
        );
    });

    it('stays in the cloud when the re-read finds the invite can no longer be accepted', async () => {
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));
        getInvite.mockResolvedValue(view({ state: 'expired' }));

        act(() => result.current.accept());

        await waitFor(() => expect(result.current.notice).toBe('expired'));
        expect(logoutCloudSession).not.toHaveBeenCalled();
    });

    it('leaves the cloud once, not again when verification resumes the flow', async () => {
        getInvite.mockResolvedValue(view({ needVerify: true }));
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());
        await waitFor(() => expect(result.current.phase).toBe('verifying'));
        getInvite.mockResolvedValue(view({ needVerify: false }));
        act(() => result.current.onVerified());

        await waitFor(() => expect(acceptInvite).toHaveBeenCalledWith(CODE));
        expect(logoutCloudSession).toHaveBeenCalledTimes(1);
    });

    it('stays put when relay is already the active session', async () => {
        mockActiveKind = 'relay';
        mockSid = 'site-1';
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());

        await waitFor(() => expect(acceptInvite).toHaveBeenCalledWith(CODE));
        expect(logoutCloudSession).not.toHaveBeenCalled();
    });

    it('accepts anyway when returning to relay fails, since the accept itself is relay-pinned', async () => {
        logoutCloudSession.mockRejectedValue(new Error('socket closed'));
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());

        await waitFor(() => expect(setPendingChannel).toHaveBeenCalledWith('ch-new'));
        expect(loggerWarn).toHaveBeenCalledWith(
            'INVITE',
            expect.stringContaining('return to relay'),
            expect.anything()
        );
    });

    it('does not move the session on a confirmed decline', async () => {
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.decline());
        await act(async () => result.current.confirmDecline());

        expect(rejectInvite).toHaveBeenCalledWith(CODE);
        expect(logoutCloudSession).not.toHaveBeenCalled();
    });
});
