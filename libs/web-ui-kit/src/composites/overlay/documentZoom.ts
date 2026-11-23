export const DOCUMENT_MIN_ZOOM = 1;
export const DOCUMENT_MAX_ZOOM = 4;
export const DOCUMENT_DOUBLE_TAP_ZOOM = 2;

export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_SLOP_PX = 30;

export const clampDocumentZoom = (zoom: number): number =>
    Math.min(DOCUMENT_MAX_ZOOM, Math.max(DOCUMENT_MIN_ZOOM, Number.isFinite(zoom) ? zoom : DOCUMENT_MIN_ZOOM));

export const doubleTapDocumentZoom = (zoom: number): number =>
    zoom > DOCUMENT_MIN_ZOOM ? DOCUMENT_MIN_ZOOM : DOCUMENT_DOUBLE_TAP_ZOOM;

export interface DocumentPoint {
    x: number;
    y: number;
}

export interface DocumentTap extends DocumentPoint {
    at: number;
}

export const isDocumentDoubleTap = (previous: DocumentTap | null, next: DocumentTap): boolean =>
    previous !== null &&
    next.at - previous.at <= DOUBLE_TAP_MS &&
    Math.hypot(next.x - previous.x, next.y - previous.y) <= DOUBLE_TAP_SLOP_PX;

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
