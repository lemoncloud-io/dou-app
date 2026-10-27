/**
 * The arithmetic behind the desktop image viewer's wheel, pan and double click, apart from any
 * event so it can be checked on its own.
 *
 * Same model as libs/web-ui-kit/src/composites/overlay/imageZoom.ts (not a live import: web-ui-kit
 * is apps/web only). A zoom is translate(x, y) scale(scale) around the centre of the stage.
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
/** Four times is past where a photo still has pixels to show. */
export const MAX_ZOOM_SCALE = 4;
/** What a double click zooms to: close enough to read, not so close the photo is lost. */
export const DOUBLE_TAP_ZOOM_SCALE = 2.5;
/** Wheel deltaY of 1 changes the scale by this factor in the exponent. */
export const WHEEL_ZOOM_INTENSITY = 0.0015;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const isZoomed = (zoom: Zoom): boolean => zoom.scale > MIN_ZOOM_SCALE;

/**
 * Keeps the image covering what it can of the stage: it may not be dragged so far that its edge
 * comes away from the stage's, and along an axis where it is smaller than the stage it stays centred.
 * `content` is the image's size at scale 1, as it is laid out on the stage.
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

/** Wheel / trackpad pinch: scale around `focal`, the pointer in stage-centre coordinates. */
export const wheelZoom = (zoom: Zoom, deltaY: number, focal: Point): Zoom =>
    zoomAround(zoom, zoom.scale * Math.exp(-deltaY * WHEEL_ZOOM_INTENSITY), focal);

/** A double click zooms in on the clicked point, or back out if the image is already zoomed. */
export const doubleTapZoom = (zoom: Zoom, at: Point): Zoom =>
    isZoomed(zoom) ? IDENTITY_ZOOM : zoomAround(IDENTITY_ZOOM, DOUBLE_TAP_ZOOM_SCALE, at);
