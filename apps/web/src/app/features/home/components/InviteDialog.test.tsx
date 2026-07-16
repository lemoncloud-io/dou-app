import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { InviteDialog } from './InviteDialog';

// Mutable per-test fixtures (must be `mock`-prefixed to be usable inside jest.mock factories).
let mockSearch = '';
let mockInfo: unknown = undefined;
let mockAccept = { accept: jest.fn(), isAccepting: false, missingDelegator: false, errorKey: null as string | null };

const mockNavigate = jest.fn();
const mockLogout = jest.fn();
const mockAcceptFn = jest.fn();

jest.mock('react-router-dom', () => ({ useLocation: () => ({ search: mockSearch }) }));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => mockNavigate }));
jest.mock('@chatic/web-core', () => ({ useInviteInfo: () => ({ data: mockInfo }) }));
jest.mock('../../../runtime/useSessionLogout', () => ({ useSessionLogout: () => mockLogout }));
jest.mock('../hooks', () => ({
    useInviteAccept: () => ({ ...mockAccept, accept: mockAcceptFn }),
    useInviteCountdown: () => null,
}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k }),
}));

const INVITE_SEARCH = '?provider=invite&code=abc&_backend=https%3A%2F%2Fx.example';

beforeEach(() => {
    jest.clearAllMocks();
    mockSearch = INVITE_SEARCH;
    mockInfo = { inviter$: { name: 'Sunny' }, site$: { name: '북클럽' } };
    mockAccept = { accept: jest.fn(), isAccepting: false, missingDelegator: false, errorKey: null };
});

describe('InviteDialog', () => {
    it('초대 딥링크가 아니면 아무것도 렌더하지 않는다', () => {
        mockSearch = '?foo=bar';
        const { container } = render(<InviteDialog />);
        expect(container).toBeEmptyDOMElement();
    });

    it('suppressed면 초대 딥링크여도 렌더하지 않는다', () => {
        const { container } = render(<InviteDialog suppressed />);
        expect(container).toBeEmptyDOMElement();
    });

    it('수락 화면에 초대자·플레이스·거절/수락을 렌더한다', () => {
        render(<InviteDialog />);
        expect(screen.getByText('Sunny')).toBeInTheDocument();
        expect(screen.getByText('북클럽')).toBeInTheDocument();
        expect(screen.getByText('inviteAccept.target.you')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'inviteAccept.accept' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'inviteAccept.decline' })).toBeInTheDocument();
    });

    it('수락 클릭 시 accept 파이프라인을 호출한다', () => {
        render(<InviteDialog />);
        fireEvent.click(screen.getByRole('button', { name: 'inviteAccept.accept' }));
        expect(mockAcceptFn).toHaveBeenCalledTimes(1);
    });

    it('거절 클릭 시 홈으로 이동한다', () => {
        render(<InviteDialog />);
        fireEvent.click(screen.getByRole('button', { name: 'inviteAccept.decline' }));
        expect(mockNavigate).toHaveBeenCalled();
    });

    it('수락 진행 중에는 닫기(X)가 홈 이동을 막는다', () => {
        mockAccept = { accept: jest.fn(), isAccepting: true, missingDelegator: false, errorKey: null };
        render(<InviteDialog />);
        fireEvent.click(screen.getByRole('button', { name: 'inviteAccept.close' }));
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('만료 errorKey면 만료 다이얼로그를 띄운다', () => {
        mockAccept = {
            accept: jest.fn(),
            isAccepting: false,
            missingDelegator: false,
            errorKey: 'inviteAccept.expired',
        };
        render(<InviteDialog />);
        expect(screen.getByText('inviteAccept.dialog.expired.title')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'inviteAccept.confirm' }));
        expect(mockNavigate).toHaveBeenCalled();
    });

    it('구분 안 되는 errorKey는 generic 다이얼로그로 폴백한다', () => {
        mockAccept = {
            accept: jest.fn(),
            isAccepting: false,
            missingDelegator: false,
            errorKey: 'inviteAccept.enterFailed',
        };
        render(<InviteDialog />);
        expect(screen.getByText('inviteAccept.dialog.generic.title')).toBeInTheDocument();
    });

    it('missingDelegator면 로그아웃 다이얼로그를 띄우고 확인 시 로그아웃한다', () => {
        mockAccept = { accept: jest.fn(), isAccepting: false, missingDelegator: true, errorKey: null };
        render(<InviteDialog />);
        expect(screen.getByText('inviteAccept.dialog.missingDelegator.title')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'auth.logout' }));
        expect(mockLogout).toHaveBeenCalledWith({ preserveUrl: true });
    });

    it('플레이스 소개/썸네일이 없으면 접어서 이름만 보인다 (degrade)', () => {
        render(<InviteDialog />);
        // 소개 문구 키가 없으므로 별도 텍스트가 렌더되지 않고 이름만 존재.
        expect(screen.getByText('북클럽')).toBeInTheDocument();
        expect(screen.queryByRole('img', { name: /place/i })).not.toBeInTheDocument();
    });
});
