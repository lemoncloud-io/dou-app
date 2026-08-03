import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const navigate = jest.fn();
const toast = jest.fn();
const createInvite = jest.fn();
const record = jest.fn();
const findByInviteId = jest.fn();
const markCanceled = jest.fn();
const sendInviteMessage = jest.fn();

let mockInvite: any;
let mockIsLoading = false;
let mockSyncStatus: 'unknown' | 'waiting' | 'ready' | 'timeout' = 'unknown';
let mockIsCanceled = false;
/** Live store behind `markCanceled`, so a cancel the page makes is visible to `isCanceled`. */
const canceledIds = new Set<string>();

jest.mock('react-router-dom', () => ({ useParams: () => ({ inviteId: 'invite-1' }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
jest.mock('@chatic/web-core', () => ({ reportError: jest.fn() }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
// Same pattern as ChannelList.test.tsx: render the dropdown content unconditionally so the
// menu item is queryable without simulating a Radix trigger click. Covers both this file's own
// import and ChatRoomHeader's internal one (same module path).
jest.mock('@chatic/ui-kit/components/ui/dropdown-menu', () => ({
    DropdownMenu: ({ children }: any) => <div>{children}</div>,
    DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
    DropdownMenuItem: ({ children, onClick }: any) => <div onClick={onClick}>{children}</div>,
    DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
}));
// The real barrel also exports AddFriendSheet, which pulls channels/hooks -> @chatic/app-runtime
// -> chatic-sockets-lib -> lemon-model (needs a TextEncoder global this test env doesn't polyfill).
// Same fix PlaceChannelManagePage.test.tsx uses: mock the barrel down to what this page needs.
jest.mock('../../channels/components', () => ({
    ConfirmDialog: ({ open, title, description, confirmLabel, onConfirm }: any) =>
        open ? (
            <div>
                <span>{title}</span>
                <span>{description}</span>
                <button onClick={onConfirm}>{confirmLabel}</button>
            </div>
        ) : null,
}));
jest.mock('../../../hooks', () => ({
    useMyProfile: () => ({ profile: { nick: '보낸이' } }),
    useRelayInviteMutations: () => ({ createInvite }),
    useSentInviteLog: () => ({ record, findByInviteId }),
}));
jest.mock('../../home/hooks', () => ({
    useInviteCountdown: (expiredAt?: number) =>
        expiredAt ? { days: 0, hours: 1, minutes: 30, seconds: 0, isExpired: false, isImminent: false } : null,
}));
jest.mock('../hooks/useInviteWaitingStatus', () => ({
    useInviteWaitingStatus: () => ({ invite: mockInvite, isLoading: mockIsLoading, refetch: jest.fn() }),
}));
jest.mock('../hooks/useAcceptedChannelSync', () => ({
    useAcceptedChannelSync: () => ({ status: mockSyncStatus }),
}));
jest.mock('../hooks/useLocallyCanceledInvites', () => ({
    useLocallyCanceledInvites: () => ({
        isCanceled: (id: string) => mockIsCanceled || canceledIds.has(id),
        markCanceled,
    }),
}));
jest.mock('../utils/sendInviteMessage', () => ({
    sendInviteMessage: (...args: unknown[]) => sendInviteMessage(...args),
}));

import { InviteWaitingPage } from './InviteWaitingPage';

describe('InviteWaitingPage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockInvite = undefined;
        mockIsLoading = true;
        mockSyncStatus = 'unknown';
        mockIsCanceled = false;
        canceledIds.clear();
        markCanceled.mockImplementation((id: string) => canceledIds.add(id));
        sendInviteMessage.mockResolvedValue('sms');
    });

    it('로딩 중이고 아직 invite가 없으면 스피너를 보여준다', () => {
        render(<InviteWaitingPage />);
        expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    });

    it('로딩이 끝났는데 invite를 못 찾으면 홈 이동 CTA를 보여준다', () => {
        mockIsLoading = false;
        mockInvite = undefined;
        render(<InviteWaitingPage />);

        fireEvent.click(screen.getByText('inviteWaiting.goHome'));
        expect(navigate).toHaveBeenCalledWith('/', { replace: true });
    });

    it('pending이면 대기 문구와 카운트다운을 보여주고 취소 메뉴를 제공한다', () => {
        mockIsLoading = false;
        mockInvite = { id: 'invite-1', state: 'pending', name: '홍길동', expiredAt: Date.now() + 90 * 60_000 };
        render(<InviteWaitingPage />);

        expect(screen.getByText('홍길동')).toBeInTheDocument();
        expect(screen.getByText('inviteWaiting.pending.title')).toBeInTheDocument();
        expect(screen.getByText('inviteAccept.expiry.remaining')).toBeInTheDocument();
        expect(screen.getByText('inviteWaiting.cancelInvite')).toBeInTheDocument();
    });

    it('만료 상태에서 초대 다시 하기를 누르면 로그의 phone/name으로 재발급한다', async () => {
        mockIsLoading = false;
        mockInvite = { id: 'invite-1', state: 'expired', name: '홍길동' };
        findByInviteId.mockReturnValue({ inviteId: 'invite-1', phone: '01012345678', name: '홍길동' });
        createInvite.mockResolvedValue({ id: 'invite-2', deeplink: 'https://dou.chatic.io/s?code=xyz' });

        render(<InviteWaitingPage />);
        fireEvent.click(screen.getByText('inviteWaiting.reissue'));

        await waitFor(() => expect(createInvite).toHaveBeenCalledWith({ phone: '01012345678', name: '홍길동' }));
        expect(record).toHaveBeenCalledWith(
            { id: 'invite-2', deeplink: 'https://dou.chatic.io/s?code=xyz' },
            { phone: '01012345678', name: '홍길동' }
        );
        await waitFor(() => expect(navigate).toHaveBeenCalledWith('/invite/invite-2/waiting', { replace: true }));
    });

    it('재발급이 끝나면 직전 초대를 취소 처리하되 홈으로 튕기지 않는다', async () => {
        mockIsLoading = false;
        mockInvite = { id: 'invite-1', state: 'pending', name: '홍길동' };
        findByInviteId.mockReturnValue({ inviteId: 'invite-1', phone: '01012345678', name: '홍길동' });
        createInvite.mockResolvedValue({ id: 'invite-2', deeplink: 'https://dou.chatic.io/s?code=xyz' });

        render(<InviteWaitingPage />);
        fireEvent.click(screen.getByText('inviteWaiting.reissue'));

        await waitFor(() => expect(markCanceled).toHaveBeenCalledWith('invite-1'));
        expect(navigate).toHaveBeenCalledWith('/invite/invite-2/waiting', { replace: true });
        // The cancel is this screen's own, so the "canceled invite" redirect must stay out of it —
        // otherwise the reissue lands on home instead of the new invite's waiting screen.
        expect(navigate).not.toHaveBeenCalledWith('/', { replace: true });
    });

    it('로그에 없는(스토리지 소실 등) invite는 재발급하지 않고 안내 토스트만 띄운다', () => {
        mockIsLoading = false;
        mockInvite = { id: 'invite-1', state: 'expired', name: '홍길동' };
        findByInviteId.mockReturnValue(undefined);

        render(<InviteWaitingPage />);
        fireEvent.click(screen.getByText('inviteWaiting.reissue'));

        expect(createInvite).not.toHaveBeenCalled();
        expect(toast).toHaveBeenCalledWith({ title: 'inviteWaiting.reissueMissingLog', variant: 'destructive' });
    });

    it('취소 확인 시 로컬로만 취소 처리하고(서버 호출 없음) 홈으로 이동한다', () => {
        mockIsLoading = false;
        mockInvite = { id: 'invite-1', state: 'pending', name: '홍길동' };

        render(<InviteWaitingPage />);
        fireEvent.click(screen.getByText('inviteWaiting.cancelInvite'));

        // INVITE_CANCEL_API_SUPPORTED defaults to false — the dialog must show the honest
        // "local-only" stub copy, not the one that claims the invite itself is invalidated.
        expect(screen.getByText('inviteWaiting.cancelDialog.descriptionStub')).toBeInTheDocument();

        fireEvent.click(screen.getByText('inviteWaiting.cancelDialog.confirm'));

        expect(markCanceled).toHaveBeenCalledWith('invite-1');
        expect(toast).toHaveBeenCalledWith({ title: 'inviteWaiting.canceledToast' });
        expect(navigate).toHaveBeenCalledWith('/', { replace: true });
    });

    it('로컬에서 이미 취소 처리된 invite는 즉시 홈으로 리다이렉트한다', () => {
        mockIsCanceled = true;
        mockIsLoading = false;
        mockInvite = { id: 'invite-1', state: 'pending', name: '홍길동' };

        render(<InviteWaitingPage />);

        expect(navigate).toHaveBeenCalledWith('/', { replace: true });
    });

    it('accepted이고 채널 sync 대기 중이면 입장 중 문구를 보여준다', () => {
        mockIsLoading = false;
        mockInvite = { id: 'invite-1', state: 'accepted', name: '홍길동', channelId: 'ch-1' };
        mockSyncStatus = 'waiting';

        render(<InviteWaitingPage />);

        expect(screen.getByText('inviteWaiting.entering')).toBeInTheDocument();
        expect(navigate).not.toHaveBeenCalled();
    });

    it('accepted이고 채널 sync가 끝나면 실채널로 이동한다', () => {
        mockIsLoading = false;
        mockInvite = { id: 'invite-1', state: 'accepted', name: '홍길동', channelId: 'ch-1' };
        mockSyncStatus = 'ready';

        render(<InviteWaitingPage />);

        expect(navigate).toHaveBeenCalledWith('/channels/ch-1/room', { replace: true });
    });

    it('accepted인데 채널 sync가 timeout/unknown이면 홈 이동 CTA를 보여준다', () => {
        mockIsLoading = false;
        mockInvite = { id: 'invite-1', state: 'accepted', name: '홍길동' };
        mockSyncStatus = 'unknown';

        render(<InviteWaitingPage />);

        expect(screen.getByText('inviteWaiting.accepted.title')).toBeInTheDocument();
        fireEvent.click(screen.getByText('inviteWaiting.goHome'));
        expect(navigate).toHaveBeenCalledWith('/', { replace: true });
    });
});
