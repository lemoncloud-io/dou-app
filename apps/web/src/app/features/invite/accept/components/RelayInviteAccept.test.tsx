import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { RelayInviteAccept } from './RelayInviteAccept';
import type { RelayInviteFlow } from '../hooks';

// Mutable per-test flow state (must be `mock`-prefixed to be usable inside jest.mock factories).
let mockFlow: RelayInviteFlow;

jest.mock('../hooks', () => ({ useRelayInviteFlow: () => mockFlow }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
// The phone-verification step reaches for the runtime; stub it out so this suite stays about the
// phase switch. Mocked at the concrete module the component lazy-imports (it is code-split to keep
// number metadata off the invitee's cold path — see the component).
jest.mock('../../../auth/components/PhoneVerifyScreen', () => ({
    PhoneVerifyScreen: ({ inviteCode, onVerified }: { inviteCode?: string; onVerified: () => void }) => (
        <button onClick={onVerified}>verify:{inviteCode}</button>
    ),
}));
// Same reason as PhoneVerifyScreen: the real dialog imports @chatic/app-runtime, whose config barrel
// jest cannot parse. The stub also exposes whether `exit` was passed — omitting it is what makes X
// leave without a confirmation modal (ADR-0041 decision 2).
jest.mock('../../../home/components/PlaceProfileCreateDialog', () => ({
    PlaceProfileCreateDialog: ({
        placeName,
        onDone,
        onExit,
        exit,
    }: {
        placeName: string;
        onDone: () => void;
        onExit: () => void;
        exit?: unknown;
    }) => (
        <div>
            <span>profile:{placeName}</span>
            <span>guard:{exit ? 'on' : 'off'}</span>
            <button onClick={onDone}>save-profile</button>
            <button onClick={onExit}>exit-profile</button>
        </div>
    ),
}));
jest.mock('../../../../hooks', () => ({ useActivePlaceName: () => '두유 홈' }));

const CODE = 'invt:1:secret';

const flow = (over: Partial<RelayInviteFlow> = {}): RelayInviteFlow => ({
    phase: 'review',
    invite: { id: 'inv-1', state: 'pending', inviter$: { name: 'Sunny' } },
    notice: null,
    countdown: null,
    accept: jest.fn(),
    decline: jest.fn(),
    confirmDecline: jest.fn(),
    isRejecting: false,
    close: jest.fn(),
    onVerified: jest.fn(),
    onProfileSaved: jest.fn(),
    cancelStep: jest.fn(),
    dismissNotice: jest.fn(),
    retry: jest.fn(),
    ...over,
});

beforeEach(() => {
    jest.clearAllMocks();
    mockFlow = flow();
});

describe('RelayInviteAccept', () => {
    it('수락 화면에 초대자와 1:1 대화 라벨을 렌더한다', () => {
        render(<RelayInviteAccept code={CODE} />);

        expect(screen.getByText('Sunny')).toBeInTheDocument();
        expect(screen.getByText('inviteAccept.target.oneToOne')).toBeInTheDocument();
        expect(screen.queryByText('inviteAccept.target.group')).not.toBeInTheDocument();
    });

    it('수락 버튼이 플로우의 accept를 호출한다', () => {
        render(<RelayInviteAccept code={CODE} />);

        fireEvent.click(screen.getByRole('button', { name: 'inviteAccept.accept' }));

        expect(mockFlow.accept).toHaveBeenCalledTimes(1);
    });

    it('거절 버튼은 닫기가 아니라 decline으로 간다 — 확인 다이얼로그를 여는 전이일 뿐이다', () => {
        render(<RelayInviteAccept code={CODE} />);

        fireEvent.click(screen.getByRole('button', { name: 'inviteAccept.decline' }));

        expect(mockFlow.decline).toHaveBeenCalledTimes(1);
        expect(mockFlow.close).not.toHaveBeenCalled();
        expect(mockFlow.confirmDecline).not.toHaveBeenCalled();
    });

    it('진행 중에는 수락 CTA가 스피너 상태다', () => {
        mockFlow = flow({ phase: 'submitting' });
        render(<RelayInviteAccept code={CODE} />);

        expect(screen.getByRole('button', { name: 'inviteAccept.decline' })).toBeDisabled();
    });

    it('채널 대기 중에는 안내 오버레이를 띄운다', () => {
        mockFlow = flow({ phase: 'awaitingChannel' });
        render(<RelayInviteAccept code={CODE} />);

        expect(screen.getByText('relayInviteAccept.preparingRoom')).toBeInTheDocument();
    });

    it('인증 스텝은 초대 코드를 동봉해 PhoneVerifyScreen을 띄운다', async () => {
        mockFlow = flow({ phase: 'verifying' });
        render(<RelayInviteAccept code={CODE} />);

        // `await`, not `get`: the verify step is lazy-imported so its chunk (and the phone-number
        // metadata in it) stays off the invitee's first paint.
        fireEvent.click(await screen.findByRole('button', { name: `verify:${CODE}` }));

        expect(mockFlow.onVerified).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['expired', 'inviteAccept.dialog.expired.title'],
        ['alreadyJoined', 'inviteAccept.dialog.alreadyJoined.title'],
        ['inviteCanceled', 'inviteAccept.dialog.inviteCanceled.title'],
        ['rejected', 'inviteAccept.dialog.rejected.title'],
        ['notFound', 'inviteAccept.dialog.notFound.title'],
        ['wrongNumber', 'inviteAccept.dialog.wrongNumber.title'],
        ['taken', 'inviteAccept.dialog.taken.title'],
    ] as const)('%s 안내 다이얼로그를 띄우고 확인 시 닫는다', (notice, title) => {
        mockFlow = flow({ phase: 'notice', notice });
        render(<RelayInviteAccept code={CODE} />);

        expect(screen.getByText(title)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'inviteAccept.confirm' }));
        // Confirm and the primitive's own close both route here; dismissNotice is idempotent.
        expect(mockFlow.dismissNotice).toHaveBeenCalled();
        // Terminal verdicts get one action: retrying would only replay the same answer.
        expect(screen.queryByRole('button', { name: 'inviteAccept.retry' })).not.toBeInTheDocument();
        expect(mockFlow.retry).not.toHaveBeenCalled();
    });

    it('generic 안내만 다시 시도를 제공한다', () => {
        mockFlow = flow({ phase: 'notice', notice: 'generic' });
        render(<RelayInviteAccept code={CODE} />);

        expect(screen.getByText('inviteAccept.dialog.generic.title')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'inviteAccept.retry' }));

        // The primitive closes itself after the confirm callback, so `dismissNotice` fires here too —
        // ordered AFTER `retry`, which is what lets the flow's ref guard swallow it (see its suite).
        expect(mockFlow.retry).toHaveBeenCalledTimes(1);
        const retryOrder = (mockFlow.retry as jest.Mock).mock.invocationCallOrder[0];
        const dismissOrder = (mockFlow.dismissNotice as jest.Mock).mock.invocationCallOrder[0];
        expect(retryOrder).toBeLessThan(dismissOrder);
    });

    it('generic 안내의 닫기는 홈으로 보낸다', () => {
        mockFlow = flow({ phase: 'notice', notice: 'generic' });
        render(<RelayInviteAccept code={CODE} />);

        fireEvent.click(screen.getByRole('button', { name: 'inviteAccept.close' }));

        expect(mockFlow.dismissNotice).toHaveBeenCalled();
        expect(mockFlow.retry).not.toHaveBeenCalled();
    });

    it('닫힌 뒤에는 아무것도 렌더하지 않는다', () => {
        mockFlow = flow({ phase: 'closed' });
        const { container } = render(<RelayInviteAccept code={CODE} />);

        expect(container).toBeEmptyDOMElement();
    });

    // A relay 1:1 invite is not into a place. Two things guarantee the card stays away: this dialog
    // never forwards `site$` to the screen, and the screen gates the card on `targetKind` regardless
    // (ADR-0037). The mock carries a site precisely so neither guard can be dropped unnoticed.
    it('초대가 실어온 플레이스 이름을 그린다', () => {
        mockFlow = flow({
            invite: { id: 'inv-1', state: 'pending', inviter$: { name: 'Sunny' }, site$: { name: '북클럽' } },
        });
        render(<RelayInviteAccept code={CODE} />);

        expect(screen.getByText('Sunny')).toBeInTheDocument();
        expect(screen.getByText('북클럽')).toBeInTheDocument();
    });

    // relay invite.get이 site$를 채워주지 않는 현재 상태 — 카드가 조용히 접힌다(ADR-0033 D1 선반영).
    it('플레이스 메타가 없으면 카드가 접힌다', () => {
        mockFlow = flow({ invite: { id: 'inv-1', state: 'pending', inviter$: { name: 'Sunny' } } });
        render(<RelayInviteAccept code={CODE} />);

        expect(screen.getByText('Sunny')).toBeInTheDocument();
        expect(screen.queryByTestId('invite-place-card')).not.toBeInTheDocument();
    });
});

describe('RelayInviteAccept — 거절 확인 다이얼로그 (ADR-0043, Figma 3446-17487)', () => {
    it('declining이면 확인 다이얼로그를 띄운다 — 종국 액션이라 확인이 먼저다', () => {
        mockFlow = flow({ phase: 'declining' });
        render(<RelayInviteAccept code={CODE} />);

        expect(screen.getByText('relayInviteAccept.declineDialog.title')).toBeInTheDocument();
        expect(screen.getByText('relayInviteAccept.declineDialog.description')).toBeInTheDocument();
    });

    it('확인을 누르면 confirmDecline을 부른다', () => {
        mockFlow = flow({ phase: 'declining' });
        render(<RelayInviteAccept code={CODE} />);

        fireEvent.click(screen.getByText('relayInviteAccept.declineDialog.confirm'));

        expect(mockFlow.confirmDecline).toHaveBeenCalledTimes(1);
    });

    it('취소(닫기)를 누르면 cancelStep으로 review 복귀만 하고 아무것도 보내지 않는다', () => {
        mockFlow = flow({ phase: 'declining' });
        render(<RelayInviteAccept code={CODE} />);

        fireEvent.click(screen.getByText('common.cancel'));

        expect(mockFlow.cancelStep).toHaveBeenCalledTimes(1);
        expect(mockFlow.confirmDecline).not.toHaveBeenCalled();
    });

    // Regression: confirmDecline used to flip the flow's phase to 'submitting', which has no
    // branch of its own here and fell through to the accept screen with its "수락" spinner — the
    // confirm dialog disappeared right when the user had just clicked "거절하기". Staying in
    // `declining` and driving the dialog's own `isPending` (checked via the disabled confirm
    // button, same as InviteWaitingPage's cancel dialog) is what fixes that.
    it('isRejecting이 켜지면 다이얼로그에 남아 양쪽 버튼이 비활성화된다 — 수락 화면으로 떨어지지 않는다', () => {
        mockFlow = flow({ phase: 'declining', isRejecting: true });
        render(<RelayInviteAccept code={CODE} />);

        expect(screen.getByText('relayInviteAccept.declineDialog.title')).toBeInTheDocument();
        // Pending swaps the confirm button's label for a spinner (ConfirmDialog's own contract), so
        // it is found by position rather than name — every button in the dialog is disabled.
        const buttons = screen.getAllByRole('button');
        expect(buttons.length).toBeGreaterThan(0);
        buttons.forEach(button => expect(button).toBeDisabled());
        expect(screen.queryByRole('button', { name: 'inviteAccept.accept' })).not.toBeInTheDocument();
    });
});

describe('RelayInviteAccept — 프로필 스텝 (ADR-0041)', () => {
    it('profiling이면 생성 다이얼로그를 브랜딩된 플레이스 이름으로 띄운다', () => {
        mockFlow = flow({ phase: 'profiling' });
        render(<RelayInviteAccept code={CODE} />);

        expect(screen.getByText('profile:두유 홈')).toBeInTheDocument();
    });

    it('이탈 가드를 넘기지 않는다 — X는 곧바로 나간다', () => {
        mockFlow = flow({ phase: 'profiling' });
        render(<RelayInviteAccept code={CODE} />);

        expect(screen.getByText('guard:off')).toBeInTheDocument();
    });

    it('저장은 onProfileSaved로, 이탈은 인증과 같은 cancelStep으로 간다', () => {
        mockFlow = flow({ phase: 'profiling' });
        render(<RelayInviteAccept code={CODE} />);

        fireEvent.click(screen.getByText('save-profile'));
        expect(mockFlow.onProfileSaved).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByText('exit-profile'));
        expect(mockFlow.cancelStep).toHaveBeenCalledTimes(1);
    });

    it('다른 페이즈에서는 뜨지 않는다', () => {
        mockFlow = flow({ phase: 'review' });
        render(<RelayInviteAccept code={CODE} />);

        expect(screen.queryByText(/^profile:/)).not.toBeInTheDocument();
    });
});
