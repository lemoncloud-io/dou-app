import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const navigate = jest.fn();
const toast = jest.fn();
const createInvite = jest.fn();
const cancelInvite = jest.fn();
const retire = jest.fn();
const record = jest.fn();
const findByInviteId = jest.fn();
const markCanceled = jest.fn();
const sendInviteMessage = jest.fn();
const refetch = jest.fn();

let mockInvite: any;
let mockIsLoading = false;
let mockSyncStatus: 'unknown' | 'waiting' | 'ready' | 'timeout' = 'unknown';
let mockIsCanceled = false;
/** Live store behind `markCanceled`, so a dismiss the page makes is visible to `isCanceled`. */
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
    useRelayInviteMutations: () => ({ createInvite, cancelInvite }),
    useSentInviteLog: () => ({ record, findByInviteId }),
}));
jest.mock('../hooks/useInviteWaitingStatus', () => ({
    useInviteWaitingStatus: () => ({ invite: mockInvite, isLoading: mockIsLoading, refetch }),
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
// The retire policy itself is covered by useRetireInvite.test.ts — here it is a controllable seam
// so each reissue branch (canceled/conflict/failed/dismissed) can be staged directly.
jest.mock('../hooks/useRetireInvite', () => ({
    useRetireInvite: () => ({ retire }),
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
        retire.mockResolvedValue('canceled');
        cancelInvite.mockResolvedValue({ id: 'invite-1', state: 'canceled', canceledAt: 1 });
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

    describe('취소 — 실 invite.cancel (ADR-0043)', () => {
        beforeEach(() => {
            mockIsLoading = false;
            mockInvite = { id: 'invite-1', code: 'c0de', state: 'pending', name: '홍길동' };
        });

        const confirmCancel = () => {
            render(<InviteWaitingPage />);
            fireEvent.click(screen.getByText('inviteWaiting.cancelInvite'));
            // The stub-era "local only" copy is gone — the dialog states the real consequence.
            expect(screen.getByText('inviteWaiting.cancelDialog.description')).toBeInTheDocument();
            fireEvent.click(screen.getByText('inviteWaiting.cancelDialog.confirm'));
        };

        it('확인 시 합성 코드로 invite.cancel을 보내고 성공하면 토스트 후 홈으로 간다', async () => {
            confirmCancel();

            await waitFor(() => expect(cancelInvite).toHaveBeenCalledWith('invt:invite-1:c0de'));
            await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'inviteWaiting.canceledToast' }));
            expect(navigate).toHaveBeenCalledWith('/', { replace: true });
            expect(markCanceled).not.toHaveBeenCalled(); // 서버가 기억한다 — 로컬 스탬프는 더 이상 없다
        });

        it('409(이미 수락)면 홈으로 가지 않고 목록을 재조회해 화면이 사실을 따르게 한다', async () => {
            cancelInvite.mockRejectedValue(Object.assign(new Error('conflict'), { errorCode: 409 }));

            confirmCancel();

            await waitFor(() => expect(refetch).toHaveBeenCalled());
            expect(toast).not.toHaveBeenCalledWith({ title: 'inviteWaiting.canceledToast' });
            expect(navigate).not.toHaveBeenCalledWith('/', { replace: true });
        });

        it('그 외 실패는 실패 토스트를 띄우고 화면에 남는다 — 멱등이라 재시도해도 안전하다', async () => {
            cancelInvite.mockRejectedValue(new Error('503 SOCKET NOT CONNECTED'));

            confirmCancel();

            await waitFor(() =>
                expect(toast).toHaveBeenCalledWith({ title: 'inviteWaiting.cancelFailed', variant: 'destructive' })
            );
            expect(navigate).not.toHaveBeenCalledWith('/', { replace: true });
        });
    });

    describe('재발급 — 이전 초대 retire 선행 (ADR-0043 결정 5) · 국가 복원 (ADR-0044)', () => {
        beforeEach(() => {
            mockIsLoading = false;
            // The log key IS the E.164 value the packet wants now; parsing it back only recovers the
            // country, for the `countryCode` field (ADR-0044 §5 correction).
            findByInviteId.mockReturnValue({ inviteId: 'invite-1', phone: '+821012345678', name: '홍길동' });
            createInvite.mockResolvedValue({ id: 'invite-2', deeplink: 'https://dou.chatic.io/s?code=xyz' });
        });

        it('retire가 canceled로 끝나야 새로 발급하고 새 대기 화면으로 교체 이동한다', async () => {
            mockInvite = { id: 'invite-1', code: 'c0de', state: 'pending', name: '홍길동' };

            render(<InviteWaitingPage />);
            fireEvent.click(screen.getByText('inviteWaiting.reissue'));

            await waitFor(() => expect(retire).toHaveBeenCalledWith(mockInvite));
            await waitFor(() =>
                expect(createInvite).toHaveBeenCalledWith({
                    phone: '+821012345678',
                    name: '홍길동',
                    countryCode: 'KR',
                })
            );
            expect(record).toHaveBeenCalledWith(
                { id: 'invite-2', deeplink: 'https://dou.chatic.io/s?code=xyz' },
                { phone: '+821012345678', name: '홍길동' }
            );
            await waitFor(() => expect(navigate).toHaveBeenCalledWith('/invite/invite-2/waiting', { replace: true }));
        });

        it('pending인데 retire가 실패하면 발급하지 않는다 — 유효한 코드가 둘 생기면 안 된다', async () => {
            mockInvite = { id: 'invite-1', code: 'c0de', state: 'pending', name: '홍길동' };
            retire.mockResolvedValue('failed');

            render(<InviteWaitingPage />);
            fireEvent.click(screen.getByText('inviteWaiting.reissue'));

            await waitFor(() =>
                expect(toast).toHaveBeenCalledWith({ title: 'inviteWaiting.reissueFailed', variant: 'destructive' })
            );
            expect(createInvite).not.toHaveBeenCalled();
        });

        it('pending인데 retire가 conflict(이미 수락)면 발급 대신 목록을 재조회한다', async () => {
            mockInvite = { id: 'invite-1', code: 'c0de', state: 'pending', name: '홍길동' };
            retire.mockResolvedValue('conflict');

            render(<InviteWaitingPage />);
            fireEvent.click(screen.getByText('inviteWaiting.reissue'));

            await waitFor(() => expect(refetch).toHaveBeenCalled());
            expect(createInvite).not.toHaveBeenCalled();
        });

        it('expired는 retire가 실패해도 발급을 진행한다 — 죽은 링크 정리는 베스트 에포트다', async () => {
            mockInvite = { id: 'invite-1', code: 'c0de', state: 'expired', name: '홍길동' };
            retire.mockResolvedValue('failed');

            render(<InviteWaitingPage />);
            fireEvent.click(screen.getByText('inviteWaiting.reissue'));

            await waitFor(() => expect(createInvite).toHaveBeenCalled());
            await waitFor(() => expect(navigate).toHaveBeenCalledWith('/invite/invite-2/waiting', { replace: true }));
        });

        it('rejected에서 재발급하면 retire(dismiss)가 로컬 기록을 남겨도 홈으로 튕기지 않는다', async () => {
            mockInvite = { id: 'invite-1', code: 'c0de', state: 'rejected', name: '홍길동' };
            retire.mockImplementation(async () => {
                markCanceled('invite-1'); // dismiss가 남긴 기록이 isGone을 뒤집는 상황을 재현
                return 'dismissed';
            });

            render(<InviteWaitingPage />);
            fireEvent.click(screen.getByText('inviteWaiting.reissue'));

            await waitFor(() => expect(navigate).toHaveBeenCalledWith('/invite/invite-2/waiting', { replace: true }));
            // The dismiss is this screen's own, so the "gone invite" redirect must stay out of it —
            // otherwise the reissue lands on home instead of the new invite's waiting screen.
            expect(navigate).not.toHaveBeenCalledWith('/', { replace: true });
        });

        it('로그에 없는(스토리지 소실 등) invite는 재발급하지 않고 안내 토스트만 띄운다', () => {
            mockInvite = { id: 'invite-1', code: 'c0de', state: 'expired', name: '홍길동' };
            findByInviteId.mockReturnValue(undefined);

            render(<InviteWaitingPage />);
            fireEvent.click(screen.getByText('inviteWaiting.reissue'));

            expect(createInvite).not.toHaveBeenCalled();
            expect(retire).not.toHaveBeenCalled();
            expect(toast).toHaveBeenCalledWith({ title: 'inviteWaiting.reissueMissingLog', variant: 'destructive' });
        });

        it('로그의 키가 국가를 잃었으면 재발급하지 않는다 — 어느 나라로 보낼지 알 수 없다', () => {
            mockInvite = { id: 'invite-1', code: 'c0de', state: 'expired', name: '홍길동' };
            // A v1-era local-digits key that somehow survived: no `+`, so no country to send with.
            findByInviteId.mockReturnValue({ inviteId: 'invite-1', phone: '01012345678', name: '홍길동' });

            render(<InviteWaitingPage />);
            fireEvent.click(screen.getByText('inviteWaiting.reissue'));

            expect(createInvite).not.toHaveBeenCalled();
            expect(retire).not.toHaveBeenCalled();
            expect(toast).toHaveBeenCalledWith({ title: 'inviteWaiting.reissueMissingLog', variant: 'destructive' });
        });
    });

    it('rejected면 거절 상태 블록을 보여주고 취소 버튼과 유효시간 카드는 접는다 (Figma 3263-30117)', () => {
        mockIsLoading = false;
        mockInvite = {
            id: 'invite-1',
            code: 'c0de',
            state: 'rejected',
            name: '홍길동',
            expiredAt: Date.now() + 90 * 60_000,
        };

        render(<InviteWaitingPage />);

        expect(screen.getByText('inviteWaiting.rejected.title')).toBeInTheDocument();
        expect(screen.getByText('inviteWaiting.reissue')).toBeInTheDocument();
        expect(screen.queryByText('inviteWaiting.cancelInvite')).not.toBeInTheDocument();
        expect(screen.queryByText('inviteAccept.expiry.remaining')).not.toBeInTheDocument();
    });

    it('서버 상태가 canceled면(다른 기기에서 취소 등) 즉시 홈으로 리다이렉트한다', () => {
        mockIsLoading = false;
        mockInvite = { id: 'invite-1', state: 'canceled', name: '홍길동' };

        render(<InviteWaitingPage />);

        expect(navigate).toHaveBeenCalledWith('/', { replace: true });
    });

    it('로컬에서 dismiss된 invite는 즉시 홈으로 리다이렉트한다', () => {
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
