import {
    clampZoom,
    DOUBLE_TAP_ZOOM_SCALE,
    doubleTapZoom,
    IDENTITY_ZOOM,
    isZoomed,
    MAX_ZOOM_SCALE,
    wheelZoom,
    zoomAround,
    type Point,
    type Zoom,
} from './imageZoom';

const onScreen = (zoom: Zoom, imagePoint: Point): Point => ({
    x: zoom.x + zoom.scale * imagePoint.x,
    y: zoom.y + zoom.scale * imagePoint.y,
});
const imagePointAt = (zoom: Zoom, screen: Point): Point => ({
    x: (screen.x - zoom.x) / zoom.scale,
    y: (screen.y - zoom.y) / zoom.scale,
});

const page = { width: 400, height: 800 };
const photo = { width: 400, height: 300 };

describe('zoomAround', () => {
    it('keeps the focal point where it is on screen', () => {
        const focal = { x: 100, y: -50 };
        const before = { scale: 1.5, x: 20, y: 10 };
        const under = imagePointAt(before, focal);

        const after = zoomAround(before, 3, focal);

        expect(after.scale).toBe(3);
        expect(onScreen(after, under).x).toBeCloseTo(focal.x);
        expect(onScreen(after, under).y).toBeCloseTo(focal.y);
    });
});

describe('wheelZoom', () => {
    it('keeps the focal point where it is on screen', () => {
        const focal = { x: 80, y: -30 };
        const before = { scale: 1.5, x: 10, y: 5 };
        const under = imagePointAt(before, focal);

        const after = wheelZoom(before, -400, focal);

        expect(after.scale).toBeGreaterThan(before.scale);
        expect(onScreen(after, under).x).toBeCloseTo(focal.x);
        expect(onScreen(after, under).y).toBeCloseTo(focal.y);
    });

    it('zooms out when the wheel turns the other way', () => {
        const after = wheelZoom({ scale: 2, x: 0, y: 0 }, 400, { x: 0, y: 0 });
        expect(after.scale).toBeLessThan(2);
    });
});

describe('clampZoom', () => {
    it('keeps an image zoomed past the page from being pulled off its edge', () => {
        // At 2x the photo is 800 wide, so it can move 200 either way; 600 tall, still inside the page.
        expect(clampZoom({ scale: 2, x: 500, y: 90 }, photo, page)).toEqual({ scale: 2, x: 200, y: 0 });
        expect(clampZoom({ scale: 2, x: -500, y: 0 }, photo, page).x).toBe(-200);
    });

    it('leaves a pan inside the bounds alone', () => {
        expect(clampZoom({ scale: 3, x: 100, y: 20 }, photo, page)).toEqual({ scale: 3, x: 100, y: 20 });
    });

    it('keeps the scale between fitting and four times', () => {
        expect(clampZoom({ scale: 9, x: 0, y: 0 }, photo, page).scale).toBe(MAX_ZOOM_SCALE);
        expect(clampZoom({ scale: 0.5, x: 0, y: 0 }, photo, page).scale).toBe(1);
    });
});

describe('doubleTapZoom', () => {
    it('zooms in on the tapped point', () => {
        const at = { x: 80, y: -40 };
        const zoom = doubleTapZoom(IDENTITY_ZOOM, at);

        expect(zoom.scale).toBe(DOUBLE_TAP_ZOOM_SCALE);
        expect(onScreen(zoom, at).x).toBeCloseTo(at.x);
        expect(onScreen(zoom, at).y).toBeCloseTo(at.y);
    });

    it('zooms back out when already zoomed', () => {
        expect(doubleTapZoom({ scale: 3, x: 40, y: 0 }, { x: 0, y: 0 })).toBe(IDENTITY_ZOOM);
    });
});

describe('isZoomed', () => {
    it('is true only past fitting the page', () => {
        expect(isZoomed(IDENTITY_ZOOM)).toBe(false);
        expect(isZoomed({ scale: 1.5, x: 0, y: 0 })).toBe(true);
    });
});
