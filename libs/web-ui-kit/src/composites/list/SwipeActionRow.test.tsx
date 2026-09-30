import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { PullToRefresh } from '../layout/PullToRefresh';
import {
    resolveSwipeOffset,
    resolveSwipeRelease,
    SWIPE_ACTION_WIDTH,
    SwipeActionRow,
    type SwipeAction,
    type SwipeSide,
} from './SwipeActionRow';

const touch = (clientX: number, clientY = 0, identifier = 1) => ({ touches: [{ identifier, clientX, clientY }] });

/** One finger down at x=0, dragged sideways to `toX`, then lifted. */
const drag = (node: HTMLElement, toX: number) => {
    fireEvent.touchStart(node, touch(0));
    // The first move only clears the slop; the swipe is measured from where it cleared it.
    fireEvent.touchMove(node, touch(Math.sign(toX) * 10));
    fireEvent.touchMove(node, touch(toX));
    fireEvent.touchEnd(node, { touches: [] });
};

const action = (key: string, onSelect = jest.fn()): SwipeAction => ({ key, label: key, onSelect });

interface HarnessProps {
    leading?: SwipeAction[];
    trailing?: SwipeAction[];
    initialOpen?: SwipeSide | null;
    onReveal?: (side: SwipeSide) => void;
    onOpenChange?: (side: SwipeSide | null) => void;
    onContentClick?: () => void;
}

/** A host that holds `open`, as the kit expects one to. */
const Harness = ({ leading, trailing, initialOpen = null, onReveal, onOpenChange, onContentClick }: HarnessProps) => {
    const [open, setOpen] = React.useState<SwipeSide | null>(initialOpen);
    return (
        <>
            <SwipeActionRow
                leadingActions={leading}
                trailingActions={trailing}
                open={open}
                onOpenChange={side => {
                    onOpenChange?.(side);
                    setOpen(side);
                }}
                onReveal={onReveal}
            >
                <button type="button" onClick={onContentClick}>
                    content
                </button>
            </SwipeActionRow>
            <button type="button" data-testid="outside">
                outside
            </button>
        </>
    );
};

const content = () => screen.getByRole('button', { name: 'content' });

describe('resolveSwipeOffset', () => {
    it('follows the finger 1:1 within a side', () => {
        expect(resolveSwipeOffset(40, 72, 144)).toBe(40);
        expect(resolveSwipeOffset(-100, 72, 144)).toBe(-100);
    });

    it('turns elastic past the side’s full width', () => {
        expect(resolveSwipeOffset(72 + 100, 72, 0)).toBe(72 + 30);
    });

    it('does not move toward a side with no actions', () => {
        expect(resolveSwipeOffset(50, 0, 144)).toBe(0);
        expect(resolveSwipeOffset(-50, 72, 0)).toBe(0);
    });
});

describe('resolveSwipeRelease', () => {
    it('opens the side once the release is past half its width', () => {
        expect(resolveSwipeRelease(36, 72, 0)).toBe('leading');
        expect(resolveSwipeRelease(-72, 0, 144)).toBe('trailing');
    });

    it('closes short of half', () => {
        expect(resolveSwipeRelease(35, 72, 0)).toBeNull();
        expect(resolveSwipeRelease(-71, 0, 144)).toBeNull();
        expect(resolveSwipeRelease(0, 72, 144)).toBeNull();
    });
});

describe('SwipeActionRow', () => {
    it('opens the trailing side on a left swipe past half its width', () => {
        const onOpenChange = jest.fn();
        render(<Harness trailing={[action('mute'), action('leave')]} onOpenChange={onOpenChange} />);

        act(() => drag(content(), -SWIPE_ACTION_WIDTH * 1.5));

        expect(onOpenChange).toHaveBeenLastCalledWith('trailing');
        expect(screen.getByRole('button', { name: 'leave' })).toHaveAttribute('tabindex', '0');
    });

    it('opens the leading side on a right swipe', () => {
        const onOpenChange = jest.fn();
        render(<Harness leading={[action('pin')]} onOpenChange={onOpenChange} />);

        act(() => drag(content(), SWIPE_ACTION_WIDTH));

        expect(onOpenChange).toHaveBeenLastCalledWith('leading');
    });

    it('stays closed when released short of half', () => {
        const onOpenChange = jest.fn();
        render(<Harness leading={[action('pin')]} onOpenChange={onOpenChange} />);

        act(() => drag(content(), 20));

        expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('leaves a mostly vertical touch to the scroll', () => {
        const onOpenChange = jest.fn();
        render(<Harness trailing={[action('leave')]} onOpenChange={onOpenChange} />);

        fireEvent.touchStart(content(), touch(0));
        const notCancelled = fireEvent.touchMove(content(), touch(-6, 30));
        fireEvent.touchMove(content(), touch(-200, 40));
        fireEvent.touchEnd(content(), { touches: [] });

        expect(notCancelled).toBe(true);
        expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('cancels the native move once it is a swipe, so the list does not scroll underneath', () => {
        render(<Harness trailing={[action('leave')]} />);

        fireEvent.touchStart(content(), touch(0));
        fireEvent.touchMove(content(), touch(-10));
        const notCancelled = fireEvent.touchMove(content(), touch(-40));

        expect(notCancelled).toBe(false);
    });

    it('reports a reveal once when the drag crosses the open point, not again on the way back', () => {
        const onReveal = jest.fn();
        render(<Harness trailing={[action('mute'), action('leave')]} onReveal={onReveal} />);

        act(() => {
            fireEvent.touchStart(content(), touch(0));
            fireEvent.touchMove(content(), touch(-10));
            fireEvent.touchMove(content(), touch(-10 - SWIPE_ACTION_WIDTH * 1.2));
            fireEvent.touchMove(content(), touch(-10 - SWIPE_ACTION_WIDTH * 1.5));
            fireEvent.touchMove(content(), touch(-10 - 20));
            fireEvent.touchEnd(content(), { touches: [] });
        });

        expect(onReveal).toHaveBeenCalledTimes(1);
        expect(onReveal).toHaveBeenCalledWith('trailing');
    });

    it('closes the row and then runs the action it was tapped for', () => {
        const onSelect = jest.fn();
        const onOpenChange = jest.fn();
        render(<Harness trailing={[action('leave', onSelect)]} initialOpen="trailing" onOpenChange={onOpenChange} />);

        fireEvent.click(screen.getByRole('button', { name: 'leave' }));

        expect(onOpenChange).toHaveBeenCalledWith(null);
        expect(onSelect).toHaveBeenCalledTimes(1);
    });

    it('closes on a tap on the content of an open row without passing the tap on', () => {
        const onContentClick = jest.fn();
        const onOpenChange = jest.fn();
        render(
            <Harness
                trailing={[action('leave')]}
                initialOpen="trailing"
                onOpenChange={onOpenChange}
                onContentClick={onContentClick}
            />
        );

        fireEvent.click(content());

        expect(onOpenChange).toHaveBeenCalledWith(null);
        expect(onContentClick).not.toHaveBeenCalled();
    });

    it('passes a tap on a closed row through', () => {
        const onContentClick = jest.fn();
        render(<Harness trailing={[action('leave')]} onContentClick={onContentClick} />);

        fireEvent.click(content());

        expect(onContentClick).toHaveBeenCalledTimes(1);
    });

    it('swallows the click that ends a swipe', () => {
        const onContentClick = jest.fn();
        render(<Harness trailing={[action('leave')]} onContentClick={onContentClick} />);

        act(() => drag(content(), -SWIPE_ACTION_WIDTH));
        fireEvent.click(content());

        expect(onContentClick).not.toHaveBeenCalled();
    });

    it('closes on a touch elsewhere and swallows the click that touch becomes', () => {
        const onOpenChange = jest.fn();
        const onOutsideClick = jest.fn();
        render(<Harness trailing={[action('leave')]} initialOpen="trailing" onOpenChange={onOpenChange} />);
        const outside = screen.getByTestId('outside');
        outside.addEventListener('click', onOutsideClick);

        act(() => {
            fireEvent.touchStart(outside, touch(0));
        });
        fireEvent.click(outside);

        expect(onOpenChange).toHaveBeenCalledWith(null);
        expect(onOutsideClick).not.toHaveBeenCalled();
    });

    it('closes an open row when a scroll starts on it', () => {
        const onOpenChange = jest.fn();
        render(<Harness trailing={[action('leave')]} initialOpen="trailing" onOpenChange={onOpenChange} />);

        act(() => {
            fireEvent.touchStart(content(), touch(0));
            fireEvent.touchMove(content(), touch(0, 30));
        });

        expect(onOpenChange).toHaveBeenCalledWith(null);
    });

    it('keeps the actions of a closed side out of the tab order and the accessibility tree', () => {
        render(<Harness leading={[action('pin')]} trailing={[action('leave')]} initialOpen="leading" />);

        expect(screen.getByRole('button', { name: 'pin' })).toHaveAttribute('tabindex', '0');
        expect(screen.queryByRole('button', { name: 'leave' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'leave', hidden: true })).toHaveAttribute('tabindex', '-1');
    });

    it('holds back a sideways-leaning move still inside the slop, so WebKit cannot start a pan', () => {
        render(<Harness trailing={[action('leave')]} />);

        fireEvent.touchStart(content(), touch(0));
        const notCancelled = fireEvent.touchMove(content(), touch(-3, 1));

        expect(notCancelled).toBe(false);
    });

    it('closes on a tap that comes right after the swipe that opened it', () => {
        const onOpenChange = jest.fn();
        render(<Harness trailing={[action('leave')]} onOpenChange={onOpenChange} />);

        act(() => drag(content(), -SWIPE_ACTION_WIDTH));
        expect(onOpenChange).toHaveBeenLastCalledWith('trailing');
        // Well inside the click-swallow window of the swipe, but a touch of its own.
        fireEvent.touchStart(content(), touch(0));
        fireEvent.touchEnd(content(), { touches: [] });
        fireEvent.click(content());

        expect(onOpenChange).toHaveBeenLastCalledWith(null);
    });

    it('leaves a touch the surrounding pull-to-refresh already claimed', () => {
        const onOpenChange = jest.fn();
        render(
            <PullToRefresh data-testid="list" onRefresh={jest.fn()}>
                <SwipeActionRow trailingActions={[action('leave')]} onOpenChange={onOpenChange}>
                    <span>content</span>
                </SwipeActionRow>
            </PullToRefresh>
        );
        const row = screen.getByText('content');

        act(() => {
            fireEvent.touchStart(row, touch(0));
            // Leans down at the slop, so the pull takes it...
            fireEvent.touchMove(row, touch(2, 6));
            // ...and a move that now leans sideways must not start a swipe on top of it.
            fireEvent.touchMove(row, touch(10, 7));
            fireEvent.touchMove(row, touch(-80, 8));
            fireEvent.touchEnd(row, { touches: [] });
        });

        expect(onOpenChange).not.toHaveBeenCalled();
        expect(row.parentElement).not.toHaveAttribute('style');
    });

    it('does nothing when disabled', () => {
        const onOpenChange = jest.fn();
        render(
            <SwipeActionRow trailingActions={[action('leave')]} onOpenChange={onOpenChange} disabled>
                <span>content</span>
            </SwipeActionRow>
        );

        act(() => drag(screen.getByText('content'), -SWIPE_ACTION_WIDTH));

        expect(onOpenChange).not.toHaveBeenCalled();
    });
});
