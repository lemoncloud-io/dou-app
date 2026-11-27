import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { ThreadSummary } from './ThreadSummary';

const faces = (n: number) => Array.from({ length: n }, (_, i) => <span key={i} data-testid="face" />);

describe('ThreadSummary', () => {
    it('always says how many replies there are, and opens on a tap', () => {
        const onClick = jest.fn();
        render(<ThreadSummary replyLabel="3 replies" onClick={onClick} />);

        expect(screen.getByText('3 replies')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button'));
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('stacks the faces it is given, and closes an overflow with a +N pill', () => {
        const { rerender } = render(<ThreadSummary avatars={faces(2)} replyLabel="2 replies" />);
        expect(screen.getAllByTestId('face')).toHaveLength(2);
        expect(screen.queryByText(/^\+/)).toBeNull();

        rerender(<ThreadSummary avatars={faces(2)} overflowCount={3} replyLabel="5 replies" />);
        expect(screen.getByText('+3')).toBeInTheDocument();
    });

    it('keeps one line, with the time beside the count, while nothing is new', () => {
        const { container } = render(<ThreadSummary replyLabel="3 replies" time="12:06 PM" />);

        expect(container.querySelector('[data-new-replies]')).toBeNull();
        expect(screen.getByText('12:06 PM').parentElement).toBe(screen.getByText('3 replies').parentElement);
    });

    it('opens a second line for new replies: the blue box, then the time beside it', () => {
        const { container } = render(
            <ThreadSummary replyLabel="3 replies" newReplyLabel="1 new reply" preview="Sis: sure" time="12:06 PM" />
        );

        const box = container.querySelector('[data-new-replies]') as HTMLElement;
        expect(box).toContainElement(screen.getByText('1 new reply'));
        expect(screen.getByText('1 new reply')).toHaveClass('text-point-blue');
        expect(box).toContainElement(screen.getByText('Sis: sure'));
        expect(screen.getByText('Sis: sure')).toHaveClass('truncate');
        expect(screen.getByText('12:06 PM').parentElement).toBe(box.parentElement);
    });

    it('says "mentions me" in orange only when it is given', () => {
        const { rerender } = render(<ThreadSummary replyLabel="3 replies" newReplyLabel="1 new reply" />);
        expect(screen.queryByText('Mentions me')).toBeNull();

        rerender(<ThreadSummary replyLabel="3 replies" newReplyLabel="1 new reply" mentionLabel="Mentions me" />);
        expect(screen.getByText('Mentions me').parentElement).toHaveClass('text-point-orange');
    });

    it('mirrors both lines for my own message', () => {
        const { rerender } = render(<ThreadSummary replyLabel="3 replies" newReplyLabel="1 new reply" />);
        expect(screen.getByText('3 replies').parentElement).not.toHaveClass('flex-row-reverse');

        rerender(<ThreadSummary replyLabel="3 replies" newReplyLabel="1 new reply" align="end" />);
        expect(screen.getByRole('button')).toHaveClass('items-end');
        expect(screen.getByText('3 replies').parentElement).toHaveClass('flex-row-reverse');
        expect(screen.getByText('1 new reply').closest('[data-new-replies]')?.parentElement).toHaveClass(
            'flex-row-reverse'
        );
    });
});
