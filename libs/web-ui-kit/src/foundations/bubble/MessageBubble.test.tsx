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
});
