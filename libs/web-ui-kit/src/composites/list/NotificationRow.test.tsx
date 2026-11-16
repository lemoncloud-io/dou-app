import { act, fireEvent, render, screen } from '@testing-library/react';

import { NOTIFICATION_LONG_PRESS_MS, NotificationRow, type NotificationRowProps } from './NotificationRow';

const base: NotificationRowProps = {
    avatar: <span>avatar</span>,
    sender: 'Sister',
    time: '3:27 PM',
    body: 'How about Sapporo?',
};

// jsdom has no PointerEvent, so `fireEvent.pointer*` would drop the coordinates a scroll is told by.
beforeAll(() => {
    if (!('PointerEvent' in window)) {
        Object.defineProperty(window, 'PointerEvent', { value: class extends MouseEvent {}, configurable: true });
    }
});

describe('NotificationRow', () => {
    afterEach(() => jest.useRealTimers());

    it('draws sender, time, location, context, quote and body', () => {
        render(
            <NotificationRow
                {...base}
                typeChip={<span>Thread</span>}
                location="#Winter trip"
                context="Replied to you"
                quote="Original: somewhere new"
            />
        );

        for (const text of [
            'Sister',
            '3:27 PM',
            'Thread',
            '#Winter trip',
            'Replied to you',
            'Original: somewhere new',
            'How about Sapporo?',
        ]) {
            expect(screen.getByText(text)).toBeInTheDocument();
        }
    });

    it('marks an unread row with the dot and the lime ground, and a read one with neither', () => {
        const { container, rerender } = render(<NotificationRow {...base} unread unreadLabel="Unread" />);
        expect(container.querySelector('[data-unread-dot]')).not.toBeNull();
        expect(screen.getByRole('button', { name: 'Sister, Unread' })).toHaveClass('bg-primary/[0.08]');

        rerender(<NotificationRow {...base} />);
        expect(container.querySelector('[data-unread-dot]')).toBeNull();
        expect(screen.getByRole('button')).toHaveClass('bg-transparent');
    });

    it('shows the check only in selection mode and reports the selection', () => {
        const { rerender } = render(<NotificationRow {...base} />);
        expect(screen.getByRole('button')).not.toHaveAttribute('aria-pressed');

        rerender(<NotificationRow {...base} selectable selected unread />);
        const row = screen.getByRole('button');
        expect(row).toHaveAttribute('aria-pressed', 'true');
        // A picked row is tinted navy even when it is unread.
        expect(row).toHaveClass('bg-nav-ink/[0.06]');
    });

    it('fires onPress on a tap and on Enter', () => {
        const onPress = jest.fn();
        render(<NotificationRow {...base} onPress={onPress} />);

        fireEvent.click(screen.getByRole('button'));
        fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
        expect(onPress).toHaveBeenCalledTimes(2);
    });

    it('fires onLongPress after a held press and swallows the click that ends it', () => {
        jest.useFakeTimers();
        const onPress = jest.fn();
        const onLongPress = jest.fn();
        render(<NotificationRow {...base} onPress={onPress} onLongPress={onLongPress} />);
        const row = screen.getByRole('button');

        fireEvent.pointerDown(row, { clientX: 10, clientY: 10 });
        act(() => jest.advanceTimersByTime(NOTIFICATION_LONG_PRESS_MS));
        fireEvent.pointerUp(row);
        fireEvent.click(row);

        expect(onLongPress).toHaveBeenCalledTimes(1);
        expect(onPress).not.toHaveBeenCalled();
    });

    it('drops the long press when the finger moves away like a scroll', () => {
        jest.useFakeTimers();
        const onLongPress = jest.fn();
        render(<NotificationRow {...base} onLongPress={onLongPress} />);
        const row = screen.getByRole('button');

        fireEvent.pointerDown(row, { clientX: 10, clientY: 10 });
        fireEvent.pointerMove(row, { clientX: 10, clientY: 40 });
        act(() => jest.advanceTimersByTime(NOTIFICATION_LONG_PRESS_MS));

        expect(onLongPress).not.toHaveBeenCalled();
    });
});
