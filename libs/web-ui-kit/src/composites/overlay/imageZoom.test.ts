import {
    clampZoom,
    DOUBLE_TAP_ZOOM_SCALE,
    doubleTapZoom,
    IDENTITY_ZOOM,
    isZoomed,
    MAX_ZOOM_SCALE,
    pinchZoom,
    settleZoom,
    zoomAround,
    type Point,
    type Zoom,
} from './imageZoom';

// Where an image point lands on screen under a zoom — what "stays under the fingers" is checked with.
const onScreen = (zoom: Zoom, imagePoint: Point): Point => ({
    x: zoom.x + zoom.scale * imagePoint.x,
    y: zoom.y + zoom.scale * imagePoint.y,
});
const imagePointAt = (zoom: Zoom, screen: Point): Point => ({
    x: (screen.x - zoom.x) / zoom.scale,
    y: (screen.y - zoom.y) / zoom.scale,
});

const page = { width: 400, height: 800 };
// A landscape photo fitted to the page's width.
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

describe('pinchZoom', () => {
    const start: [Point, Point] = [
        { x: -50, y: 0 },
        { x: 50, y: 0 },
    ];

    it('scales with the spread of the fingers', () => {
        const zoom = pinchZoom({ from: IDENTITY_ZOOM, start }, [
            { x: -100, y: 0 },
            { x: 100, y: 0 },
        ]);
        expect(zoom).toEqual({ scale: 2, x: 0, y: 0 });
    });

    // Anchored: the image point between the fingers follows them when they move together.
    it('keeps the point between the fingers under them as they move', () => {
        const from = { scale: 2, x: 30, y: -20 };
        const under = imagePointAt(from, { x: 0, y: 0 });

        const zoom = pinchZoom({ from, start }, [
            { x: 0, y: 100 },
            { x: 150, y: 100 },
        ]);

        const between = onScreen(zoom, under);
        expect(zoom.scale).toBeCloseTo(3);
        expect(between.x).toBeCloseTo(75);
        expect(between.y).toBeCloseTo(100);
    });

    it('stops at four times and at fitting the page', () => {
        const wide = pinchZoom({ from: IDENTITY_ZOOM, start }, [
            { x: -1000, y: 0 },
            { x: 1000, y: 0 },
        ]);
        const narrow = pinchZoom({ from: IDENTITY_ZOOM, start }, [
            { x: -5, y: 0 },
            { x: 5, y: 0 },
        ]);

        expect(wide.scale).toBe(MAX_ZOOM_SCALE);
        expect(narrow.scale).toBe(1);
    });

    it('does nothing for fingers that started on the same point', () => {
        const from = { scale: 2, x: 1, y: 2 };
        expect(
            pinchZoom({ from, start: [start[0], start[0]] }, [
                { x: 0, y: 0 },
                { x: 10, y: 0 },
            ])
        ).toBe(from);
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

describe('settleZoom', () => {
    it('lets a barely zoomed image fit the page again', () => {
        expect(settleZoom({ scale: 1.02, x: 5, y: 5 })).toBe(IDENTITY_ZOOM);
    });

    it('keeps a real zoom', () => {
        const zoom = { scale: 1.5, x: 5, y: 5 };
        expect(settleZoom(zoom)).toBe(zoom);
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
