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
export const MAX_ZOOM_SCALE = 4;
export const CLICK_ZOOM_SCALE = 2.5;
export const WHEEL_ZOOM_INTENSITY = 0.0015;
export const PINCH_ZOOM_INTENSITY = 0.01;
export const ZOOM_STEP = 1.5;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const isZoomed = (zoom: Zoom): boolean => zoom.scale > MIN_ZOOM_SCALE;

export const clampZoom = (zoom: Zoom, content: Size, page: Size): Zoom => {
    const scale = clamp(zoom.scale, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE);
    const maxX = Math.max(0, (content.width * scale - page.width) / 2);
    const maxY = Math.max(0, (content.height * scale - page.height) / 2);
    return { scale, x: clamp(zoom.x, -maxX, maxX), y: clamp(zoom.y, -maxY, maxY) };
};

export const zoomAround = (zoom: Zoom, scale: number, focal: Point): Zoom => {
    const next = clamp(scale, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE);
    const ratio = next / zoom.scale;
    return { scale: next, x: focal.x - ratio * (focal.x - zoom.x), y: focal.y - ratio * (focal.y - zoom.y) };
};

export const wheelZoom = (zoom: Zoom, deltaY: number, focal: Point, pinch = false): Zoom =>
    zoomAround(zoom, zoom.scale * Math.exp(-deltaY * (pinch ? PINCH_ZOOM_INTENSITY : WHEEL_ZOOM_INTENSITY)), focal);

export const zoomTo = (zoom: Zoom, scale: number): Zoom => zoomAround(zoom, scale, { x: 0, y: 0 });

export const stepZoom = (zoom: Zoom, direction: 1 | -1): Zoom => zoomTo(zoom, zoom.scale * ZOOM_STEP ** direction);

export const turnedContent = (content: Size, turns: number): Size =>
    turns % 2 === 0 ? content : { width: content.height, height: content.width };

export const toggleZoom = (zoom: Zoom, at: Point): Zoom =>
    isZoomed(zoom) ? IDENTITY_ZOOM : zoomAround(IDENTITY_ZOOM, CLICK_ZOOM_SCALE, at);
