import { act, render, screen } from '@testing-library/react';
import * as React from 'react';

import { SLIDE_MS, slideEase, useSlidePresence, type SlidePresenceOptions } from './slidePresence';

/** jsdom has no `TransitionEvent`; React reads `propertyName` off whatever event arrives. */
const transitionEnd = (element: Element, propertyName: string) => {
    const event = new Event('transitionend', { bubbles: true });
    Object.defineProperty(event, 'propertyName', { value: propertyName });
    act(() => {
        element.dispatchEvent(event);
    });
};

const Panel = ({ open, ...options }: { open: boolean } & SlidePresenceOptions) => {
    const { mounted, shown, instant, ref, onTransitionEnd } = useSlidePresence<HTMLDivElement>(open, options);
    if (!mounted) return null;
    return (
        <div ref={ref} data-testid="panel" data-shown={shown} data-instant={instant} onTransitionEnd={onTransitionEnd}>
            <span data-testid="child" />
        </div>
    );
};

/** Records the layout reads that happen while the panel is out of place: each one is a slide's start. */
const recordSlideStarts = () => {
    const starts: (string | null)[] = [];
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        starts.push(this.getAttribute('data-shown'));
        return new DOMRect();
    });
    return starts;
};

/**
 * What the panel looked like in the commit that changed `open`, read before the hook's own follow-up
 * render: a layout effect of a later sibling runs in that same commit. An instant change has to be right
 * there already — a commit drawn out of place in between is where a slide would start.
 */
const firstCommit: { present: boolean; shown: string | null }[] = [];
const Probe = ({ open }: { open: boolean }) => {
    const seen = React.useRef(open);
    React.useLayoutEffect(() => {
        if (seen.current === open) return;
        seen.current = open;
        const element = screen.queryByTestId('panel');
        firstCommit.push({ present: element !== null, shown: element?.getAttribute('data-shown') ?? null });
    }, [open]);
    return null;
};

const reduceMotion = () => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
};

const panel = () => screen.queryByTestId('panel');

describe('useSlidePresence', () => {
    const originalMatchMedia = window.matchMedia;
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
        window.matchMedia = originalMatchMedia;
    });

    it('is in place at once when it is open from the first render', () => {
        render(<Panel open />);

        expect(panel()).toHaveAttribute('data-shown', 'true');
    });

    it('draws nothing while closed', () => {
        render(<Panel open={false} />);

        expect(panel()).not.toBeInTheDocument();
    });

    // The transition needs a starting point: the panel has to be laid out below its place before it is
    // moved into it, or the browser only ever sees the end position and nothing slides.
    it('mounts below its place, has that laid out, then moves into place', () => {
        const seen: (string | null)[] = [];
        jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
            seen.push(this.getAttribute('data-shown'));
            return new DOMRect();
        });
        const { rerender } = render(<Panel open={false} />);

        rerender(<Panel open />);

        expect(seen).toEqual(['false']);
        expect(panel()).toHaveAttribute('data-shown', 'true');
    });

    it('stays mounted below its place on close until its transform transition ends', () => {
        const { rerender } = render(<Panel open />);

        rerender(<Panel open={false} />);
        expect(panel()).toHaveAttribute('data-shown', 'false');

        // Neither another property nor a transition inside it ends the exit.
        transitionEnd(panel() as HTMLElement, 'opacity');
        transitionEnd(screen.getByTestId('child'), 'transform');
        expect(panel()).toBeInTheDocument();

        transitionEnd(panel() as HTMLElement, 'transform');
        expect(panel()).not.toBeInTheDocument();
    });

    // Reduced motion runs no transition, so no transitionend ever comes.
    it('unmounts after the slide’s length when the transition never reports its end', () => {
        const { rerender } = render(<Panel open />);

        rerender(<Panel open={false} />);
        act(() => jest.advanceTimersByTime(SLIDE_MS));
        expect(panel()).toBeInTheDocument();

        act(() => jest.advanceTimersByTime(100));
        expect(panel()).not.toBeInTheDocument();
    });

    it('turns around when reopened on its way out, and is not removed by the exit it abandoned', () => {
        const { rerender } = render(<Panel open />);

        rerender(<Panel open={false} />);
        rerender(<Panel open />);
        act(() => jest.advanceTimersByTime(SLIDE_MS * 2));

        expect(panel()).toHaveAttribute('data-shown', 'true');
        transitionEnd(panel() as HTMLElement, 'transform');
        expect(panel()).toBeInTheDocument();
    });

    // The slide's height, not its transform: the picked strip opens and closes this way.
    it('ends an exit on the property it was told to watch', () => {
        const { rerender } = render(<Panel open property="height" />);

        rerender(<Panel open={false} property="height" />);
        transitionEnd(panel() as HTMLElement, 'transform');
        expect(panel()).toBeInTheDocument();

        transitionEnd(panel() as HTMLElement, 'height');
        expect(panel()).not.toBeInTheDocument();
    });

    describe('instant changes', () => {
        // The attach panel under a keyboard that is about to slide away: it must already be in place.
        it('enters in place in the commit that opens it, with no slide started', () => {
            const starts = recordSlideStarts();
            const { rerender } = render(<Panel open={false} enter="instant" />);

            rerender(<Panel open enter="instant" />);

            expect(panel()).toHaveAttribute('data-shown', 'true');
            expect(panel()).toHaveAttribute('data-instant', 'true');
            expect(starts).toEqual([]);
        });

        it('is already in place, and already gone, in the very commits that ask for it', () => {
            firstCommit.length = 0;
            const at = (open: boolean, options: SlidePresenceOptions) => (
                <>
                    <Panel open={open} {...options} />
                    <Probe open={open} />
                </>
            );
            const { rerender } = render(at(true, {}));
            rerender(at(false, {}));

            // Turned around from the middle of an exit, and then closed where it stands.
            rerender(at(true, { enter: 'instant' }));
            rerender(at(false, { exit: 'instant' }));

            expect(firstCommit).toEqual([
                { present: true, shown: 'false' },
                { present: true, shown: 'true' },
                { present: false, shown: null },
            ]);
        });

        it('jumps into place from the middle of an exit instead of turning around', () => {
            const { rerender } = render(<Panel open />);
            rerender(<Panel open={false} />);
            expect(panel()).toHaveAttribute('data-instant', 'false');

            rerender(<Panel open enter="instant" />);

            expect(panel()).toHaveAttribute('data-shown', 'true');
            expect(panel()).toHaveAttribute('data-instant', 'true');
        });

        // The attach panel once the keyboard has covered it: there is nothing left to watch go.
        it('is gone in the commit that closes it', () => {
            const { rerender } = render(<Panel open exit="instant" />);

            rerender(<Panel open={false} exit="instant" />);

            expect(panel()).not.toBeInTheDocument();
        });

        it('is gone at once when an exit already under way turns instant', () => {
            const onSettled = jest.fn();
            const { rerender } = render(<Panel open onSettled={onSettled} />);
            rerender(<Panel open={false} onSettled={onSettled} />);
            expect(panel()).toBeInTheDocument();

            rerender(<Panel open={false} exit="instant" onSettled={onSettled} />);

            expect(panel()).not.toBeInTheDocument();
            expect(onSettled).toHaveBeenCalledTimes(1);
            expect(onSettled).toHaveBeenCalledWith('closed');
            act(() => jest.advanceTimersByTime(SLIDE_MS * 2));
            expect(onSettled).toHaveBeenCalledTimes(1);
        });

        // The mode is read per change: setting it while nothing moves must not move anything.
        it('keeps an open panel where it is when only the mode changes', () => {
            const onSettled = jest.fn();
            const { rerender } = render(<Panel open enter="instant" onSettled={onSettled} />);

            rerender(<Panel open enter="slide" onSettled={onSettled} />);

            expect(panel()).toHaveAttribute('data-shown', 'true');
            expect(panel()).toHaveAttribute('data-instant', 'false');
            expect(onSettled).not.toHaveBeenCalled();
        });

        it('treats every change as instant for a reader who asked for less motion', () => {
            reduceMotion();
            const onSettled = jest.fn();
            const { rerender } = render(<Panel open={false} onSettled={onSettled} />);

            rerender(<Panel open onSettled={onSettled} />);
            expect(panel()).toHaveAttribute('data-shown', 'true');
            expect(onSettled).toHaveBeenLastCalledWith('open');

            rerender(<Panel open={false} onSettled={onSettled} />);
            expect(panel()).not.toBeInTheDocument();
            expect(onSettled).toHaveBeenLastCalledWith('closed');
            expect(onSettled).toHaveBeenCalledTimes(2);
        });
    });

    describe('settling', () => {
        it('reports an open slide once, when its transform transition ends', () => {
            const onSettled = jest.fn();
            const { rerender } = render(<Panel open={false} onSettled={onSettled} />);

            rerender(<Panel open onSettled={onSettled} />);
            transitionEnd(screen.getByTestId('child'), 'transform');
            transitionEnd(panel() as HTMLElement, 'opacity');
            expect(onSettled).not.toHaveBeenCalled();

            transitionEnd(panel() as HTMLElement, 'transform');
            expect(onSettled).toHaveBeenCalledTimes(1);
            expect(onSettled).toHaveBeenCalledWith('open');

            // Neither a second end nor the fallback reports it again.
            transitionEnd(panel() as HTMLElement, 'transform');
            act(() => jest.advanceTimersByTime(SLIDE_MS * 2));
            expect(onSettled).toHaveBeenCalledTimes(1);
        });

        it('reports a close slide once, as the panel leaves the page', () => {
            const onSettled = jest.fn();
            const { rerender } = render(<Panel open onSettled={onSettled} />);

            rerender(<Panel open={false} onSettled={onSettled} />);
            expect(onSettled).not.toHaveBeenCalled();

            transitionEnd(panel() as HTMLElement, 'transform');
            expect(panel()).not.toBeInTheDocument();
            expect(onSettled).toHaveBeenCalledTimes(1);
            expect(onSettled).toHaveBeenCalledWith('closed');
        });

        // A hidden tab runs no transition, so the end never comes; the host must not hold its offset forever.
        it('reports a slide whose end never comes once its length has passed', () => {
            const onSettled = jest.fn();
            const { rerender } = render(<Panel open={false} onSettled={onSettled} />);

            rerender(<Panel open onSettled={onSettled} />);
            act(() => jest.advanceTimersByTime(SLIDE_MS));
            expect(onSettled).not.toHaveBeenCalled();

            act(() => jest.advanceTimersByTime(100));
            expect(onSettled).toHaveBeenCalledWith('open');
        });

        it('reports an instant change right after the commit that made it', () => {
            const onSettled = jest.fn();
            const { rerender } = render(<Panel open={false} onSettled={onSettled} />);

            rerender(<Panel open enter="instant" onSettled={onSettled} />);
            expect(onSettled).toHaveBeenCalledWith('open');

            rerender(<Panel open={false} exit="instant" onSettled={onSettled} />);
            expect(onSettled).toHaveBeenLastCalledWith('closed');
            expect(onSettled).toHaveBeenCalledTimes(2);
        });

        it('does not report a change the next one overtook', () => {
            const onSettled = jest.fn();
            const { rerender } = render(<Panel open onSettled={onSettled} />);

            rerender(<Panel open={false} onSettled={onSettled} />);
            rerender(<Panel open onSettled={onSettled} />);
            act(() => jest.advanceTimersByTime(SLIDE_MS * 2));

            expect(onSettled).toHaveBeenCalledTimes(1);
            expect(onSettled).toHaveBeenCalledWith('open');
        });

        it('says nothing about the state it mounted in', () => {
            const onSettled = jest.fn();
            render(<Panel open onSettled={onSettled} />);
            act(() => jest.advanceTimersByTime(SLIDE_MS * 2));

            expect(onSettled).not.toHaveBeenCalled();
        });
    });
});

describe('slideEase', () => {
    it('starts at 0 and ends at 1, holding there past either end', () => {
        expect(slideEase(-1)).toBe(0);
        expect(slideEase(0)).toBe(0);
        expect(slideEase(1)).toBe(1);
        expect(slideEase(2)).toBe(1);
    });

    // cubic-bezier(0.32, 0.72, 0, 1): most of the way there early, then a long settle.
    it('follows the slide curve: well past halfway at half time, and never going back', () => {
        // Reference values solved independently (Newton's method on the same control points).
        expect(slideEase(0.25)).toBeCloseTo(0.779, 3);
        expect(slideEase(0.5)).toBeCloseTo(0.955, 3);
        const samples = Array.from({ length: 21 }, (_, i) => slideEase(i / 20));
        samples.slice(1).forEach((value, i) => expect(value).toBeGreaterThanOrEqual(samples[i]));
    });
});
