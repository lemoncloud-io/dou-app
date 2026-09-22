/**
 * The arithmetic behind dragging a bottom sheet away.
 *
 * Pure: no DOM, no React, no pointer events. A drag is three decisions — may it start, how far has
 * the panel moved, and does letting go dismiss it — and each is a function of numbers the caller
 * has already read. Keeping them here is what makes the thresholds arguable without standing a
 * sheet up and flicking at it.
 */

/**
 * How far down the panel must be dragged for a release to dismiss it, as a share of its own
 * height.
 *
 * A share and not a pixel count, because the sheets this serves range from a row of emoji to a
 * near-full-height form, and 100px is a flick on one and a committed pull on the other.
 */
export const DISMISS_DISTANCE_RATIO = 0.25;

/**
 * The flick escape hatch, in pixels per millisecond.
 *
 * Without it the only way out is to drag a quarter of the panel down, which is a long gesture on a
 * tall sheet and not what a quick downward flick means. With it, speed substitutes for distance:
 * 0.5 px/ms is roughly a 60px flick inside 120ms, fast enough that it cannot be reached by dragging
 * deliberately and stopping.
 */
export const DISMISS_VELOCITY_PX_PER_MS = 0.5;

/**
 * Whether a downward drag may take over from scrolling.
 *
 * Only at the very top of the body. Anywhere else the same gesture is the reader scrolling back up
 * through the content, and stealing it would make a long sheet impossible to read. This mirrors
 * what the platform sheets do, and it is the reason a sheet whose body does not scroll at all is
 * draggable from anywhere — its `scrollTop` is always 0.
 */
export const canStartDrag = (scrollTop: number): boolean => scrollTop <= 0;

/**
 * The panel's offset for a pointer that has moved `dy` from where it went down.
 *
 * Upward drag is dropped rather than resisted. A sheet has nowhere to go above its resting place —
 * it is already against the top of its own travel — so following the pointer up would open a gap
 * under it, and rubber-banding would imply there is something above to reveal.
 */
export const clampDragOffset = (dy: number): number => (dy > 0 ? dy : 0);

export interface DragRelease {
    /** How far down the panel was dragged, in pixels. Already clamped. */
    offset: number;
    /** Milliseconds between the last two pointer samples. */
    elapsedMs: number;
    /** Pixels travelled between those same two samples. Signed; downward is positive. */
    travelPx: number;
    /** The panel's own height, which the distance threshold is a share of. */
    panelHeight: number;
}

/**
 * Does letting go here dismiss the sheet, or does it settle back?
 *
 * Distance OR velocity, never both: a slow, committed pull past a quarter of the panel is an
 * unambiguous dismissal even though it ends at rest, and a fast flick is one even though it
 * covered very little ground. Requiring both would reject each of them.
 *
 * A zero or negative `elapsedMs` yields no velocity rather than an infinite one — two samples in
 * the same millisecond say nothing about speed, and a clock that has not advanced must not read as
 * an infinitely fast flick.
 */
export const shouldDismissOnRelease = ({ offset, elapsedMs, travelPx, panelHeight }: DragRelease): boolean => {
    if (offset <= 0) return false;

    if (panelHeight > 0 && offset >= panelHeight * DISMISS_DISTANCE_RATIO) return true;

    const velocity = elapsedMs > 0 ? travelPx / elapsedMs : 0;
    return velocity >= DISMISS_VELOCITY_PX_PER_MS;
};
