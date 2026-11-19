/**
 * The document viewer's zoom: how far the pages can be enlarged, what a double tap does, and where the
 * scroll goes so the point under the fingers stays under them. Pure, so each rule is tested alone.
 */

/** Fit to the width. Pages are never drawn smaller than the column. */
export const DOCUMENT_MIN_ZOOM = 1;
/** Far enough to read a footnote on a phone; past it a page's canvas only grows. */
export const DOCUMENT_MAX_ZOOM = 4;
/** A double tap on a page at its fitted width enlarges it this far; on an enlarged one it fits it back. */
export const DOCUMENT_DOUBLE_TAP_ZOOM = 2;

/** Two taps closer than this in time are a double tap. */
export const DOUBLE_TAP_MS = 300;
/** …and closer than this in place. */
export const DOUBLE_TAP_SLOP_PX = 30;

export const clampDocumentZoom = (zoom: number): number =>
    Math.min(DOCUMENT_MAX_ZOOM, Math.max(DOCUMENT_MIN_ZOOM, Number.isFinite(zoom) ? zoom : DOCUMENT_MIN_ZOOM));

/** The zoom a double tap goes to from `zoom`: in from the fitted width, back out from anything else. */
export const doubleTapDocumentZoom = (zoom: number): number =>
    zoom > DOCUMENT_MIN_ZOOM ? DOCUMENT_MIN_ZOOM : DOCUMENT_DOUBLE_TAP_ZOOM;

export interface DocumentPoint {
    x: number;
    y: number;
}

export interface DocumentTap extends DocumentPoint {
    at: number;
}

/** Whether `next` follows `previous` closely enough, in time and place, to be the second tap of two. */
export const isDocumentDoubleTap = (previous: DocumentTap | null, next: DocumentTap): boolean =>
    previous !== null &&
    next.at - previous.at <= DOUBLE_TAP_MS &&
    Math.hypot(next.x - previous.x, next.y - previous.y) <= DOUBLE_TAP_SLOP_PX;

/**
 * Where the scroll goes when the zoom changes from `from` to `to`, so the content under `focal` — a
 * point in the scroll area's own box — is still under it afterwards. The pages scale about their own
 * corner, so a content point at `scroll + focal` moves to `(scroll + focal) × to / from`. Never negative:
 * zooming back out near the top-left edge cannot scroll past it.
 */
export const documentZoomScroll = (
    scroll: DocumentPoint,
    focal: DocumentPoint,
    from: number,
    to: number
): DocumentPoint => {
    const ratio = to / from;
    return {
        x: Math.max(0, (scroll.x + focal.x) * ratio - focal.x),
        y: Math.max(0, (scroll.y + focal.y) * ratio - focal.y),
    };
};
