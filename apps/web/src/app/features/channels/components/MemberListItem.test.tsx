import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { MemberListItem } from './MemberListItem';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

// Lightweight web-ui-kit stand-ins so assertions target MemberListItem's own logic
// (which badge/variant, onClick wiring) rather than library rendering internals.
jest.mock('@chatic/web-ui-kit', () => ({
    ListRow: ({ leading, title, onClick }: any) =>
        onClick ? (
            <button type="button" onClick={onClick}>
                {leading}
                {title}
            </button>
        ) : (
            <div>
                {leading}
                {title}
            </div>
        ),
    StatusBadge: ({ label, variant }: any) => (
        <span data-testid="badge" data-variant={variant}>
            {label}
        </span>
    ),
    DefaultAvatar: () => <div data-testid="default-avatar" />,
    ImageAvatar: ({ src, alt }: any) => <img data-testid="image-avatar" src={src} alt={alt} />,
}));

const member = { id: 'u1', name: '레모닝', avatar: null };

describe('MemberListItem', () => {
    it('onClick이 있으면 버튼으로 렌더되고 클릭 시 콜백을 호출한다', () => {
        const onClick = jest.fn();
        render(<MemberListItem member={member} onClick={onClick} />);

        const row = screen.getByRole('button');
        fireEvent.click(row);
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('onClick이 없으면 버튼이 아니다', () => {
        render(<MemberListItem member={member} />);
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('본인에게는 MY(mine) 뱃지를 노출한다', () => {
        render(<MemberListItem member={member} isMe />);
        const badge = screen.getByTestId('badge');
        expect(badge).toHaveTextContent('chat.settings.badge.mine');
        expect(badge).toHaveAttribute('data-variant', 'mine');
    });

    it('소유자(본인 아님)에게는 방장(owner) 뱃지를 노출한다', () => {
        render(<MemberListItem member={member} isOwner />);
        const badge = screen.getByTestId('badge');
        expect(badge).toHaveTextContent('chat.settings.badge.owner');
        expect(badge).toHaveAttribute('data-variant', 'owner');
    });

    it('소유자이면서 본인이면 방장 뱃지가 MY보다 우선한다', () => {
        render(<MemberListItem member={member} isOwner isMe />);
        const badge = screen.getByTestId('badge');
        expect(badge).toHaveAttribute('data-variant', 'owner');
    });

    it('초대 대기 중이면 pending 뱃지를 노출하고 다른 뱃지보다 우선한다', () => {
        render(<MemberListItem member={member} isPendingInvite isOwner />);
        const badge = screen.getByTestId('badge');
        expect(badge).toHaveTextContent('chat.settings.badge.pending');
        expect(badge).toHaveAttribute('data-variant', 'pending');
    });

    it('아무 역할도 없으면 뱃지를 노출하지 않는다', () => {
        render(<MemberListItem member={member} />);
        expect(screen.queryByTestId('badge')).not.toBeInTheDocument();
    });

    // ADR-0040: 내 프로필이 없을 때 이름 자리에 오는 유도 문구는 눌러야 하는 링크처럼 읽혀야
    // 한다 (Figma 3185-13278). 문구 선택은 호출자(ChannelSettingsPage) 몫이고, 여기서는 표기만.
    it('needsProfileSetup이면 이름에 밑줄을 붙인다', () => {
        render(<MemberListItem member={member} isMe needsProfileSetup />);
        expect(screen.getByText('레모닝')).toHaveClass('underline');
    });

    it('기본값에서는 이름에 밑줄이 없다', () => {
        render(<MemberListItem member={member} isMe />);
        expect(screen.getByText('레모닝')).not.toHaveClass('underline');
    });

    it('유도 상태에서도 MY 뱃지는 그대로 노출된다', () => {
        render(<MemberListItem member={member} isMe needsProfileSetup />);
        expect(screen.getByTestId('badge')).toHaveAttribute('data-variant', 'mine');
    });

    it('avatar가 있으면 ImageAvatar, 없으면 DefaultAvatar를 사용한다', () => {
        const { rerender } = render(<MemberListItem member={member} />);
        expect(screen.getByTestId('default-avatar')).toBeInTheDocument();

        rerender(<MemberListItem member={{ ...member, avatar: 'https://example.com/a.png' }} />);
        expect(screen.getByTestId('image-avatar')).toBeInTheDocument();
    });
});
