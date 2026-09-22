import { act, render, screen } from '@testing-library/react';

import { HeaderGlass } from './HeaderGlass';

/**
 * The component settles on a `requestAnimationFrame`, with a timer as the fallback for a hidden
 * document. jsdom runs neither on its own, so each test drives whichever one it is about.
 */
const flushFrame = () => act(() => void jest.advanceTimersByTime(0));

describe('HeaderGlass', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        // jsdom has no rAF under fake timers in this setup; route it through the timer queue so
        // `advanceTimersByTime` drives it the same way it drives the fallback.
        jest.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
            return setTimeout(() => cb(performance.now()), 0) as unknown as number;
        });
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    const warmup = () => screen.getByTestId('header-glass-warmup');
    const frost = () => screen.getByTestId('header-glass-frost');

    it('starts opaque and unfrosted so nothing behind the header shows through on the first frame', () => {
        render(<HeaderGlass />);

        expect(warmup().className).toContain('opacity-100');
        expect(frost().className).toContain('opacity-0');
    });

    it('crosses the two panes over once the first frame has been painted', () => {
        render(<HeaderGlass />);

        flushFrame();

        expect(warmup().className).toContain('opacity-0');
        expect(frost().className).toContain('opacity-100');
    });

    it('settles on the fallback timer when no frame ever arrives', () => {
        jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
        render(<HeaderGlass />);

        expect(frost().className).toContain('opacity-0');

        act(() => void jest.advanceTimersByTime(100));

        expect(frost().className).toContain('opacity-100');
    });

    it('paints the opaque pane before the frost so the frost is the upper layer', () => {
        const { container } = render(<HeaderGlass />);

        const panes = container.querySelectorAll('[aria-hidden]');
        expect(panes[0]).toBe(warmup());
        expect(panes[1]).toBe(frost());
    });

    it('keeps both panes out of the accessibility tree and out of hit testing', () => {
        render(<HeaderGlass />);

        for (const pane of [warmup(), frost()]) {
            expect(pane).toHaveAttribute('aria-hidden');
            expect(pane.className).toContain('pointer-events-none');
        }
    });

    it('applies the caller className to the frost pane only, which is the one it styles', () => {
        render(<HeaderGlass className="rounded-t-2xl" />);

        expect(frost().className).toContain('rounded-t-2xl');
        expect(warmup().className).not.toContain('rounded-t-2xl');
    });
});
