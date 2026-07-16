import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { MemberProfileDialog } from './MemberProfileDialog';

const toastMock = jest.fn();

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));
jest.mock('@chatic/web-ui-kit', () => ({
    ProfileAvatar: ({ alt }: { alt?: string }) => <div data-testid="avatar" aria-label={alt} />,
}));
// Render dropdown content inline so menu items are deterministically queryable.
jest.mock('@chatic/ui-kit/components/ui/dropdown-menu', () => ({
    DropdownMenu: ({ children }: any) => <div>{children}</div>,
    DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
    DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
    DropdownMenuItem: ({ children, onSelect, className }: any) => (
        <button className={className} onClick={onSelect}>
            {children}
        </button>
    ),
}));

const member = { id: 'u1', name: '김두유', avatar: null };

beforeEach(() => jest.clearAllMocks());

describe('MemberProfileDialog', () => {
    it('신고하기는 백엔드 연동 없이 토스트만 띄운다', () => {
        render(<MemberProfileDialog open onOpenChange={() => undefined} member={member} />);

        fireEvent.click(screen.getByText('chat.settings.report'));
        expect(toastMock).toHaveBeenCalledWith({ title: 'chat.settings.reportSuccess' });
    });

    it('canKick=false면 친구 삭제 항목을 노출하지 않는다', () => {
        render(<MemberProfileDialog open onOpenChange={() => undefined} member={member} canKick={false} />);
        expect(screen.queryByText('chat.settings.deleteFriend')).not.toBeInTheDocument();
    });

    it('canKick=true면 친구 삭제 → 확인 → onKick 호출', async () => {
        const onKick = jest.fn();
        render(<MemberProfileDialog open onOpenChange={() => undefined} member={member} canKick onKick={onKick} />);

        fireEvent.click(screen.getByText('chat.settings.deleteFriend'));

        // Confirm dialog opens; confirming triggers the kick.
        const confirm = await screen.findByText('chat.settings.kickDialog.confirm');
        fireEvent.click(confirm);
        expect(onKick).toHaveBeenCalledTimes(1);
    });
});
