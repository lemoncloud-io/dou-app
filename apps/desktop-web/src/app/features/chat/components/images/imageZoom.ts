/**
 * The arithmetic behind the desktop image viewer's wheel, pinch, pan, click and zoom buttons, apart from any
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
/** What a click zooms to: close enough to read, not so close the photo is lost. */
export const CLICK_ZOOM_SCALE = 2.5;
/** Wheel deltaY of 1 changes the scale by this factor in the exponent. */
export const WHEEL_ZOOM_INTENSITY = 0.0015;
/**
 * A trackpad pinch arrives as a wheel event with ctrlKey and deltas of a few units, not the
 * hundred a mouse notch sends; at the wheel's rate a whole pinch barely moved the picture.
 */
export const PINCH_ZOOM_INTENSITY = 0.01;
/** One press of a zoom button or +/- multiplies or divides the scale by this. */
export const ZOOM_STEP = 1.5;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const isZoomed = (zoom: Zoom): boolean => zoom.scale > MIN_ZOOM_SCALE;

/**
 * Keeps the image covering what it can of the stage: it may not be dragged so far that its edge
 * comes away from the stage's, and along an axis where it is smaller than the stage it stays centred.
 * `content` is the photo's size at scale 1, as it is laid out on the stage.
 */
export const clampZoom = (zoom: Zoom, content: Size, page: Size): Zoom => {
    const scale = clamp(zoom.scale, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE);
    const maxX = Math.max(0, (content.width * scale - page.width) / 2);
    const maxY = Math.max(0, (content.height * scale - page.height) / 2);
    return { scale, x: clamp(zoom.x, -maxX, maxX), y: clamp(zoom.y, -maxY, maxY) };
};

/**
 * Changes the scale while the screen point `focal` stays where it is. The scale is clamped before
 * the offset is worked out, so the offset always belongs to the scale actually applied.
 */
export const zoomAround = (zoom: Zoom, scale: number, focal: Point): Zoom => {
    const next = clamp(scale, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE);
    const ratio = next / zoom.scale;
    return { scale: next, x: focal.x - ratio * (focal.x - zoom.x), y: focal.y - ratio * (focal.y - zoom.y) };
};

/** Wheel or trackpad pinch (`pinch`): scale around `focal`, the pointer relative to the layer centre. */
export const wheelZoom = (zoom: Zoom, deltaY: number, focal: Point, pinch = false): Zoom =>
    zoomAround(zoom, zoom.scale * Math.exp(-deltaY * (pinch ? PINCH_ZOOM_INTENSITY : WHEEL_ZOOM_INTENSITY)), focal);

/** The slider: an exact scale, around the middle of the view. */
export const zoomTo = (zoom: Zoom, scale: number): Zoom => zoomAround(zoom, scale, { x: 0, y: 0 });

/** A zoom button or key: one `ZOOM_STEP` in (`1`) or out (`-1`), around the middle of the view. */
export const stepZoom = (zoom: Zoom, direction: 1 | -1): Zoom => zoomTo(zoom, zoom.scale * ZOOM_STEP ** direction);

/**
 * The photo's size as it appears once turned `turns` quarter turns: a sideways photo is as wide as it
 * is tall unturned, so the pan bounds must swap the two.
 */
export const turnedContent = (content: Size, turns: number): Size =>
    turns % 2 === 0 ? content : { width: content.height, height: content.width };

/** A click zooms in on the clicked point, or back out to fit if the photo is already zoomed. */
export const toggleZoom = (zoom: Zoom, at: Point): Zoom =>
    isZoomed(zoom) ? IDENTITY_ZOOM : zoomAround(IDENTITY_ZOOM, CLICK_ZOOM_SCALE, at);
