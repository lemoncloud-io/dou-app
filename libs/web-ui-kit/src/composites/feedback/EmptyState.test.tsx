import { fireEvent, render, screen } from '@testing-library/react';

import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
    it('renders title and description', () => {
        render(<EmptyState title="친구의 응답을 기다리고 있어요" description="초대를 수락하면 시작할 수 있어요" />);

        expect(screen.getByText('친구의 응답을 기다리고 있어요')).toBeInTheDocument();
        expect(screen.getByText('초대를 수락하면 시작할 수 있어요')).toBeInTheDocument();
    });

    it('renders the action and fires onAction only when both label and handler are set', () => {
        const onAction = jest.fn();
        render(<EmptyState title="t" actionLabel="초대 다시 보내기" onAction={onAction} />);

        fireEvent.click(screen.getByRole('button', { name: /초대 다시 보내기/ }));
        expect(onAction).toHaveBeenCalledTimes(1);
    });

    it('omits the action button when only a label is provided', () => {
        render(<EmptyState title="t" actionLabel="초대 다시 보내기" />);

        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});
