import type * as React from 'react';

/**
 * What the full-screen photo screens share — `MediaViewer` and `PhotoEditor`: how they slide in, how
 * they tell their own events from ones bubbling out of a portal, and how a sideways drag turns their
 * pager. Kit-internal: in neither barrel, since it is the shell's behaviour and not a component.
 *
 * Kept in one place so the two screens cannot drift apart: a swipe that turns the viewer's page
 * should turn the editor's the same way, and both should rise like every other sheet.
 */

/**
 * Timing of the slide in and out, the settle after a short pull and the backdrop fade. The curve is
 * the app's slide-up dialog's, so the screen moves like every other sheet that rises from the bottom.
 *
 * The duration is set twice on purpose. `duration-300` times the settle (a transition), but it loses
 * to the 150ms `data-[state=…]:animate-in`/`animate-out` carry for the slide: an attribute selector
 * outranks a bare class. The `data-[state=…]:` copies match that and win; reduced motion is scoped
 * the same way for the same reason. A scale value, not an arbitrary one, because only the scale
 * utility reaches `animation-duration` at all.
 */
export const VIEWER_MOTION = [
    'duration-300 data-[state=open]:duration-300 data-[state=closed]:duration-300',
    // Spelled as properties: an arbitrary `ease` value is claimed by both Tailwind and
    // tailwindcss-animate, and a class that matches two utilities emits no rule at all.
    '[animation-timing-function:cubic-bezier(0.32,0.72,0,1)] [transition-timing-function:cubic-bezier(0.32,0.72,0,1)]',
    'motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none motion-reduce:transition-none',
].join(' ');

/**
 * Whether an event happened in the screen's own DOM. React events bubble through portals, so a sheet a
 * host opens from its buttons is inside the screen for React though it is drawn elsewhere — a drag or
 * an arrow key on it must not turn the page behind it.
 */
export const isOwnEvent = (event: React.SyntheticEvent) => event.currentTarget.contains(event.target as Node);

/** How far a drag has to travel before it is read as a swipe or a scroll rather than a tap. */
export const DRAG_SLOP_PX = 8;
/** A release past this — or past a fifth of the width, whichever is more — turns the page. */
export const SWIPE_MIN_PX = 48;
/** A quick flick turns the page with less travel. */
export const FLICK_MAX_MS = 300;
export const FLICK_MIN_PX = 24;
/** Past the first or last item the strip gives only a little, to show there is nothing more. */
export const EDGE_RESISTANCE = 0.3;

/**
 * How far the pager strip follows a sideways drag of `dx` px: all the way while there is a page to go
 * to, a fraction of it past either end.
 */
export const pagerDragOffset = (dx: number, hasPrevious: boolean, hasNext: boolean): number => {
    const pastEdge = (dx > 0 && !hasPrevious) || (dx < 0 && !hasNext);
    return pastEdge ? dx * EDGE_RESISTANCE : dx;
};

/**
 * Which way a sideways drag released `dx` px from where it started, `elapsedMs` after it, turns a
 * pager `width` px wide: `1` to the next page (a drag to the left), `-1` to the previous, `0` to stay.
 * The caller still stops at the ends.
 */
export const pagerReleaseStep = (dx: number, elapsedMs: number, width: number): -1 | 0 | 1 => {
    const far = Math.abs(dx) >= Math.max(SWIPE_MIN_PX, width * 0.2);
    const flick = elapsedMs <= FLICK_MAX_MS && Math.abs(dx) >= FLICK_MIN_PX;
    if (!far && !flick) return 0;
    return dx < 0 ? 1 : -1;
};
