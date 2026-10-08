import * as React from 'react';

/**
 * Something that slides into its resting place and back out: `AttachPanel` and the photo grid's footer
 * (up from below, on `transform`), and the picked-photo and recent-photo strips (open from nothing, on
 * `height`). The hook is kit-internal — it is how those move, not a component. The slide's timing is
 * not: `SLIDE_MS`, `slideEase` and `prefersReducedMotion` are in the overlay barrel, for a host that
 * moves `AttachPanel` itself and has to move something of its own on the very same frames.
 *
 * A CSS transition, not the `animate-in`/`animate-out` keyframes the Radix overlays use: a keyframe
 * always plays from its first frame, so a panel closed halfway up would jump to its resting place before
 * sliding down. A transition turns around from wherever the panel is.
 */

/** How long a slide takes. */
export const SLIDE_MS = 300;

/**
 * The slide's duration and curve, without a property list — for an element whose transition carries
 * something other than `transform` (a height, a width). The curve is the full-screen photo screens'
 * (`VIEWER_MOTION`) so everything that rises, opens or slides moves alike.
 *
 * The curve is spelled as a property: an arbitrary `ease-[…]` value is claimed by both Tailwind and
 * tailwindcss-animate, and a class two utilities claim emits no rule at all. Reduced motion drops the
 * transition, so the element is simply there, or gone.
 */
export const SLIDE_TIMING =
    'duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none';

/**
 * The slide's timing, on an element whose translate the caller switches between below its place
 * (`translate-y-full`, or further where a safe area under it would still show its top) and in place
 * (`translate-y-0`).
 */
export const SLIDE_MOTION = `transition-transform ${SLIDE_TIMING}`;

/**
 * How long a change may wait for its `transitionend` before it is taken as over anyway. A document that
 * is not being drawn (a hidden tab) runs no transition, so the event never comes.
 */
export const SLIDE_FALLBACK_MS = SLIDE_MS + 100;

/**
 * The slide's curve as a function of progress (0…1), for motion CSS cannot carry: a scroll position,
 * moved alongside a width that a transition is growing on the same curve, and a host's own frame loop
 * that moves `AttachPanel` (`motion="external"`) together with its composer.
 */
export const slideEase = (progress: number): number => {
    if (progress <= 0) return 0;
    if (progress >= 1) return 1;
    // cubic-bezier(0.32, 0.72, 0, 1). Its x(t) only rises, so halving finds the t whose x is the
    // progress; 30 halvings leave an error far below a pixel.
    const at = (t: number, p1: number, p2: number) =>
        3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t;
    let low = 0;
    let high = 1;
    let t = progress;
    for (let i = 0; i < 30; i += 1) {
        t = (low + high) / 2;
        if (at(t, 0.32, 0) < progress) low = t;
        else high = t;
    }
    return at(t, 0.72, 1);
};

/**
 * Whether the reader asked for less motion. Checked per change rather than left to
 * `motion-reduce:transition-none` alone: with no transition there is no `transitionend` either, and
 * what waits for one — an exit's removal, a host's held offset — should not wait for the fallback.
 */
export const prefersReducedMotion = (): boolean =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/** `slide`: moves over `SLIDE_MS`. `instant`: is simply there, or gone, with no transition at all. */
export type SlideMode = 'slide' | 'instant';

/**
 * What moves the element through a slide. `self`: its own CSS transition. `external`: the caller, which
 * writes the element's position itself on every frame of a loop of its own.
 */
export type SlideMotion = 'self' | 'external';

/** Where a change leaves the element. */
export type SlideState = 'open' | 'closed';

export interface SlidePresenceOptions {
    /** How it arrives when `open` turns true. Default `slide`. */
    enter?: SlideMode;
    /** How it leaves when `open` turns false. Default `slide`. */
    exit?: SlideMode;
    /**
     * The property whose transition is the slide: its end is the end of the change. Default `transform`.
     * Moved `external`ly, the property the caller writes inline.
     */
    property?: string;
    /**
     * What moves it through a slide. Default `self`: a transition on `property`, whose `transitionend`
     * ends the change. `external`: the caller, frame by frame, writing `property` inline — see
     * `SlidePresence.finish`. Instant changes are the same either way.
     */
    motion?: SlideMotion;
    /**
     * Called once a change has settled: when its slide has ended, at once for an instant one. Once per
     * change — a change overtaken by the next one never reports — and never for the state the element
     * mounted in, which was not a change.
     */
    onSettled?: (state: SlideState) => void;
}

export interface SlidePresence<T extends HTMLElement> {
    /** Whether the element is in the DOM: from the moment `open` turns on until its exit has played. */
    mounted: boolean;
    /** In place (`true`) or out of it (`false`) — what the translate or height follows. */
    shown: boolean;
    /**
     * The change under way runs with no transition: the caller draws the element with
     * `transition-none` instead of its motion classes for as long as this holds.
     */
    instant: boolean;
    /** Goes on the element that slides. */
    ref: React.RefObject<T | null>;
    /**
     * Goes on the same element: a change is over when its transition on `property` ends. Ignored for an
     * `external` mover, whose slide is over when it says so.
     */
    onTransitionEnd: (event: React.TransitionEvent<T>) => void;
    /**
     * `external` only: the caller's slide toward the current `open` has reached its end. It does what a
     * transition's end does — a closed element leaves the page, and `onSettled` reports the change — and
     * it moves the element's resting class to where it now is. Does nothing while no change is waiting
     * (an instant one has already settled, or the fallback got there first) and for a `self` mover.
     */
    finish: () => void;
}

/**
 * The mount and position state of a sliding element. Opening mounts it out of place, then moves it into
 * place on the next commit, so the move is a transition; closing moves it back out and unmounts it once
 * the move has ended. Reopened on its way out, it turns around from where it is.
 *
 * Open on its first render, it is in place at once: a sheet that opens with its footer already due
 * shows the footer as part of its own rise, rather than sliding it in a second time after.
 *
 * An `instant` change skips all of that. It puts the element in place, or removes it, in the very commit
 * that asks for it, and `instant` tells the caller to drop the transition for that commit — a slide
 * under way is cut where it stands rather than finished. The attach panel needs both: it appears in
 * place behind a keyboard that is about to slide away, and goes in place once a keyboard has covered it.
 * Under reduced motion every change is instant.
 *
 * Moved `external`ly, a slide has no transition: the caller writes the element's position inline on
 * every frame, and says when it is done (`finish`). The element mounts in the commit that opens it, so
 * the caller has it from the start, and `shown` — its resting class — stays where the last settled
 * change left it until the caller finishes: a frame the caller has not drawn yet shows the slide's
 * first frame, never its last. The caller's inline position is left alone, except by an instant change,
 * which clears it: in place means in place, whatever the last frame said.
 */
export const useSlidePresence = <T extends HTMLElement>(
    open: boolean,
    { enter = 'slide', exit = 'slide', property = 'transform', motion = 'self', onSettled }: SlidePresenceOptions = {}
): SlidePresence<T> => {
    const ref = React.useRef<T | null>(null);
    const [mountedState, setMounted] = React.useState(open);
    const [shownState, setShown] = React.useState(open);

    const external = motion === 'external';
    const reduced = prefersReducedMotion();
    const enterInstant = enter === 'instant' || reduced;
    const exitInstant = exit === 'instant' || reduced;
    // Derived in render rather than waiting for the effect below to catch the state up: an instant
    // change must be right in the commit that asks for it, or the commit in between is a slide's start.
    // An external mover needs the element in that commit too, to draw the slide's first frame on it.
    const instant = open ? enterInstant : exitInstant;
    const mounted = open ? mountedState || enterInstant || external : mountedState && !exitInstant;
    const shown = open ? enterInstant || shownState : external && shownState;

    // The change waiting for its end, if any. A ref: it is bookkeeping, never drawn.
    const pending = React.useRef<SlideState | null>(null);
    const settledRef = React.useRef(onSettled);
    settledRef.current = onSettled;
    const externalRef = React.useRef(external);
    externalRef.current = external;
    const propertyRef = React.useRef(property);
    propertyRef.current = property;
    const settle = React.useCallback((state: SlideState) => {
        if (pending.current !== state) return;
        pending.current = null;
        settledRef.current?.(state);
    }, []);
    // A slide that has reached its end, however that was learned. An external mover's element only now
    // takes its resting class: until here it held the slide's start.
    const land = React.useCallback(
        (state: SlideState) => {
            if (pending.current !== state) return;
            if (state === 'closed') setMounted(false);
            if (externalRef.current) setShown(state === 'open');
            settle(state);
        },
        [settle]
    );

    React.useLayoutEffect(() => {
        if (!open) {
            // An external mover takes it down from where the last change left it.
            if (!external || exitInstant) setShown(false);
            if (exitInstant) {
                setMounted(false);
                // Turned instant on its way out: the element is gone now, and so is the slide it was in.
                settle('closed');
            }
            return;
        }
        if (enterInstant) {
            setMounted(true);
            setShown(true);
            return;
        }
        if (!mountedState) {
            setMounted(true);
            return;
        }
        // An external mover brings it in; it rests in place once that is finished.
        if (external || shownState) return;
        // Reading layout commits the position the element was drawn at — out of place, or wherever an
        // exit had carried it — as the style the transition starts from. Without it the browser sees
        // only the final position and the element appears there without moving.
        ref.current?.getBoundingClientRect();
        setShown(true);
    }, [open, external, enterInstant, exitInstant, mountedState, shownState, settle]);

    // One entry per change of `open`. Read through a ref so a change of mode alone starts nothing. A
    // layout effect, so that a change is waiting before anything else in its commit — a host finishing
    // a slide that has nowhere to go — can say it is over.
    const instantRef = React.useRef(instant);
    instantRef.current = instant;
    const lastOpen = React.useRef(open);
    React.useLayoutEffect(() => {
        if (lastOpen.current === open) return undefined;
        lastOpen.current = open;
        const state: SlideState = open ? 'open' : 'closed';
        pending.current = state;
        if (instantRef.current) {
            // Whatever an external mover last drew — a slide this change cut short — goes with it.
            if (externalRef.current) ref.current?.style.removeProperty(propertyRef.current);
            settle(state);
            return undefined;
        }
        const timer = window.setTimeout(() => land(state), SLIDE_FALLBACK_MS);
        return () => window.clearTimeout(timer);
    }, [open, settle, land]);

    const onTransitionEnd = (event: React.TransitionEvent<T>) => {
        // A transition inside the element (a tile fading in) bubbles here too. Moved externally, the
        // element runs no slide transition of its own: whatever ends, it is not the slide.
        if (external || event.target !== event.currentTarget || event.propertyName !== property) return;
        if (!open) setMounted(false);
        settle(open ? 'open' : 'closed');
    };

    const finish = React.useCallback(() => {
        const state = pending.current;
        if (externalRef.current && state !== null) land(state);
    }, [land]);

    return { mounted, shown, instant, ref, onTransitionEnd, finish };
};
