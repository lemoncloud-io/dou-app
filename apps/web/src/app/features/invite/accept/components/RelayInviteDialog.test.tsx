import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { RelayInviteDialog } from './RelayInviteDialog';
import type { RelayInviteFlow } from '../hooks';

// Mutable per-test flow state (must be `mock`-prefixed to be usable inside jest.mock factories).
let mockFlow: RelayInviteFlow;

jest.mock('../hooks', () => ({ useRelayInviteFlow: () => mockFlow }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
// The profile and phone-verification steps both reach for the runtime; stub them out so this suite
// stays about the phase switch.
jest.mock('./RelayInviteProfileDialog', () => ({
    RelayInviteProfileDialog: ({ onDone, onExit }: { onDone: () => void; onExit: () => void }) => (
        <div>
            <button onClick={onDone}>profile-done</button>
            <button onClick={onExit}>profile-exit</button>
        </div>
    ),
}));
jest.mock('../../../auth/components', () => ({
    PhoneVerifyScreen: ({ inviteCode, onVerified }: { inviteCode?: string; onVerified: () => void }) => (
        <button onClick={onVerified}>verify:{inviteCode}</button>
    ),
}));

const CODE = 'invt:1:secret';

const flow = (over: Partial<RelayInviteFlow> = {}): RelayInviteFlow => ({
    phase: 'review',
    invite: { id: 'inv-1', state: 'pending', inviter$: { name: 'Sunny' } },
    notice: null,
    countdown: null,
    accept: jest.fn(),
    decline: jest.fn(),
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

describe('RelayInviteDialog', () => {
    it('수락 화면에 초대자와 1:1 대화 라벨을 렌더한다', () => {
        render(<RelayInviteDialog code={CODE} />);

        expect(screen.getByText('Sunny')).toBeInTheDocument();
        expect(screen.getByText('inviteAccept.target.oneToOne')).toBeInTheDocument();
        expect(screen.queryByText('inviteAccept.target.group')).not.toBeInTheDocument();
    });

    it('수락 버튼이 플로우의 accept를 호출한다', () => {
        render(<RelayInviteDialog code={CODE} />);

        fireEvent.click(screen.getByRole('button', { name: 'inviteAccept.accept' }));

        expect(mockFlow.accept).toHaveBeenCalledTimes(1);
    });

    it('거절 버튼은 닫기가 아니라 decline 스텁으로 간다', () => {
        render(<RelayInviteDialog code={CODE} />);

        fireEvent.click(screen.getByRole('button', { name: 'inviteAccept.decline' }));

        expect(mockFlow.decline).toHaveBeenCalledTimes(1);
        expect(mockFlow.close).not.toHaveBeenCalled();
    });

    it('진행 중에는 수락 CTA가 스피너 상태다', () => {
        mockFlow = flow({ phase: 'submitting' });
        render(<RelayInviteDialog code={CODE} />);

        expect(screen.getByRole('button', { name: 'inviteAccept.decline' })).toBeDisabled();
    });

    it('채널 대기 중에는 안내 오버레이를 띄운다', () => {
        mockFlow = flow({ phase: 'awaitingChannel' });
        render(<RelayInviteDialog code={CODE} />);

        expect(screen.getByText('relayInviteAccept.preparingRoom')).toBeInTheDocument();
    });

    it('인증 스텝은 초대 코드를 동봉해 PhoneVerifyScreen을 띄운다', () => {
        mockFlow = flow({ phase: 'verifying' });
        render(<RelayInviteDialog code={CODE} />);

        fireEvent.click(screen.getByRole('button', { name: `verify:${CODE}` }));

        expect(mockFlow.onVerified).toHaveBeenCalledTimes(1);
    });

    it('프로필 스텝은 저장/이탈을 각각 다른 핸들러로 잇는다', () => {
        mockFlow = flow({ phase: 'profiling' });
        render(<RelayInviteDialog code={CODE} />);

        fireEvent.click(screen.getByRole('button', { name: 'profile-done' }));
        expect(mockFlow.onProfileSaved).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: 'profile-exit' }));
        expect(mockFlow.cancelStep).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['expired', 'inviteAccept.dialog.expired.title'],
        ['alreadyJoined', 'inviteAccept.dialog.alreadyJoined.title'],
        ['notFound', 'inviteAccept.dialog.notFound.title'],
        ['wrongNumber', 'inviteAccept.dialog.wrongNumber.title'],
        ['taken', 'inviteAccept.dialog.taken.title'],
    ] as const)('%s 안내 다이얼로그를 띄우고 확인 시 닫는다', (notice, title) => {
        mockFlow = flow({ phase: 'notice', notice });
        render(<RelayInviteDialog code={CODE} />);

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
        render(<RelayInviteDialog code={CODE} />);

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
        render(<RelayInviteDialog code={CODE} />);

        fireEvent.click(screen.getByRole('button', { name: 'inviteAccept.close' }));

        expect(mockFlow.dismissNotice).toHaveBeenCalled();
        expect(mockFlow.retry).not.toHaveBeenCalled();
    });

    it('닫힌 뒤에는 아무것도 렌더하지 않는다', () => {
        mockFlow = flow({ phase: 'closed' });
        const { container } = render(<RelayInviteDialog code={CODE} />);

        expect(container).toBeEmptyDOMElement();
    });

    // A relay 1:1 invite is not into a place. Two things guarantee the card stays away: this dialog
    // never forwards `site$` to the screen, and the screen gates the card on `targetKind` regardless
    // (ADR-0037). The mock carries a site precisely so neither guard can be dropped unnoticed.
    it('플레이스 카드를 그리지 않는다', () => {
        mockFlow = flow({
            invite: { id: 'inv-1', state: 'pending', inviter$: { name: 'Sunny' }, site$: { name: '북클럽' } },
        });
        render(<RelayInviteDialog code={CODE} />);

        expect(screen.getByText('Sunny')).toBeInTheDocument();
        expect(screen.queryByText('북클럽')).not.toBeInTheDocument();
    });
});
