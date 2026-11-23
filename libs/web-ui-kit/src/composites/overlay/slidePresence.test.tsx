import { act, render, screen } from '@testing-library/react';
import * as React from 'react';

import * as kit from '@chatic/web-ui-kit';

import {
    prefersReducedMotion,
    SLIDE_FALLBACK_MS,
    SLIDE_MS,
    slideEase,
    useSlidePresence,
    type SlidePresenceOptions,
} from './slidePresence';

const transitionEnd = (element: Element, propertyName: string) => {
    const event = new Event('transitionend', { bubbles: true });
    Object.defineProperty(event, 'propertyName', { value: propertyName });
    act(() => {
        element.dispatchEvent(event);
    });
};

let finishSlide: () => void = () => undefined;

const Panel = ({ open, ...options }: { open: boolean } & SlidePresenceOptions) => {
    const { mounted, shown, instant, ref, onTransitionEnd, finish } = useSlidePresence<HTMLDivElement>(open, options);
    finishSlide = finish;
    if (!mounted) return null;
    return (
        <div ref={ref} data-testid="panel" data-shown={shown} data-instant={instant} onTransitionEnd={onTransitionEnd}>
            <span data-testid="child" />
        </div>
    );
};

const recordSlideStarts = () => {
    const starts: (string | null)[] = [];
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        starts.push(this.getAttribute('data-shown'));
        return new DOMRect();
    });
    return starts;
};

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

        transitionEnd(panel() as HTMLElement, 'opacity');
        transitionEnd(screen.getByTestId('child'), 'transform');
        expect(panel()).toBeInTheDocument();

        transitionEnd(panel() as HTMLElement, 'transform');
        expect(panel()).not.toBeInTheDocument();
    });

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

    it('ends an exit on the property it was told to watch', () => {
        const { rerender } = render(<Panel open property="height" />);

        rerender(<Panel open={false} property="height" />);
        transitionEnd(panel() as HTMLElement, 'transform');
        expect(panel()).toBeInTheDocument();

        transitionEnd(panel() as HTMLElement, 'height');
        expect(panel()).not.toBeInTheDocument();
    });

    describe('instant changes', () => {
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

describe('useSlidePresence moved externally', () => {
    const originalMatchMedia = window.matchMedia;
    const external = { motion: 'external' } as const;
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
        window.matchMedia = originalMatchMedia;
    });

    const finish = () => act(() => finishSlide());

    it('mounts below its place in the commit that opens it, and rests in place once the mover finishes', () => {
        firstCommit.length = 0;
        const starts = recordSlideStarts();
        const onSettled = jest.fn();
        const at = (open: boolean) => (
            <>
                <Panel open={open} {...external} onSettled={onSettled} />
                <Probe open={open} />
            </>
        );
        const { rerender } = render(at(false));

        rerender(at(true));

        expect(firstCommit).toEqual([{ present: true, shown: 'false' }]);
        expect(starts).toEqual([]);
        act(() => jest.advanceTimersByTime(SLIDE_MS));
        expect(panel()).toHaveAttribute('data-shown', 'false');
        expect(onSettled).not.toHaveBeenCalled();

        finish();
        expect(panel()).toHaveAttribute('data-shown', 'true');
        expect(onSettled.mock.calls).toEqual([['open']]);
    });

    it('stays where it was in the commit that closes it, and leaves the page once the mover finishes', () => {
        const onSettled = jest.fn();
        const { rerender } = render(<Panel open {...external} onSettled={onSettled} />);

        rerender(<Panel open={false} {...external} onSettled={onSettled} />);
        expect(panel()).toHaveAttribute('data-shown', 'true');
        transitionEnd(panel() as HTMLElement, 'transform');
        expect(panel()).toBeInTheDocument();

        finish();
        expect(panel()).not.toBeInTheDocument();
        expect(onSettled.mock.calls).toEqual([['closed']]);
    });

    it('reports only the change the mover finished, after turning around on its way out', () => {
        const onSettled = jest.fn();
        const { rerender } = render(<Panel open={false} {...external} onSettled={onSettled} />);
        rerender(<Panel open {...external} onSettled={onSettled} />);
        finish();

        rerender(<Panel open={false} {...external} onSettled={onSettled} />);
        rerender(<Panel open {...external} onSettled={onSettled} />);
        expect(panel()).toHaveAttribute('data-shown', 'true');
        finish();
        act(() => jest.advanceTimersByTime(SLIDE_FALLBACK_MS * 2));

        expect(panel()).toBeInTheDocument();
        expect(onSettled.mock.calls).toEqual([['open'], ['open']]);
    });

    it('starts the next opening from below once a close has finished', () => {
        const { rerender } = render(<Panel open {...external} />);
        rerender(<Panel open={false} {...external} />);
        finish();

        rerender(<Panel open {...external} />);

        expect(panel()).toHaveAttribute('data-shown', 'false');
    });

    it('does nothing when finished with no change waiting', () => {
        const onSettled = jest.fn();
        const { rerender } = render(<Panel open {...external} onSettled={onSettled} />);
        finish();
        expect(onSettled).not.toHaveBeenCalled();

        rerender(<Panel open={false} {...external} onSettled={onSettled} />);
        finish();
        finish();
        expect(onSettled.mock.calls).toEqual([['closed']]);
    });

    it('ignores finish when it moves itself', () => {
        const onSettled = jest.fn();
        const { rerender } = render(<Panel open onSettled={onSettled} />);
        rerender(<Panel open={false} onSettled={onSettled} />);

        finish();

        expect(panel()).toBeInTheDocument();
        expect(onSettled).not.toHaveBeenCalled();
    });

    it('settles a slide the mover never finishes once the slide’s length has passed', () => {
        const onSettled = jest.fn();
        const { rerender } = render(<Panel open={false} {...external} onSettled={onSettled} />);

        rerender(<Panel open {...external} onSettled={onSettled} />);
        act(() => jest.advanceTimersByTime(SLIDE_FALLBACK_MS));
        expect(panel()).toHaveAttribute('data-shown', 'true');

        rerender(<Panel open={false} {...external} onSettled={onSettled} />);
        act(() => jest.advanceTimersByTime(SLIDE_FALLBACK_MS));
        expect(panel()).not.toBeInTheDocument();
        expect(onSettled.mock.calls).toEqual([['open'], ['closed']]);
    });

    it('takes a finish from a host’s layout effect in the very commit that changes it', () => {
        const onSettled = jest.fn();
        const Host = ({ open }: { open: boolean }) => {
            const seen = React.useRef(open);
            React.useLayoutEffect(() => {
                if (seen.current === open) return;
                seen.current = open;
                finishSlide();
            }, [open]);
            return <Panel open={open} {...external} onSettled={onSettled} />;
        };
        const { rerender } = render(<Host open={false} />);

        rerender(<Host open />);

        expect(onSettled.mock.calls).toEqual([['open']]);
        expect(panel()).toHaveAttribute('data-shown', 'true');
    });

    it('clears what the mover last drew on an instant change, and is in place at once', () => {
        const onSettled = jest.fn();
        const { rerender } = render(<Panel open {...external} onSettled={onSettled} />);
        rerender(<Panel open={false} {...external} onSettled={onSettled} />);
        (panel() as HTMLElement).style.transform = 'translateY(40%)';

        rerender(<Panel open enter="instant" {...external} onSettled={onSettled} />);

        expect((panel() as HTMLElement).style.transform).toBe('');
        expect(panel()).toHaveAttribute('data-shown', 'true');
        expect(onSettled.mock.calls).toEqual([['open']]);
    });

    it('leaves what the mover draws alone through a slide', () => {
        const { rerender } = render(<Panel open {...external} />);
        rerender(<Panel open={false} {...external} />);
        (panel() as HTMLElement).style.transform = 'translateY(40%)';

        rerender(<Panel open {...external} />);
        expect((panel() as HTMLElement).style.transform).toBe('translateY(40%)');

        finish();
        expect((panel() as HTMLElement).style.transform).toBe('translateY(40%)');
    });

    it('is gone at once for an instant exit, as when it moves itself', () => {
        const onSettled = jest.fn();
        const { rerender } = render(<Panel open {...external} onSettled={onSettled} />);

        rerender(<Panel open={false} exit="instant" {...external} onSettled={onSettled} />);

        expect(panel()).not.toBeInTheDocument();
        expect(onSettled.mock.calls).toEqual([['closed']]);
    });

    it('treats every change as instant for a reader who asked for less motion', () => {
        reduceMotion();
        const onSettled = jest.fn();
        const { rerender } = render(<Panel open={false} {...external} onSettled={onSettled} />);

        rerender(<Panel open {...external} onSettled={onSettled} />);
        expect(panel()).toHaveAttribute('data-shown', 'true');

        rerender(<Panel open={false} {...external} onSettled={onSettled} />);
        expect(panel()).not.toBeInTheDocument();
        expect(onSettled.mock.calls).toEqual([['open'], ['closed']]);
    });
});

describe('the slide timing in the barrel', () => {
    const originalMatchMedia = window.matchMedia;
    afterEach(() => {
        window.matchMedia = originalMatchMedia;
    });

    it('is the timing the kit’s own slides use', () => {
        expect(kit.SLIDE_MS).toBe(SLIDE_MS);
        expect(kit.slideEase).toBe(slideEase);
        expect(kit.prefersReducedMotion).toBe(prefersReducedMotion);
        expect(kit.SLIDE_MS).toBe(300);
    });

    it('says whether the reader asked for less motion', () => {
        window.matchMedia = jest.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
        expect(kit.prefersReducedMotion()).toBe(false);
        expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');

        reduceMotion();
        expect(kit.prefersReducedMotion()).toBe(true);
    });
});

describe('slideEase', () => {
    it('starts at 0 and ends at 1, holding there past either end', () => {
        expect(slideEase(-1)).toBe(0);
        expect(slideEase(0)).toBe(0);
        expect(slideEase(1)).toBe(1);
        expect(slideEase(2)).toBe(1);
    });

    it('follows the slide curve: well past halfway at half time, and never going back', () => {
        expect(slideEase(0.25)).toBeCloseTo(0.779, 3);
        expect(slideEase(0.5)).toBeCloseTo(0.955, 3);
        const samples = Array.from({ length: 21 }, (_, i) => slideEase(i / 20));
        samples.slice(1).forEach((value, i) => expect(value).toBeGreaterThanOrEqual(samples[i]));
    });
});
