/**
 * The arithmetic behind the image viewer's pinch, pan and double tap, apart from any event so it can
 * be checked on its own.
 *
 * A zoom is `translate(x, y) scale(scale)` applied around the centre of the page, so every point here
 * is measured from that centre. An image point `u` lands on screen at `t + scale · u`; keeping a
 * screen point `f` still while the scale changes is what makes a pinch feel anchored under the
 * fingers.
 */

export interface Zoom {
    scale: number;
    x: number;
    y: number;
}

export interface Point {
    x: number;
    y: number;
}

export interface Size {
    width: number;
    height: number;
}

export const IDENTITY_ZOOM: Zoom = { scale: 1, x: 0, y: 0 };
export const MIN_ZOOM_SCALE = 1;
/** Four times is past where a phone photo still has pixels to show. */
export const MAX_ZOOM_SCALE = 4;
/** What a double tap zooms to: close enough to read, not so close the photo is lost. */
export const DOUBLE_TAP_ZOOM_SCALE = 2.5;
/** Below this after a pinch, the image snaps back to fitting the page instead of hovering near it. */
const SNAP_BACK_SCALE = 1.05;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const isZoomed = (zoom: Zoom): boolean => zoom.scale > MIN_ZOOM_SCALE;

/**
 * Keeps the image covering what it can of the page: it may not be dragged so far that its edge comes
 * away from the page's, and along an axis where it is smaller than the page it stays centred.
 * `content` is the image's size at scale 1, as it is laid out on the page.
 */
export const clampZoom = (zoom: Zoom, content: Size, page: Size): Zoom => {
    const scale = clamp(zoom.scale, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE);
    const maxX = Math.max(0, (content.width * scale - page.width) / 2);
    const maxY = Math.max(0, (content.height * scale - page.height) / 2);
    return { scale, x: clamp(zoom.x, -maxX, maxX), y: clamp(zoom.y, -maxY, maxY) };
};

/** Changes the scale while the screen point `focal` stays where it is. */
export const zoomAround = (zoom: Zoom, scale: number, focal: Point): Zoom => {
    const ratio = scale / zoom.scale;
    return { scale, x: focal.x - ratio * (focal.x - zoom.x), y: focal.y - ratio * (focal.y - zoom.y) };
};

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

export interface Pinch {
    from: Zoom;
    /** Where the two fingers were when the pinch began. */
    start: [Point, Point];
}

/**
 * The zoom a pinch has reached, from where it began and where the fingers are now. The spread of the
 * fingers sets the scale, and the image point that was between them stays between them, so moving
 * both fingers together pans as well.
 */
export const pinchZoom = ({ from, start }: Pinch, now: [Point, Point]): Zoom => {
    const startSpread = distance(start[0], start[1]);
    if (startSpread === 0) return from;
    const scale = clamp((from.scale * distance(now[0], now[1])) / startSpread, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE);
    const was = midpoint(start[0], start[1]);
    const is = midpoint(now[0], now[1]);
    const ratio = scale / from.scale;
    return { scale, x: is.x - ratio * (was.x - from.x), y: is.y - ratio * (was.y - from.y) };
};

/** A pinch that ends barely zoomed goes back to fitting the page. */
export const settleZoom = (zoom: Zoom): Zoom => (zoom.scale < SNAP_BACK_SCALE ? IDENTITY_ZOOM : zoom);

/** A double tap zooms in on the tapped point, or back out if the image is already zoomed. */
export const doubleTapZoom = (zoom: Zoom, at: Point): Zoom =>
    isZoomed(zoom) ? IDENTITY_ZOOM : zoomAround(IDENTITY_ZOOM, DOUBLE_TAP_ZOOM_SCALE, at);
