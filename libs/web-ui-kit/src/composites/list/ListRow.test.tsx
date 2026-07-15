import { fireEvent, render, screen } from '@testing-library/react';

import { ListRow } from './ListRow';

describe('ListRow', () => {
    it('renders title, subtitle and slots', () => {
        render(
            <ListRow leading={<span>AV</span>} title="<친구 이름>" subtitle="나와의 채팅" trailing={<span>›</span>} />
        );
        expect(screen.getByText('<친구 이름>')).toBeInTheDocument();
        expect(screen.getByText('나와의 채팅')).toBeInTheDocument();
        expect(screen.getByText('AV')).toBeInTheDocument();
        expect(screen.getByText('›')).toBeInTheDocument();
    });

    it('is a button and fires onClick when clickable', () => {
        const onClick = jest.fn();
        render(<ListRow title="방 삭제" destructive onClick={onClick} />);
        const row = screen.getByRole('button', { name: '방 삭제' });
        fireEvent.click(row);
        expect(onClick).toHaveBeenCalledTimes(1);
        expect(row.querySelector('.text-destructive')).toBeTruthy();
    });

    it('is not a button without onClick', () => {
        render(<ListRow title="대화방 알림" trailing={<input type="checkbox" />} />);
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});
