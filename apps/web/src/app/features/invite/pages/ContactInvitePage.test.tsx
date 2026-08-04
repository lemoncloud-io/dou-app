import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const navigate = jest.fn();
const toast = jest.fn();
const createInvite = jest.fn();
const record = jest.fn();
const findByPhone = jest.fn();
const sendInviteMessage = jest.fn();
let mockInvites: Array<{ id: string; state?: string }> = [];
let mockIsGuest = false;
/**
 * What the server says about this user's own number. `'unknown'` (no profile yet / no `link$` slot)
 * must NOT gate — see ADR-0042 §5.
 */
let mockLinkedPhone: 'linked' | 'absent' | 'unknown' = 'linked';
/** The profile gate's verdict: undefined = read in flight, true = must create one first. */
let mockProfileAbsent: boolean | undefined = false;
/** Stateful, like the real hook: marking present must actually flip the verdict. */
const markPresent = jest.fn(() => {
    mockProfileAbsent = false;
});

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
// Only the role gate is read here; the sheet itself is stubbed below.
jest.mock('@chatic/app-runtime', () => ({ useRuntimeProfile: () => ({ isGuest: mockIsGuest }) }));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
// The real barrel also exports CloudLogo, which needs `@chatic/assets` (not resolvable under
// jest) — mocked the same way InvitePage.test.tsx does, since only PageHeader is used here.
jest.mock('../../../ui/components', () => ({ PageHeader: (p: any) => <div>{p.title}</div> }));
jest.mock('@chatic/web-core', () => ({ reportError: jest.fn() }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('../../../hooks', () => ({
    useMyProfile: () => ({ profile: { nick: '보낸이' } }),
    useRelayInviteMutations: () => ({ createInvite }),
    useRelayInvites: () => ({ invites: mockInvites, isLoading: false, refetch: jest.fn() }),
    useSentInviteLog: () => ({ record, findByPhone }),
    useActivePlaceName: () => '두유 홈',
    useLinkedAccounts: () => ({ phone: mockLinkedPhone, social: 'unknown' }),
    usePlaceProfileAbsent: () => ({ absent: mockProfileAbsent, markPresent }),
}));
// Stubbed like PhoneVerifySheet — the real dialog imports @chatic/app-runtime. `exit` is surfaced
// because omitting it is what makes X leave at once (ADR-0041 decision 2).
jest.mock('../../home/components/PlaceProfileCreateDialog', () => ({
    PlaceProfileCreateDialog: ({ placeName, onDone, onExit, exit }: any) => (
        <div>
            <span>profile-dialog:{placeName}</span>
            <span>guard:{exit ? 'on' : 'off'}</span>
            <button onClick={onDone}>save-profile</button>
            <button onClick={onExit}>exit-profile</button>
        </div>
    ),
}));
jest.mock('../utils/sendInviteMessage', () => ({
    sendInviteMessage: (...args: unknown[]) => sendInviteMessage(...args),
}));
// Stubbed like ReinviteDialog: the sheet's own rendering is covered by PhoneVerifySheet.test.tsx and
// its behaviour by PhoneVerifyScreen.test.tsx (same hook), and the real one pulls
// @chatic/app-runtime's applySessionToken plus the Radix Sheet primitives.
jest.mock('../../auth/components/PhoneVerifySheet', () => ({
    // `mode` is surfaced because it is this page's decision: a guest opens a session (`login`), a main
    // user without a number hangs one on the session they already have (`link`) — ADR-0042 §3.
    PhoneVerifySheet: ({ mode, onVerified, onClose }: any) => (
        <div>
            <span>verify-sheet:{mode}</span>
            <button onClick={onVerified}>sheet-verified</button>
            <button onClick={onClose}>sheet-close</button>
        </div>
    ),
}));
jest.mock('../components/ReinviteDialog', () => ({
    ReinviteDialog: ({ variant, onViewWaiting, onReissue }: any) => (
        <div>
            <span>reinvite-dialog:{variant}</span>
            <button onClick={onViewWaiting}>go-to-waiting</button>
            <button onClick={onReissue}>reissue</button>
        </div>
    ),
}));

import { ContactInvitePage } from './ContactInvitePage';

const fillForm = (name: string, phone: string) => {
    fireEvent.change(screen.getByPlaceholderText('contactInvite.namePlaceholder'), { target: { value: name } });
    fireEvent.change(screen.getByPlaceholderText('contactInvite.phonePlaceholder'), { target: { value: phone } });
};

describe('ContactInvitePage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockInvites = [];
        mockIsGuest = false;
        mockLinkedPhone = 'linked';
        mockProfileAbsent = false;
        findByPhone.mockReturnValue(undefined);
        sendInviteMessage.mockResolvedValue('sms');
    });

    it('게스트는 폼 대신 인증 유도 화면을 본다 — 채우고 나서 403으로 막히지 않는다', () => {
        mockIsGuest = true;
        render(<ContactInvitePage />);

        expect(screen.getByText('contactInvite.verifyPrompt.cta')).toBeInTheDocument();
        expect(screen.queryByPlaceholderText('contactInvite.namePlaceholder')).not.toBeInTheDocument();
        expect(screen.queryByText(/^verify-sheet:/)).not.toBeInTheDocument();
    });

    it('유도 화면의 CTA가 인증 시트를 login 모드로 연다 (게스트는 세션을 새로 연다)', () => {
        mockIsGuest = true;
        render(<ContactInvitePage />);

        fireEvent.click(screen.getByText('contactInvite.verifyPrompt.cta'));

        expect(screen.getByText('verify-sheet:login')).toBeInTheDocument();
    });

    it('인증을 마치면 유도 화면이 폼으로 바뀐다 (isGuest가 풀리는 경로)', () => {
        mockIsGuest = true;
        const { rerender } = render(<ContactInvitePage />);
        fireEvent.click(screen.getByText('contactInvite.verifyPrompt.cta'));

        // applySessionToken이 세션을 승격시키면 useRuntimeProfile이 반응형으로 isGuest를 내린다.
        mockIsGuest = false;
        fireEvent.click(screen.getByText('sheet-verified'));
        rerender(<ContactInvitePage />);

        expect(screen.getByPlaceholderText('contactInvite.namePlaceholder')).toBeInTheDocument();
        expect(screen.queryByText('contactInvite.verifyPrompt.cta')).not.toBeInTheDocument();
        expect(screen.queryByText(/^verify-sheet:/)).not.toBeInTheDocument();
    });

    it('게스트가 아니면 유도 화면 없이 곧장 폼이다', () => {
        render(<ContactInvitePage />);

        expect(screen.getByPlaceholderText('contactInvite.namePlaceholder')).toBeInTheDocument();
        expect(screen.queryByText('contactInvite.verifyPrompt.cta')).not.toBeInTheDocument();
    });

    it('유효하지 않은 전화번호면 인라인 에러를 보여주고 발급하지 않는다', () => {
        render(<ContactInvitePage />);
        fillForm('홍길동', '02012345678');

        fireEvent.click(screen.getByText('contactInvite.submit'));

        expect(screen.getByText('contactInvite.phoneInvalidFormat')).toBeInTheDocument();
        expect(createInvite).not.toHaveBeenCalled();
    });

    it('처음 초대하는 번호는 바로 발급하고 record 후 대기 화면으로 이동한다', async () => {
        createInvite.mockResolvedValue({ id: 'invite-1', deeplink: 'https://dou.chatic.io/s?code=abc' });

        render(<ContactInvitePage />);
        fillForm('홍길동', '01012345678');
        fireEvent.click(screen.getByText('contactInvite.submit'));

        await waitFor(() => expect(createInvite).toHaveBeenCalledWith({ phone: '01012345678', name: '홍길동' }));
        expect(record).toHaveBeenCalledWith(
            { id: 'invite-1', deeplink: 'https://dou.chatic.io/s?code=abc' },
            { phone: '01012345678', name: '홍길동' }
        );
        await waitFor(() => expect(sendInviteMessage).toHaveBeenCalledWith('01012345678', expect.any(String)));
        await waitFor(() => expect(navigate).toHaveBeenCalledWith('/invite/invite-1/waiting', { replace: true }));
        expect(toast).toHaveBeenCalledWith({ title: 'contactInvite.sentToast.sms' });
    });

    it('이미 보낸 번호이고 아직 pending이면 재초대 다이얼로그(pending)를 띄우고 바로 발급하지 않는다', () => {
        findByPhone.mockReturnValue({ inviteId: 'invite-old', name: '홍길동' });
        mockInvites = [{ id: 'invite-old', state: 'pending' }];

        render(<ContactInvitePage />);
        fillForm('홍길동', '01012345678');
        fireEvent.click(screen.getByText('contactInvite.submit'));

        expect(screen.getByText('reinvite-dialog:pending')).toBeInTheDocument();
        expect(createInvite).not.toHaveBeenCalled();

        fireEvent.click(screen.getByText('go-to-waiting'));
        expect(navigate).toHaveBeenCalledWith('/invite/invite-old/waiting');
        expect(createInvite).not.toHaveBeenCalled();
    });

    it('이미 보낸 번호가 만료됐으면 재초대 다이얼로그(expired)에서 재발급을 진행한다', async () => {
        findByPhone.mockReturnValue({ inviteId: 'invite-old', name: '홍길동' });
        mockInvites = [{ id: 'invite-old', state: 'expired' }];
        createInvite.mockResolvedValue({ id: 'invite-new', deeplink: 'https://dou.chatic.io/s?code=def' });

        render(<ContactInvitePage />);
        fillForm('홍길동', '01012345678');
        fireEvent.click(screen.getByText('contactInvite.submit'));

        expect(screen.getByText('reinvite-dialog:expired')).toBeInTheDocument();

        fireEvent.click(screen.getByText('reissue'));

        await waitFor(() => expect(createInvite).toHaveBeenCalledWith({ phone: '01012345678', name: '홍길동' }));
        await waitFor(() => expect(navigate).toHaveBeenCalledWith('/invite/invite-new/waiting', { replace: true }));
    });

    it('클라 게이트를 지나쳐 발급이 403이면 같은 시트를 폴백으로 연다 (역할 판정은 서버가 원본)', async () => {
        createInvite.mockRejectedValue(new Error('403 FORBIDDEN - not a main user'));

        render(<ContactInvitePage />);
        fillForm('홍길동', '01012345678');
        fireEvent.click(screen.getByText('contactInvite.submit'));

        await waitFor(() => expect(screen.getByText(/^verify-sheet:/)).toBeInTheDocument());
        expect(navigate).not.toHaveBeenCalled();

        // 인증 후에는 시트만 닫는다 — 폼 입력이 남아 있어 사용자가 다시 제출한다(자동 재발급 없음).
        fireEvent.click(screen.getByText('sheet-verified'));
        expect(screen.queryByText(/^verify-sheet:/)).not.toBeInTheDocument();
        expect(createInvite).toHaveBeenCalledTimes(1);
        expect(screen.getByPlaceholderText('contactInvite.namePlaceholder')).toHaveValue('홍길동');
    });

    it('인증으로 풀리지 않는 403(탈퇴·정지)은 시트를 다시 열지 않고 안내한다', async () => {
        createInvite.mockRejectedValue(new Error('403 FORBIDDEN - suspended'));

        render(<ContactInvitePage />);
        fillForm('홍길동', '01012345678');
        fireEvent.click(screen.getByText('contactInvite.submit'));
        await waitFor(() => expect(screen.getByText(/^verify-sheet:/)).toBeInTheDocument());
        fireEvent.click(screen.getByText('sheet-verified'));

        // 두 번째 403 — 같은 유저로 되돌아오므로 시트를 다시 여는 건 무한 루프다.
        fireEvent.click(screen.getByText('contactInvite.submit'));
        await waitFor(() =>
            expect(toast).toHaveBeenCalledWith({ title: 'contactInvite.issueForbidden', variant: 'destructive' })
        );
        expect(screen.queryByText(/^verify-sheet:/)).not.toBeInTheDocument();
    });

    it('403 폴백은 게이트 모드와 무관하게 항상 login이다 (ADR-0042 §3)', async () => {
        // 번호까지 연결된 메인 유저 — 게이트가 열었다면 link 모드였을 상황이다.
        mockLinkedPhone = 'linked';
        createInvite.mockRejectedValue(new Error('403 FORBIDDEN - not a main user'));

        render(<ContactInvitePage />);
        fillForm('홍길동', '01012345678');
        fireEvent.click(screen.getByText('contactInvite.submit'));

        // 서버가 메인 유저로 못 본 세션이니 새로 열어야 한다 — link를 보내면 같은 403이 되돌아온다.
        await waitFor(() => expect(screen.getByText('verify-sheet:login')).toBeInTheDocument());
        expect(screen.queryByText('verify-sheet:link')).not.toBeInTheDocument();
    });

    it('403 폴백은 한 번만 제안한다 — 인증하지 않고 닫아도 다시 열지 않는다', async () => {
        createInvite.mockRejectedValue(new Error('403 FORBIDDEN - not a main user'));

        render(<ContactInvitePage />);
        fillForm('홍길동', '01012345678');
        fireEvent.click(screen.getByText('contactInvite.submit'));
        await waitFor(() => expect(screen.getByText('verify-sheet:login')).toBeInTheDocument());

        // X로 닫는다 — 인증은 하지 않았다.
        fireEvent.click(screen.getByText('sheet-close'));
        expect(screen.queryByText(/^verify-sheet:/)).not.toBeInTheDocument();

        fireEvent.click(screen.getByText('contactInvite.submit'));
        await waitFor(() =>
            expect(toast).toHaveBeenCalledWith({ title: 'contactInvite.issueForbidden', variant: 'destructive' })
        );
        expect(screen.queryByText(/^verify-sheet:/)).not.toBeInTheDocument();
    });

    it('발급이 그 외 사유로 실패하면 일반 실패 토스트를 띄운다', async () => {
        createInvite.mockRejectedValue(new Error('500 INTERNAL'));

        render(<ContactInvitePage />);
        fillForm('홍길동', '01012345678');
        fireEvent.click(screen.getByText('contactInvite.submit'));

        await waitFor(() =>
            expect(toast).toHaveBeenCalledWith({ title: 'contactInvite.issueFailed', variant: 'destructive' })
        );
    });
});

describe('ContactInvitePage — 번호 연결 전제조건 게이트 (ADR-0042)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockInvites = [];
        mockIsGuest = false;
        mockLinkedPhone = 'linked';
        mockProfileAbsent = false;
        findByPhone.mockReturnValue(undefined);
        sendInviteMessage.mockResolvedValue('sms');
    });

    it('번호가 없는 메인 유저도 폼 대신 유도 화면을 본다', () => {
        mockLinkedPhone = 'absent';
        render(<ContactInvitePage />);

        expect(screen.getByText('contactInvite.verifyPrompt.cta')).toBeInTheDocument();
        expect(screen.queryByPlaceholderText('contactInvite.namePlaceholder')).not.toBeInTheDocument();
    });

    it('메인 유저의 시트는 link 모드로 연다 — 이미 있는 세션에 번호만 건다', () => {
        mockLinkedPhone = 'absent';
        render(<ContactInvitePage />);

        fireEvent.click(screen.getByText('contactInvite.verifyPrompt.cta'));

        expect(screen.getByText('verify-sheet:link')).toBeInTheDocument();
    });

    it('연결을 마치면 유도 화면이 폼으로 바뀐다 (link$가 갱신되는 경로)', () => {
        mockLinkedPhone = 'absent';
        const { rerender } = render(<ContactInvitePage />);
        fireEvent.click(screen.getByText('contactInvite.verifyPrompt.cta'));

        // 서버가 link$.phone을 채우면 useLinkedAccounts가 반응형으로 게이트를 내린다.
        mockLinkedPhone = 'linked';
        fireEvent.click(screen.getByText('sheet-verified'));
        rerender(<ContactInvitePage />);

        expect(screen.getByPlaceholderText('contactInvite.namePlaceholder')).toBeInTheDocument();
        expect(screen.queryByText('contactInvite.verifyPrompt.cta')).not.toBeInTheDocument();
        expect(screen.queryByText(/^verify-sheet:/)).not.toBeInTheDocument();
    });

    it("'unknown'은 게이트하지 않는다 — 이미 가진 번호를 다시 요구하지 않는다 (ADR-0042 §5)", () => {
        mockLinkedPhone = 'unknown';
        render(<ContactInvitePage />);

        expect(screen.getByPlaceholderText('contactInvite.namePlaceholder')).toBeInTheDocument();
        expect(screen.queryByText('contactInvite.verifyPrompt.cta')).not.toBeInTheDocument();
    });

    it("'linked'는 예전과 같다 — 곧장 폼이다", () => {
        render(<ContactInvitePage />);

        expect(screen.getByPlaceholderText('contactInvite.namePlaceholder')).toBeInTheDocument();
        expect(screen.queryByText('contactInvite.verifyPrompt.cta')).not.toBeInTheDocument();
    });
});

describe('ContactInvitePage — 프로필 전제조건 게이트 (ADR-0041)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockInvites = [];
        mockIsGuest = false;
        mockLinkedPhone = 'linked';
        mockProfileAbsent = false;
        findByPhone.mockReturnValue(undefined);
        sendInviteMessage.mockResolvedValue('sms');
    });

    it('프로필이 없으면 폼도 CTA도 없이 생성 다이얼로그만 띄운다', () => {
        mockProfileAbsent = true;
        render(<ContactInvitePage />);

        expect(screen.getByText('profile-dialog:두유 홈')).toBeInTheDocument();
        expect(screen.queryByPlaceholderText('contactInvite.namePlaceholder')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'contactInvite.submit' })).not.toBeInTheDocument();
    });

    it('판정 전에는 아무것도 렌더하지 않는다 — 폼이 판정을 앞지르지 못한다', () => {
        mockProfileAbsent = undefined;
        render(<ContactInvitePage />);

        expect(screen.queryByText(/^profile-dialog:/)).not.toBeInTheDocument();
        expect(screen.queryByPlaceholderText('contactInvite.namePlaceholder')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'contactInvite.submit' })).not.toBeInTheDocument();
    });

    it('게스트 게이트가 프로필보다 먼저 이긴다', () => {
        mockIsGuest = true;
        mockProfileAbsent = true;
        render(<ContactInvitePage />);

        expect(screen.getByText('contactInvite.verifyPrompt.title')).toBeInTheDocument();
        expect(screen.queryByText(/^profile-dialog:/)).not.toBeInTheDocument();
    });

    it('번호 게이트가 프로필보다 먼저 이긴다 — 다이얼로그를 유도 화면 위에 쌓지 않는다', () => {
        mockLinkedPhone = 'absent';
        mockProfileAbsent = true;
        render(<ContactInvitePage />);

        expect(screen.getByText('contactInvite.verifyPrompt.title')).toBeInTheDocument();
        expect(screen.queryByText(/^profile-dialog:/)).not.toBeInTheDocument();
    });

    it('번호가 연결되면 같은 상황에서 프로필 다이얼로그가 뜬다 — 억제가 아니라 순서다', () => {
        mockLinkedPhone = 'linked';
        mockProfileAbsent = true;
        render(<ContactInvitePage />);

        expect(screen.getByText('profile-dialog:두유 홈')).toBeInTheDocument();
        expect(screen.queryByText('contactInvite.verifyPrompt.title')).not.toBeInTheDocument();
    });

    it('이탈 가드를 넘기지 않는다 — X는 곧바로 홈으로 나간다', () => {
        mockProfileAbsent = true;
        render(<ContactInvitePage />);

        expect(screen.getByText('guard:off')).toBeInTheDocument();

        fireEvent.click(screen.getByText('exit-profile'));

        expect(navigate).toHaveBeenCalledWith('/', { replace: true });
        expect(createInvite).not.toHaveBeenCalled();
    });

    it('저장하면 서버에 다시 묻지 않고 폼으로 넘어간다', () => {
        mockProfileAbsent = true;
        const { rerender } = render(<ContactInvitePage />);

        fireEvent.click(screen.getByText('save-profile'));
        rerender(<ContactInvitePage />);

        expect(markPresent).toHaveBeenCalledTimes(1);
        // 게이트가 실제로 닫혀 폼으로 넘어간다 — 제목의 뒷절반까지 고정한다.
        expect(screen.queryByText(/^profile-dialog:/)).not.toBeInTheDocument();
        expect(screen.getByPlaceholderText('contactInvite.namePlaceholder')).toBeInTheDocument();
    });

    it('프로필이 있으면 게이트 없이 곧장 폼이다', () => {
        render(<ContactInvitePage />);

        expect(screen.queryByText(/^profile-dialog:/)).not.toBeInTheDocument();
        expect(screen.getByPlaceholderText('contactInvite.namePlaceholder')).toBeInTheDocument();
    });
});
