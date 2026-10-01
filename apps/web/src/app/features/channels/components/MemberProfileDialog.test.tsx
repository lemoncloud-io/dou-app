import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { MemberProfileDialog } from './MemberProfileDialog';

const toastMock = jest.fn();

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));
jest.mock('@chatic/web-ui-kit', () => ({
    ProfileAvatar: ({ alt }: { alt?: string }) => <div data-testid="avatar" aria-label={alt} />,
    ModalTopBar: ({ title }: { title?: string }) => <div>{title}</div>,
    ListRow: ({ title, onClick }: { title: React.ReactNode; onClick?: () => void }) => (
        <button onClick={onClick}>{title}</button>
    ),
    IconCheck: () => <span data-testid="owner-check" />,
}));

const member = { id: 'u1', name: '김두유', avatar: null };

beforeEach(() => jest.clearAllMocks());

describe('MemberProfileDialog — 뷰어/대상 분기', () => {
    it('대상=나: 프로필 설정만 노출하고 클릭 시 onOpenProfileSettings 호출', () => {
        const onOpenProfileSettings = jest.fn();
        render(
            <MemberProfileDialog
                open
                onOpenChange={() => undefined}
                member={member}
                isSelf
                onOpenProfileSettings={onOpenProfileSettings}
            />
        );

        expect(screen.queryByText('chat.settings.report')).not.toBeInTheDocument();
        fireEvent.click(screen.getByText('chat.settings.profileSettings'));
        expect(onOpenProfileSettings).toHaveBeenCalledTimes(1);
    });

    it('뷰어=초대받은자(canKick=false, 비-self): 신고만 노출', () => {
        render(<MemberProfileDialog open onOpenChange={() => undefined} member={member} canKick={false} />);

        expect(screen.getByText('chat.settings.report')).toBeInTheDocument();
        expect(screen.queryByText('chat.settings.friendSettings')).not.toBeInTheDocument();
        expect(screen.queryByText('chat.settings.removeMember')).not.toBeInTheDocument();
    });

    it('뷰어=소유자(canKick): 친구 설정·내보내기·신고 노출, 신고/친구설정은 토스트만', () => {
        render(<MemberProfileDialog open onOpenChange={() => undefined} member={member} canKick />);

        fireEvent.click(screen.getByText('chat.settings.report'));
        expect(toastMock).toHaveBeenCalledWith({ title: 'chat.settings.reportSuccess' });

        fireEvent.click(screen.getByText('chat.settings.friendSettings'));
        expect(toastMock).toHaveBeenCalledWith({ title: 'chat.settings.comingSoon' });
    });

    it('canKick: 내보내기 → 확인 → onKick 호출', async () => {
        const onKick = jest.fn();
        render(<MemberProfileDialog open onOpenChange={() => undefined} member={member} canKick onKick={onKick} />);

        fireEvent.click(screen.getByText('chat.settings.removeMember'));
        const confirm = await screen.findByText('chat.settings.kickDialog.confirm');
        fireEvent.click(confirm);
        expect(onKick).toHaveBeenCalledTimes(1);
    });

    it('대상이 방장이면 소유자 뱃지를 노출한다', () => {
        render(<MemberProfileDialog open onOpenChange={() => undefined} member={member} memberIsOwner />);
        expect(screen.getByTestId('owner-check')).toBeInTheDocument();
    });
});
