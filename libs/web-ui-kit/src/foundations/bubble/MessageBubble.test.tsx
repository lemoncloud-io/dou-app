import { fireEvent, render, screen } from '@testing-library/react';

import { MessageBubble } from './MessageBubble';

describe('MessageBubble', () => {
    it('renders content and uses the other (light) variant by default', () => {
        render(<MessageBubble>안녕하세요</MessageBubble>);
        const bubble = screen.getByText('안녕하세요').parentElement as HTMLElement;
        expect(bubble.className).toContain('bg-bubble-other');
    });

    it('uses the mine (dark) variant', () => {
        render(<MessageBubble variant="mine">보낸 메시지</MessageBubble>);
        const bubble = screen.getByText('보낸 메시지').parentElement as HTMLElement;
        expect(bubble.className).toContain('bg-bubble-mine');
    });

    it('marks its variant for the content inside to read', () => {
        render(
            <>
                <MessageBubble variant="mine">보낸 메시지</MessageBubble>
                <MessageBubble>받은 메시지</MessageBubble>
            </>
        );
        const mine = screen.getByText('보낸 메시지').parentElement as HTMLElement;
        const other = screen.getByText('받은 메시지').parentElement as HTMLElement;

        expect(mine).toHaveAttribute('data-variant', 'mine');
        expect(other).toHaveAttribute('data-variant', 'other');
        expect(mine.className).toContain('group/bubble');
    });

    it('shows the expand affordance and fires onExpand', () => {
        const onExpand = jest.fn();
        render(
            <MessageBubble onExpand={onExpand} expandLabel="전체보기">
                긴 메시지
            </MessageBubble>
        );
        fireEvent.click(screen.getByRole('button', { name: /전체보기/ }));
        expect(onExpand).toHaveBeenCalledTimes(1);
    });

    it('omits the expand affordance without onExpand', () => {
        render(<MessageBubble>짧은 메시지</MessageBubble>);
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('outlines a light bubble in lime under a highlighted ancestor, without a border that moves it', () => {
        const { container } = render(
            <>
                <MessageBubble>other</MessageBubble>
                <MessageBubble variant="mine">mine</MessageBubble>
            </>
        );
        const [other, mine] = Array.from(container.querySelectorAll('[data-variant]'));
        expect(other.className).toContain('[[data-highlight]_&]:ring-primary');
        expect(other.className).not.toMatch(/(^| )border( |$)/);
        expect(mine.className).not.toContain('[[data-highlight]_&]');
    });
});
