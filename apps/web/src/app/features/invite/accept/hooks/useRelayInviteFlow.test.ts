import { act, renderHook, waitFor } from '@testing-library/react';

import { useRelayInviteFlow } from './useRelayInviteFlow';

const getInvite = jest.fn();
const acceptInvite = jest.fn();
const rejectInvite = jest.fn();
const resolveChannel = jest.fn();
const setPendingChannel = jest.fn();
const navigate = jest.fn();
const toast = jest.fn();
const waitUntilKindVerified = jest.fn();
const isPlaceProfileAbsent = jest.fn();
let mockSid: string | null = 'site-1';
/** A deeplink usually lands in a fresh device session, so guest is the default here. */
let mockIsGuest = true;
const loggerError = jest.fn();
const loggerWarn = jest.fn();

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/app-runtime', () => ({
    getSocketManager: () => ({ waitUntilKindVerified }),
    // The flow only hands this to isPlaceProfileAbsent, which is mocked — an opaque token is enough.
    useRuntimeRepositories: () => ({ profile: { id: 'profile-repo' } }),
    useRuntimeProfile: () => ({ isGuest: mockIsGuest }),
}));
jest.mock('@chatic/bridges', () => ({
    logger: { error: (...a: unknown[]) => loggerError(...a), warn: (...a: unknown[]) => loggerWarn(...a) },
}));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
jest.mock('@chatic/web-core', () => ({ useSessionSelection: () => ({ selectedSiteId: mockSid }) }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('../../../../hooks', () => ({
    useRelayInviteMutations: () => ({ getInvite, acceptInvite, rejectInvite }),
}));
// The judgement has its own suite (utils/placeProfile.test.ts). Mocked here so this one drives the
// verdict directly instead of reconstructing get-mine responses.
jest.mock('../../../../utils/placeProfile', () => ({
    isPlaceProfileAbsent: (...args: unknown[]) => isPlaceProfileAbsent(...args),
}));
// The 3-tier resolution has its own suite (useResolveInviteChannel.test.ts); mocking it here keeps this
// one off real timers and lets it assert the hand-off instead.
jest.mock('./useResolveInviteChannel', () => ({ useResolveInviteChannel: () => ({ resolveChannel }) }));
jest.mock('../../../../stores/usePendingInviteChannel', () => ({
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
    waitUntilKindVerified.mockResolvedValue(true);
    getInvite.mockResolvedValue(view());
    acceptInvite.mockResolvedValue(view({ state: 'accepted' }));
    rejectInvite.mockResolvedValue(view({ state: 'rejected' }));
    // Default: a profile already exists, so the profile step stays out of the other tests' way.
    mockSid = 'site-1';
    mockIsGuest = true;
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
    /** Pins the handshake open so a test can assert nothing was sent while it is pending. */
    const holdHandshake = () => {
        let release: (verified: boolean) => void = () => undefined;
        waitUntilKindVerified.mockReturnValue(
            new Promise<boolean>(resolve => {
                release = resolve;
            })
        );
        return { release: (verified: boolean) => release(verified) };
    };

    it('relay 슬롯이 인증될 때까지 invite.get을 보내지 않는다', async () => {
        const held = holdHandshake();
        const { result } = mount();

        // 콜드 부팅 재현: 핸드셰이크가 끝나기 전에는 한 발도 나가면 안 된다.
        await waitFor(() => expect(waitUntilKindVerified).toHaveBeenCalledWith('relay', 10_000));
        expect(getInvite).not.toHaveBeenCalled();
        expect(result.current.phase).toBe('loading');

        await act(async () => held.release(true));
        await waitFor(() => expect(getInvite).toHaveBeenCalledWith(CODE));
    });

    it('active 슬롯이 아니라 relay 슬롯을 기다린다', async () => {
        mount();

        // cloud 세션이 떠 있으면 active는 cloud다 — waitUntilVerified로 걸면 relay를 안 기다린다.
        await waitFor(() => expect(waitUntilKindVerified).toHaveBeenCalled());
        expect(waitUntilKindVerified.mock.calls[0][0]).toBe('relay');
    });

    it('핸드셰이크가 타임아웃해도 조회는 시도한다 (best-effort)', async () => {
        waitUntilKindVerified.mockResolvedValue(false);
        const { result } = mount();

        await waitFor(() => expect(result.current.phase).toBe('review'));
        expect(getInvite).toHaveBeenCalledWith(CODE);
        expect(loggerWarn).toHaveBeenCalled();
    });

    it('분류되지 않는 실패는 generic으로 떨어뜨리되 원인을 남긴다', async () => {
        // "no relay slot bound" 류: status를 못 뽑으므로 generic이다. 로그가 없으면 진단이 불가능하다.
        getInvite.mockRejectedValue(new Error('[SocketManager] no relay slot bound for request(invite.get)'));
        const { result } = mount();

        await waitFor(() => expect(result.current.notice).toBe('generic'));
        expect(loggerError).toHaveBeenCalled();
    });
});

// ADR-0039가 ADR-0033 D10을 개정해 프로필 스텝을 없앴다: 인증만 남는다.
// Opening a deeplink does NOT imply a device session: a social-linked main user who simply has no
// phone yet also gets `needVerify`, and `login` from that session is a 400 ("@mode[login] is for
// device session"). ADR-0042 §3.
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
});

describe('useRelayInviteFlow — 스텝 순서', () => {
    it('needVerify면 인증 → 수락 순으로 진행한다', async () => {
        getInvite.mockResolvedValue(view({ needVerify: true }));
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());
        await waitFor(() => expect(result.current.phase).toBe('verifying'));
        expect(acceptInvite).not.toHaveBeenCalled();

        // Verified: the session is now the main user, so the server stops asking.
        getInvite.mockResolvedValue(view({ needVerify: false }));
        act(() => result.current.onVerified());
        await waitFor(() => expect(acceptInvite).toHaveBeenCalledWith(CODE));
    });

    // The server derives `needVerify` from whether this account owns the INVITED number, so proving
    // some other number leaves it true. Without a one-shot guard the flow bounces straight back to
    // `verifying`, remounting the screen as a blank form with no error, forever. And a linked number
    // cannot be swapped (no unlink endpoint; the server answers `type-linked`), so re-verifying could
    // never clear it — the terminal notice is the only honest answer.
    it('인증을 마쳤는데도 needVerify가 남아 있으면 무한 반복 대신 번호 불일치로 끝낸다', async () => {
        getInvite.mockResolvedValue(view({ needVerify: true }));
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.accept());
        await waitFor(() => expect(result.current.phase).toBe('verifying'));

        // Proved a number, but not the invited one — the server still wants a proof.
        act(() => result.current.onVerified());

        await waitFor(() => expect(result.current.notice).toBe('wrongNumber'));
        expect(result.current.phase).toBe('notice');
        expect(acceptInvite).not.toHaveBeenCalled();
    });

    // A `link` confirm commits the number irreversibly (no unlink endpoint), and the server only
    // cross-checks the invite on a `login` send — so `last4` is the whole of the check on this path.
    // Without it there is nothing to check against, and proceeding could permanently attach a number
    // that is not the invited one.
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
        // Re-validated on the way back in: entry read + accept attempt + post-save attempt.
        expect(getInvite).toHaveBeenCalledTimes(3);
    });

    it('저장 뒤에는 판정을 다시 묻지 않는다 — profile.set이 곧바로 읽히지 않을 수 있다', async () => {
        isPlaceProfileAbsent.mockResolvedValue(true);
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));
        act(() => result.current.accept());
        await waitFor(() => expect(result.current.phase).toBe('profiling'));

        act(() => result.current.onProfileSaved());

        // Still "absent" as far as the judgement knows, yet the accept goes through.
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

    // setMyProfile은 sid를 요구하는데 이 라우트에는 sid를 세우는 코드가 없다(브라우저에서는
    // sessionStorage라 새 탭이면 기존 사용자도 비어 있다). 게이트를 세우면 다이얼로그 안에서 저장이
    // 던지고 초대를 영구히 수락할 수 없게 되므로, sid가 없으면 스텝을 건너뛴다.
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

        // 저장한 적이 없으므로 profileSavedRef가 서지 않는다 — 두 번째 시도도 프로필을 요구한다.
        await waitFor(() => expect(result.current.phase).toBe('profiling'));
        expect(isPlaceProfileAbsent).toHaveBeenCalledTimes(2);
        expect(acceptInvite).not.toHaveBeenCalled();
    });

    // 승격은 신원을 바꾼다: 디바이스 유저로 저장한 프로필은 메인유저 사이트에 대해 아무것도 말해주지
    // 않으므로, 인증을 지나면 판정이 다시 서야 한다. 안 그러면 이름 없는 채로 수락된다.
    it('인증을 지나면 저장 기록을 버리고 프로필을 다시 판정한다', async () => {
        isPlaceProfileAbsent.mockResolvedValue(true);
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        // needVerify=false로 들어와 프로필을 먼저 저장한다.
        act(() => result.current.accept());
        await waitFor(() => expect(result.current.phase).toBe('profiling'));
        act(() => result.current.onProfileSaved());

        // 수락이 403 — 아직 디바이스 유저였다 → 인증으로 보낸다.
        acceptInvite.mockRejectedValueOnce(socketError(403));
        await waitFor(() => expect(result.current.phase).toBe('verifying'));

        act(() => result.current.onVerified());

        // 승격된 신원에는 프로필이 없으므로 수락 전에 다시 프로필을 요구해야 한다.
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

    // The server just said it does not see a main user; that beats the role cache, which falls back
    // to "main user" whenever the role is unknown and reads the CLOUD token while a cloud is active.
    // Re-deriving `link` from a stale `isGuest: false` here would 403 the send with no way out.
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
        getInvite.mockRejectedValueOnce(new Error('503 SOCKET NOT CONNECTED'));
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

        // 재개가 아니라 재검증: generic은 무엇이 틀어졌는지 모른다는 뜻이라 상태부터 다시 읽는다.
        await waitFor(() => expect(result.current.phase).toBe('review'));
        expect(acceptInvite).toHaveBeenCalledTimes(1);
    });

    it('다시 시도 직후의 닫기 신호는 홈으로 보내지 않는다', async () => {
        // AlertDialog는 confirm 콜백 바로 뒤에 onOpenChange(false)를 쏜다. 그게 dismiss로 읽히면
        // 재조회 중에 홈으로 튕긴다.
        getInvite.mockRejectedValueOnce(new Error('503 SOCKET NOT CONNECTED'));
        const { result } = mount();
        await waitFor(() => expect(result.current.notice).toBe('generic'));

        act(() => {
            result.current.retry();
            result.current.dismissNotice();
        });

        await waitFor(() => expect(result.current.phase).toBe('review'));
        expect(navigate).not.toHaveBeenCalled();
    });

    it('안내를 그대로 닫으면 홈으로 간다', async () => {
        getInvite.mockRejectedValue(new Error('503 SOCKET NOT CONNECTED'));
        const { result } = mount();
        await waitFor(() => expect(result.current.notice).toBe('generic'));

        act(() => result.current.dismissNotice());

        expect(result.current.phase).toBe('closed');
        expect(navigate).toHaveBeenCalledWith('/', { replace: true });
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
        expect(navigate).not.toHaveBeenCalled();
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
        expect(navigate).toHaveBeenCalledWith('/', { replace: true });
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

    // `taken`("다른 사용자가 먼저 초대를 수락했습니다")이 아니라 `alreadyJoined`("이미 참여한
    // 초대입니다")다. reject의 409는 `reject-invite.ts`가 이미 수락된 초대에만 던지고, 1:1 초대는
    // 번호 해시에 묶여 있어 수락할 수 있었던 사람은 이 사용자 자신(다른 기기)뿐이다 — 남이
    // 가로챘다는 안내는 사실이 아니고, 정작 필요한 안내("채팅방에서 이어가세요")를 가린다.
    it('409(이미 수락)는 alreadyJoined 안내다 — 가로챈 남이 아니라 본인이 수락한 것이다', async () => {
        rejectInvite.mockRejectedValue(socketError(409));
        const { result } = mount();
        await waitFor(() => expect(result.current.phase).toBe('review'));

        act(() => result.current.decline());
        await act(async () => result.current.confirmDecline());

        await waitFor(() => expect(result.current.notice).toBe('alreadyJoined'));
        expect(navigate).not.toHaveBeenCalled();
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
        expect(navigate).not.toHaveBeenCalled();

        await act(async () => {
            release(view({ state: 'accepted' }));
        });
    });
});
