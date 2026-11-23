import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { RelayInviteAccept } from './RelayInviteAccept';
import type { RelayInviteFlow } from '../hooks';

let mockFlow: RelayInviteFlow;

jest.mock('../hooks', () => ({ useRelayInviteFlow: () => mockFlow }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('../../../auth/components/PhoneVerifyScreen', () => ({
    PhoneVerifyScreen: ({
        inviteCode,
        mode,
        onVerified,
    }: {
        inviteCode?: string;
        mode: string;
        onVerified: () => void;
    }) => (
        <button onClick={onVerified}>
            verify:{inviteCode}:{mode}
        </button>
    ),
}));
jest.mock('../../../../ui/components/PlaceProfileCreateDialog', () => ({
    PlaceProfileCreateDialog: ({
        placeName,
        onDone,
        onExit,
        onSubmit,
        dismissible,
        exit,
    }: {
        placeName: string;
        onDone: () => void;
        onExit: () => void;
        onSubmit: (value: { nick: string }) => Promise<void>;
        dismissible?: boolean;
        exit?: unknown;
    }) => (
        <div>
            <span>profile:{placeName}</span>
            <span>guard:{exit ? 'on' : 'off'}</span>
            <span>dismissible:{String(dismissible)}</span>
            <button onClick={() => onSubmit({ nick: 'n' }).catch(() => undefined)}>submit-profile</button>
            <button onClick={onDone}>save-profile</button>
            <button onClick={onExit}>exit-profile</button>
        </div>
    ),
}));
const mockSetMyPlaceProfile = jest.fn();
jest.mock('../../../../hooks', () => ({
    useActivePlaceName: () => '두유 홈',
    useSetMyPlaceProfile: () => mockSetMyPlaceProfile,
}));

const CODE = 'invt:1:secret';

const flow = (over: Partial<RelayInviteFlow> = {}): RelayInviteFlow => ({
    phase: 'review',
    invite: { id: 'inv-1', state: 'pending', inviter$: { name: 'Account Name', nick: 'Sunny' } },
    notice: null,
    countdown: null,
    verifyMode: 'login',
    accept: jest.fn(),
    decline: jest.fn(),
    confirmDecline: jest.fn(),
    isRejecting: false,
    close: jest.fn(),
    onVerified: jest.fn(),
    onProfileSaved: jest.fn(),
    skipProfile: jest.fn(),
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

        expect(screen.getAllByText('Sunny')).toHaveLength(2);
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

        fireEvent.click(await screen.findByRole('button', { name: `verify:${CODE}:login` }));

        expect(mockFlow.onVerified).toHaveBeenCalledTimes(1);
    });

    it('플로우가 link를 고르면 그대로 link 모드로 PhoneVerifyScreen을 띄운다', async () => {
        mockFlow = flow({ phase: 'verifying', verifyMode: 'link' });
        render(<RelayInviteAccept code={CODE} />);

        fireEvent.click(await screen.findByRole('button', { name: `verify:${CODE}:link` }));

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
        expect(mockFlow.dismissNotice).toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: 'inviteAccept.retry' })).not.toBeInTheDocument();
        expect(mockFlow.retry).not.toHaveBeenCalled();
    });

    it('generic 안내만 다시 시도를 제공한다', () => {
        mockFlow = flow({ phase: 'notice', notice: 'generic' });
        render(<RelayInviteAccept code={CODE} />);

        expect(screen.getByText('inviteAccept.dialog.generic.title')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'inviteAccept.retry' }));

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

    it('draws the invited place under the home-place branding', () => {
        mockFlow = flow({
            invite: {
                id: 'inv-1',
                state: 'pending',
                inviter$: { nick: 'Sunny' },
                site$: { id: '0000', name: 'default' },
            },
        });
        render(<RelayInviteAccept code={CODE} />);

        expect(screen.getByTestId('invite-place-card')).toBeInTheDocument();
        expect(screen.getByText('placeList.defaultPlace')).toBeInTheDocument();
        expect(screen.queryByText('default')).not.toBeInTheDocument();
    });

    it('플레이스 메타가 없으면 카드가 접힌다', () => {
        mockFlow = flow({ invite: { id: 'inv-1', state: 'pending', inviter$: { nick: 'Sunny' } } });
        render(<RelayInviteAccept code={CODE} />);

        expect(screen.getAllByText('Sunny').length).toBeGreaterThan(0);
        expect(screen.queryByTestId('invite-place-card')).not.toBeInTheDocument();
    });
});

describe('RelayInviteAccept — naming the inviter', () => {
    const open = (inviter: Record<string, unknown> | undefined) => {
        mockFlow = flow({ invite: { id: 'inv-1', state: 'pending', inviter$: inviter } as never });
        return render(<RelayInviteAccept code={CODE} />);
    };

    it('reads the heading and the card from the place nickname', () => {
        open({ name: 'Account Name', nick: 'Sunny' });

        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sunny');
        expect(screen.getByTestId('invite-target-card')).toHaveTextContent('Sunny');
        expect(screen.queryByText('Account Name')).not.toBeInTheDocument();
    });

    it.each([
        ['no nickname, only an account name', { name: 'Account Name' }],
        ['a blank nickname', { name: 'Account Name', nick: '   ' }],
        ['an empty nickname', { name: 'Account Name', nick: '' }],
        ['no inviter at all', undefined],
    ])('shows the nameless heading and a caption-only card for %s', (_label, inviter) => {
        open(inviter);

        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('inviteAccept.title');
        expect(screen.queryByText('Account Name')).not.toBeInTheDocument();
        expect(screen.getByTestId('invite-target-card')).toHaveTextContent('inviteAccept.target.oneToOne');
        expect(screen.getByTestId('invite-target-card').querySelectorAll('p')).toHaveLength(1);
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

    it('isRejecting이 켜지면 다이얼로그에 남아 양쪽 버튼이 비활성화된다 — 수락 화면으로 떨어지지 않는다', () => {
        mockFlow = flow({ phase: 'declining', isRejecting: true });
        render(<RelayInviteAccept code={CODE} />);

        expect(screen.getByText('relayInviteAccept.declineDialog.title')).toBeInTheDocument();
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

    it('sends a save to onProfileSaved', () => {
        mockFlow = flow({ phase: 'profiling' });
        render(<RelayInviteAccept code={CODE} />);

        fireEvent.click(screen.getByText('save-profile'));
        expect(mockFlow.onProfileSaved).toHaveBeenCalledTimes(1);
    });

    it('offers no X until a save has failed, then X skips into the accept', async () => {
        mockSetMyPlaceProfile.mockRejectedValueOnce(new Error('500'));
        mockFlow = flow({ phase: 'profiling' });
        render(<RelayInviteAccept code={CODE} />);

        expect(screen.getByText('dismissible:false')).toBeInTheDocument();

        fireEvent.click(screen.getByText('submit-profile'));
        expect(await screen.findByText('dismissible:true')).toBeInTheDocument();

        fireEvent.click(screen.getByText('exit-profile'));
        expect(mockFlow.skipProfile).toHaveBeenCalledTimes(1);
        expect(mockFlow.cancelStep).not.toHaveBeenCalled();
    });

    it('keeps the X away after a save that succeeds', async () => {
        mockSetMyPlaceProfile.mockResolvedValueOnce(undefined);
        mockFlow = flow({ phase: 'profiling' });
        render(<RelayInviteAccept code={CODE} />);

        fireEvent.click(screen.getByText('submit-profile'));
        await waitFor(() => expect(mockSetMyPlaceProfile).toHaveBeenCalledTimes(1));
        expect(screen.getByText('dismissible:false')).toBeInTheDocument();
    });

    it('다른 페이즈에서는 뜨지 않는다', () => {
        mockFlow = flow({ phase: 'review' });
        render(<RelayInviteAccept code={CODE} />);

        expect(screen.queryByText(/^profile:/)).not.toBeInTheDocument();
    });
});
