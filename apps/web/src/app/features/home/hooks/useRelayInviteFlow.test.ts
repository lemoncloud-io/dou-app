import { act, renderHook, waitFor } from '@testing-library/react';

import { useRelayInviteFlow } from './useRelayInviteFlow';

const getInvite = jest.fn();
const acceptInvite = jest.fn();
const resolveChannel = jest.fn();
const setPendingChannel = jest.fn();
const navigate = jest.fn();
const toast = jest.fn();
const recordDeclinedInvite = jest.fn();

let mockNick: string | undefined;

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('../../../hooks', () => ({
    useRelayInviteMutations: () => ({ getInvite, acceptInvite }),
    useMyProfile: () => ({ profile: mockNick ? { nick: mockNick } : null }),
}));
// The 3-tier resolution has its own suite (useResolveInviteChannel.test.ts); mocking it here keeps this
// one off real timers and lets it assert the hand-off instead.
jest.mock('./useResolveInviteChannel', () => ({ useResolveInviteChannel: () => ({ resolveChannel }) }));
jest.mock('../lib', () => ({ recordDeclinedInvite: (...args: unknown[]) => recordDeclinedInvite(...args) }));
jest.mock('../../../stores/usePendingInviteChannel', () => ({
    usePendingInviteChannel: (selector: (s: unknown) => unknown) => selector({ setPendingChannel }),
}));

const CODE = 'invt:1:secret';

/** `invite.get` / `invite.accept` view. `state` is the only success signal the contract gives us. */
const view = (over: Record<string, unknown> = {}) => ({ id: 'inv-1', state: 'pending', ...over });

/** A rejected socket call. The status is recovered from the message prefix (see getSocketErrorCode). */
const socketError = (status: number) => Object.assign(new Error(`${status} FORBIDDEN - nope`), { errorCode: status });

/** Pins channel resolution open so a test can inspect the phase while it is in flight. */
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
    mockNick = '토끼';
    getInvite.mockResolvedValue(view());
    acceptInvite.mockResolvedValue(view({ state: 'accepted' }));
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

    it('404는 유효하지 않은 초대로 통합한다 (취소와 구분 불가)', async () => {
        getInvite.mockRejectedValue(socketError(404));
        const { result } = mount();

        await waitFor(() => expect(result.current.notice).toBe('notFound'));
    });
});

describe('useRelayInviteFlow — 스텝 순서 (ADR-0033 D10)', () => {
    it('needVerify면 인증 → 프로필 → 수락 순으로 진행한다', async () => {
        mockNick = undefined;
        getInvite.mockResolvedValue(view({ needVerify: true }));
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());
        await waitFor(() => expect(result.current.phase).toBe('verifying'));
        expect(acceptInvite).not.toHaveBeenCalled();

        // Verified: the session is now the main user, so the server stops asking.
        getInvite.mockResolvedValue(view({ needVerify: false }));
        act(() => result.current.onVerified());
        await waitFor(() => expect(result.current.phase).toBe('profiling'));
        expect(acceptInvite).not.toHaveBeenCalled();

        mockNick = '토끼';
        act(() => result.current.onProfileSaved());
        await waitFor(() => expect(acceptInvite).toHaveBeenCalledWith(CODE));
    });

    it('인증도 프로필도 필요 없으면 곧바로 수락한다', async () => {
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());

        await waitFor(() => expect(acceptInvite).toHaveBeenCalledWith(CODE));
    });

    it('스텝 전환마다 getInvite로 재검증한다', async () => {
        mockNick = undefined;
        getInvite.mockResolvedValue(view({ needVerify: true }));
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));
        expect(getInvite).toHaveBeenCalledTimes(1);

        act(() => result.current.accept());
        await waitFor(() => expect(getInvite).toHaveBeenCalledTimes(2));

        getInvite.mockResolvedValue(view());
        act(() => result.current.onVerified());
        await waitFor(() => expect(getInvite).toHaveBeenCalledTimes(3));

        mockNick = '토끼';
        act(() => result.current.onProfileSaved());
        await waitFor(() => expect(getInvite).toHaveBeenCalledTimes(4));
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
});

describe('useRelayInviteFlow — 수락 결과', () => {
    it('채널이 도착하면 pending 채널로 넘기고 홈으로 보낸다', async () => {
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());

        await waitFor(() => expect(setPendingChannel).toHaveBeenCalledWith('ch-new'));
        expect(navigate).toHaveBeenCalledWith('/', { replace: true });
        expect(toast).not.toHaveBeenCalled();
    });

    it('채널이 제때 안 오면 안내 토스트와 함께 홈으로 보낸다', async () => {
        resolveChannel.mockResolvedValue(null);
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());

        await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'relayInviteAccept.channelPending' }));
        expect(setPendingChannel).not.toHaveBeenCalled();
        expect(navigate).toHaveBeenCalledWith('/', { replace: true });
    });

    it('수락 응답의 channelId를 해소 1단으로 넘긴다 (ADR-0035)', async () => {
        acceptInvite.mockResolvedValue(view({ state: 'accepted', channelId: 'ch-accepted' }));
        resolveChannel.mockResolvedValue('ch-accepted');
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());

        await waitFor(() => expect(setPendingChannel).toHaveBeenCalledWith('ch-accepted'));
        expect(resolveChannel).toHaveBeenCalledWith(CODE, { acceptedChannelId: 'ch-accepted' });
    });

    it('수락 응답에 channelId가 없으면 1단을 비운 채로 해소를 맡긴다', async () => {
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());

        await waitFor(() => expect(setPendingChannel).toHaveBeenCalledWith('ch-new'));
        expect(resolveChannel).toHaveBeenCalledWith(CODE, { acceptedChannelId: undefined });
    });

    it('1단으로 즉시 해소되면 채널 대기 페이즈를 거치지 않는다', async () => {
        acceptInvite.mockResolvedValue(view({ state: 'accepted', channelId: 'ch-accepted' }));
        const held = holdResolution();
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());
        // Resolution is still in flight — with tier 1 in hand there is nothing to wait for, so the
        // spinner phase must never be entered.
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

describe('useRelayInviteFlow — 거절 스텁', () => {
    it('서버 호출 없이 초대 id만 남기고 홈으로 간다', async () => {
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.decline());

        expect(recordDeclinedInvite).toHaveBeenCalledWith('inv-1');
        expect(acceptInvite).not.toHaveBeenCalled();
        expect(navigate).toHaveBeenCalledWith('/', { replace: true });
        expect(result.current.phase).toBe('closed');
    });

    it('진행 중에는 닫기를 무시한다', async () => {
        let release: (v: unknown) => void = () => undefined;
        acceptInvite.mockReturnValue(new Promise(resolve => (release = resolve)));
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());
        await waitFor(() => expect(acceptInvite).toHaveBeenCalled());

        act(() => result.current.close());
        expect(navigate).not.toHaveBeenCalled();

        await act(async () => {
            release(view({ state: 'accepted' }));
        });
    });
});
