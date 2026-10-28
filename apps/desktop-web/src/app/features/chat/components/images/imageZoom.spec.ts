import {
    clampZoom,
    CLICK_ZOOM_SCALE,
    toggleZoom,
    IDENTITY_ZOOM,
    isZoomed,
    MAX_ZOOM_SCALE,
    stepZoom,
    turnedContent,
    wheelZoom,
    ZOOM_STEP,
    zoomAround,
    zoomTo,
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

describe('toggleZoom', () => {
    it('zooms in on the tapped point', () => {
        const at = { x: 80, y: -40 };
        const zoom = toggleZoom(IDENTITY_ZOOM, at);

        expect(zoom.scale).toBe(CLICK_ZOOM_SCALE);
        expect(onScreen(zoom, at).x).toBeCloseTo(at.x);
        expect(onScreen(zoom, at).y).toBeCloseTo(at.y);
    });

    it('zooms back out when already zoomed', () => {
        expect(toggleZoom({ scale: 3, x: 40, y: 0 }, { x: 0, y: 0 })).toBe(IDENTITY_ZOOM);
    });
});

describe('zoomAround at the limit', () => {
    it('leaves the photo where it is when the scale is already at its maximum', () => {
        const atMax = { scale: MAX_ZOOM_SCALE, x: 120, y: -60 };
        expect(zoomAround(atMax, MAX_ZOOM_SCALE * 2, { x: 300, y: 200 })).toEqual(atMax);
    });
});

describe('wheelZoom with a pinch', () => {
    it('moves further per unit than a mouse wheel', () => {
        const wheel = wheelZoom(IDENTITY_ZOOM, -10, { x: 0, y: 0 });
        const pinch = wheelZoom(IDENTITY_ZOOM, -10, { x: 0, y: 0 }, true);
        expect(pinch.scale).toBeGreaterThan(wheel.scale);
    });
});

describe('stepZoom', () => {
    it('steps in and out around the middle of the view', () => {
        const zoomedIn = stepZoom(IDENTITY_ZOOM, 1);
        expect(zoomedIn).toEqual({ scale: ZOOM_STEP, x: 0, y: 0 });
        expect(stepZoom(zoomedIn, -1).scale).toBeCloseTo(1);
    });

    it('does not step out past fitting', () => {
        expect(stepZoom(IDENTITY_ZOOM, -1).scale).toBe(1);
    });
});

describe('isZoomed', () => {
    it('is true only past fitting the page', () => {
        expect(isZoomed(IDENTITY_ZOOM)).toBe(false);
        expect(isZoomed({ scale: 1.5, x: 0, y: 0 })).toBe(true);
    });
});

describe('turnedContent', () => {
    it('swaps width and height on an odd number of quarter turns', () => {
        expect(turnedContent(photo, 1)).toEqual({ width: 300, height: 400 });
        expect(turnedContent(photo, 3)).toEqual({ width: 300, height: 400 });
    });

    it('keeps the size on an even number of quarter turns', () => {
        expect(turnedContent(photo, 0)).toEqual(photo);
        expect(turnedContent(photo, 2)).toEqual(photo);
    });

    it('lets a turned landscape be dragged by its visual height', () => {
        const zoom = clampZoom({ scale: 2, x: 0, y: 9999 }, turnedContent(photo, 1), page);
        // 400 tall turned, doubled = 800: exactly the page, so no room to pan vertically.
        expect(zoom.y).toBe(0);
    });
});

describe('zoomTo', () => {
    it('sets the scale around the middle of the view, clamped to the range', () => {
        expect(zoomTo(IDENTITY_ZOOM, 2.5)).toEqual({ scale: 2.5, x: 0, y: 0 });
        expect(zoomTo(IDENTITY_ZOOM, 99).scale).toBe(MAX_ZOOM_SCALE);
        expect(zoomTo({ scale: 3, x: 10, y: 20 }, 0.2).scale).toBe(1);
    });
});
