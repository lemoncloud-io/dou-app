import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const navigate = jest.fn();
const toast = jest.fn();
const createInvite = jest.fn();
const record = jest.fn();
const findByPhone = jest.fn();
const sendInviteMessage = jest.fn();
let mockInvites: Array<{ id: string; state?: string }> = [];

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
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
}));
jest.mock('../utils/sendInviteMessage', () => ({ sendInviteMessage: (...args: unknown[]) => sendInviteMessage(...args) }));
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
        findByPhone.mockReturnValue(undefined);
        sendInviteMessage.mockResolvedValue('sms');
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

    it('발급이 403으로 실패하면 게스트 안내 토스트를 띄운다', async () => {
        createInvite.mockRejectedValue(new Error('403 FORBIDDEN - not a main user'));

        render(<ContactInvitePage />);
        fillForm('홍길동', '01012345678');
        fireEvent.click(screen.getByText('contactInvite.submit'));

        await waitFor(() =>
            expect(toast).toHaveBeenCalledWith({ title: 'contactInvite.guestBlocked', variant: 'destructive' })
        );
        expect(navigate).not.toHaveBeenCalled();
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
