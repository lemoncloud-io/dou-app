import { render, screen } from '@testing-library/react';

import { UnreadBadge } from './UnreadBadge';

describe('UnreadBadge', () => {
    it('renders nothing when there is nothing unread', () => {
        const { container } = render(<UnreadBadge count={0} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('caps the displayed count at max', () => {
        render(<UnreadBadge count={1200} max={999} />);
        expect(screen.getByRole('status')).toHaveTextContent('+999');
    });

    it('uses the pink pill for the chat-list variant', () => {
        render(<UnreadBadge count={2} variant="pill" label="2개 안 읽음" />);
        const badge = screen.getByRole('status', { name: '2개 안 읽음' });
        expect(badge).toHaveTextContent('2');
        expect(badge).toHaveClass('bg-point-pink', 'text-white');
    });

    it('keeps the inline accent number on the green main accent', () => {
        render(<UnreadBadge count={2} />);
        expect(screen.getByRole('status')).toHaveClass('text-main-accent');
    });
});
