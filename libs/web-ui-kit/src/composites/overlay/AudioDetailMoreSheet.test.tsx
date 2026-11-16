import { fireEvent, render, screen } from '@testing-library/react';

import { AudioDetailMoreSheet } from './AudioDetailMoreSheet';

describe('AudioDetailMoreSheet', () => {
    it('lists every row whose handler is given, and no copy-link row', () => {
        render(
            <AudioDetailMoreSheet
                open
                onOpenChange={jest.fn()}
                onViewInChat={jest.fn()}
                onReplyInThread={jest.fn()}
                onDelete={jest.fn()}
            />
        );
        expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual([
            'View in chat',
            'Reply in thread',
            'Delete',
        ]);
        expect(screen.queryByText(/copy link/i)).toBeNull();
    });

    it('hides the rows without a handler', () => {
        render(<AudioDetailMoreSheet open onOpenChange={jest.fn()} onViewInChat={jest.fn()} />);
        expect(screen.getByRole('button', { name: 'View in chat' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Reply in thread' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    });

    it('runs the row and closes the sheet', () => {
        const onDelete = jest.fn();
        const onOpenChange = jest.fn();
        render(<AudioDetailMoreSheet open onOpenChange={onOpenChange} onDelete={onDelete} />);
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        expect(onDelete).toHaveBeenCalledTimes(1);
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('draws delete in the destructive colour', () => {
        render(<AudioDetailMoreSheet open onOpenChange={jest.fn()} onDelete={jest.fn()} onViewInChat={jest.fn()} />);
        expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('text-alert-red');
        expect(screen.getByRole('button', { name: 'View in chat' })).toHaveClass('text-foreground');
    });

    it('is named for assistive tech and takes translated labels', () => {
        render(
            <AudioDetailMoreSheet
                open
                onOpenChange={jest.fn()}
                onReplyInThread={jest.fn()}
                labels={{ title: '더보기', replyInThread: '스레드에서 답글' }}
            />
        );
        expect(screen.getByRole('dialog', { name: '더보기' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '스레드에서 답글' })).toBeInTheDocument();
    });

    it('renders nothing when closed', () => {
        render(<AudioDetailMoreSheet open={false} onOpenChange={jest.fn()} onDelete={jest.fn()} />);
        expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    });
});
