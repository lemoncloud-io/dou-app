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
export const DOUBLE_TAP_ZOOM_SCALE = 2.5;
const SNAP_BACK_SCALE = 1.05;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const isZoomed = (zoom: Zoom): boolean => zoom.scale > MIN_ZOOM_SCALE;

export const clampZoom = (zoom: Zoom, content: Size, page: Size): Zoom => {
    const scale = clamp(zoom.scale, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE);
    const maxX = Math.max(0, (content.width * scale - page.width) / 2);
    const maxY = Math.max(0, (content.height * scale - page.height) / 2);
    return { scale, x: clamp(zoom.x, -maxX, maxX), y: clamp(zoom.y, -maxY, maxY) };
};

export const zoomAround = (zoom: Zoom, scale: number, focal: Point): Zoom => {
    const ratio = scale / zoom.scale;
    return { scale, x: focal.x - ratio * (focal.x - zoom.x), y: focal.y - ratio * (focal.y - zoom.y) };
};

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

export interface Pinch {
    from: Zoom;
    start: [Point, Point];
}

export const pinchZoom = ({ from, start }: Pinch, now: [Point, Point]): Zoom => {
    const startSpread = distance(start[0], start[1]);
    if (startSpread === 0) return from;
    const scale = clamp((from.scale * distance(now[0], now[1])) / startSpread, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE);
    const was = midpoint(start[0], start[1]);
    const is = midpoint(now[0], now[1]);
    const ratio = scale / from.scale;
    return { scale, x: is.x - ratio * (was.x - from.x), y: is.y - ratio * (was.y - from.y) };
};

export const settleZoom = (zoom: Zoom): Zoom => (zoom.scale < SNAP_BACK_SCALE ? IDENTITY_ZOOM : zoom);

export const doubleTapZoom = (zoom: Zoom, at: Point): Zoom =>
    isZoomed(zoom) ? IDENTITY_ZOOM : zoomAround(IDENTITY_ZOOM, DOUBLE_TAP_ZOOM_SCALE, at);
