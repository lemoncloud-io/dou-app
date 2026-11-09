import '@testing-library/jest-dom';

import { act, fireEvent, render, screen } from '@testing-library/react';

// The `emoji` namespace answers with a fixed name table; every other key comes back as itself.
const EMOJI_NAMES: Record<string, string> = { '😀': 'grinning face' };
jest.mock('react-i18next', () => ({
    useTranslation: (ns?: string) => ({
        t: (key: string, options?: { defaultValue?: string }) =>
            ns === 'emoji' ? (EMOJI_NAMES[key] ?? options?.defaultValue ?? key) : key,
        i18n: { language: 'en' },
    }),
}));

import { EmojiPickerSheet, clampBubbleLeft } from './EmojiPickerSheet';
import { useRecentEmojiStore } from '../stores/useRecentEmojiStore';
import { LONG_PRESS_DELAY_MS, MOVE_CANCEL_PX } from '../utils/longPress';

const renderSheet = (open = true, onPick = jest.fn()) =>
    render(<EmojiPickerSheet open={open} onOpenChange={jest.fn()} onPick={onPick} />);

const setup = () => {
    const onPick = jest.fn();
    const view = renderSheet(true, onPick);
    return { onPick, view, emoji: screen.getByRole('button', { name: 'grinning face' }) };
};

const bubble = () => screen.queryByTestId('emoji-name-bubble');
// A pointer click carries a click count; a keyboard or switch-control activation carries 0.
const tap = (element: HTMLElement) => fireEvent.click(element, { detail: 1 });
// jsdom has no PointerEvent, so testing-library builds a plain Event and drops the coordinates
// off the init; they have to be hung on the native event by hand.
const pointerAt = (element: HTMLElement, type: 'pointerdown' | 'pointermove', x: number, y: number) =>
    fireEvent(element, Object.assign(new Event(type, { bubbles: true }), { clientX: x, clientY: y }));
const hold = (element: HTMLElement) => {
    pointerAt(element, 'pointerdown', 100, 100);
    act(() => jest.advanceTimersByTime(LONG_PRESS_DELAY_MS));
};

beforeEach(() => {
    jest.useFakeTimers();
    useRecentEmojiStore.setState({ recent: [] });
});

afterEach(() => {
    jest.useRealTimers();
});

describe('EmojiPickerSheet — emoji names on long press', () => {
    it('labels each emoji with its name for assistive tech', () => {
        setup();
        expect(screen.getByRole('button', { name: 'grinning face' })).toHaveTextContent('😀');
    });

    it('a tap picks the emoji and shows no name', () => {
        const { onPick, emoji } = setup();

        fireEvent.pointerDown(emoji);
        fireEvent.pointerUp(emoji);
        tap(emoji);

        expect(onPick).toHaveBeenCalledWith('😀');
        expect(bubble()).not.toBeInTheDocument();
    });

    it('holding shows the name, and letting go hides it without picking', () => {
        const { onPick, emoji } = setup();

        hold(emoji);
        expect(bubble()).toHaveTextContent('grinning face');

        fireEvent.pointerUp(emoji);
        tap(emoji);

        expect(bubble()).not.toBeInTheDocument();
        expect(onPick).not.toHaveBeenCalled();
    });

    it('a hold cancelled by the browser shows nothing', () => {
        const { emoji } = setup();

        fireEvent.pointerDown(emoji);
        fireEvent.pointerCancel(emoji);
        act(() => jest.advanceTimersByTime(LONG_PRESS_DELAY_MS));

        expect(bubble()).not.toBeInTheDocument();
    });

    // The pointer stays captured during a scroll, so drift is the only sign of one.
    it('a press that drifts like a scroll shows nothing', () => {
        const { emoji } = setup();

        pointerAt(emoji, 'pointerdown', 100, 100);
        pointerAt(emoji, 'pointermove', 100, 100 + MOVE_CANCEL_PX + 1);
        act(() => jest.advanceTimersByTime(LONG_PRESS_DELAY_MS));

        expect(bubble()).not.toBeInTheDocument();
    });

    it('a fingertip wobble within the threshold still counts as a hold', () => {
        const { emoji } = setup();

        pointerAt(emoji, 'pointerdown', 100, 100);
        pointerAt(emoji, 'pointermove', 100 + MOVE_CANCEL_PX, 100);
        act(() => jest.advanceTimersByTime(LONG_PRESS_DELAY_MS));

        expect(bubble()).toBeInTheDocument();
    });

    it("the OS long press names the emoji at once, before the app's own timer", () => {
        const { onPick, emoji } = setup();

        fireEvent.pointerDown(emoji);
        const notPrevented = fireEvent.contextMenu(emoji);

        expect(notPrevented).toBe(false);
        expect(bubble()).toHaveTextContent('grinning face');
        fireEvent.pointerUp(emoji);
        tap(emoji);
        expect(onPick).not.toHaveBeenCalled();
    });

    it('the next tap after a hold picks again', () => {
        const { onPick, emoji } = setup();

        hold(emoji);
        fireEvent.pointerUp(emoji);
        tap(emoji);

        fireEvent.pointerDown(emoji);
        fireEvent.pointerUp(emoji);
        tap(emoji);

        expect(onPick).toHaveBeenCalledTimes(1);
    });

    it('a keyboard activation picks even after a hold that ended without a click', () => {
        const { onPick, emoji } = setup();

        hold(emoji);
        fireEvent.pointerCancel(emoji);
        fireEvent.click(emoji, { detail: 0 });

        expect(onPick).toHaveBeenCalledWith('😀');
    });

    it('closing the sheet mid-hold does not bring the name back on reopen', () => {
        const { emoji, view } = setup();

        hold(emoji);
        view.rerender(<EmojiPickerSheet open={false} onOpenChange={jest.fn()} onPick={jest.fn()} />);
        view.rerender(<EmojiPickerSheet open onOpenChange={jest.fn()} onPick={jest.fn()} />);

        expect(bubble()).not.toBeInTheDocument();
    });

    it('holding an emoji with no name shows nothing and still lets a release pick', () => {
        const onPick = jest.fn();
        renderSheet(true, onPick);
        // Named only in the test table above, so this one has no name.
        const unnamed = screen.getByText('😃');

        hold(unnamed);
        fireEvent.pointerUp(unnamed);
        tap(unnamed);

        expect(bubble()).not.toBeInTheDocument();
        expect(onPick).toHaveBeenCalledWith('😃');
    });
});

describe('clampBubbleLeft', () => {
    it('centres the bubble on the emoji when it fits', () => {
        expect(clampBubbleLeft(200, 100, 400)).toBe(150);
    });

    it('keeps a bubble over the first column inside the left margin', () => {
        expect(clampBubbleLeft(20, 100, 400)).toBe(8);
    });

    it('keeps a bubble over the last column inside the right margin', () => {
        expect(clampBubbleLeft(390, 100, 400)).toBe(292);
    });
});
