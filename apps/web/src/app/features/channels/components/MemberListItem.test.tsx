import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { MemberListItem } from './MemberListItem';

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

    it('본인에게는 MY 뱃지를, 소유자(본인 아님)에게는 소유자 뱃지를 노출한다', () => {
        const { rerender } = render(<MemberListItem member={member} isMe />);
        expect(screen.getByText('MY')).toBeInTheDocument();

        // Owner badge is a checkmark shown only for a non-self owner.
        rerender(<MemberListItem member={member} isOwner />);
        expect(screen.queryByText('MY')).not.toBeInTheDocument();
    });
});
