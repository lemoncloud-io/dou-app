import {
    canStartDrag,
    clampDragOffset,
    DISMISS_DISTANCE_RATIO,
    DISMISS_VELOCITY_PX_PER_MS,
    shouldDismissOnRelease,
} from './sheetDrag';

describe('canStartDrag', () => {
    it('allows a drag at the top of the body', () => {
        expect(canStartDrag(0)).toBe(true);
    });

    it('refuses a drag once the body has been scrolled, so the gesture stays a scroll', () => {
        expect(canStartDrag(1)).toBe(false);
        expect(canStartDrag(400)).toBe(false);
    });

    it('allows a drag on a negative scrollTop, which is what a rubber-banding body reports', () => {
        expect(canStartDrag(-12)).toBe(true);
    });
});

describe('clampDragOffset', () => {
    it('follows the pointer downwards', () => {
        expect(clampDragOffset(64)).toBe(64);
    });

    it('drops upward travel rather than lifting the panel off its resting place', () => {
        expect(clampDragOffset(-64)).toBe(0);
        expect(clampDragOffset(0)).toBe(0);
    });
});

describe('shouldDismissOnRelease', () => {
    const release = (over: Partial<Parameters<typeof shouldDismissOnRelease>[0]> = {}) =>
        shouldDismissOnRelease({ offset: 0, elapsedMs: 16, travelPx: 0, panelHeight: 400, ...over });

    it('settles back when the panel never moved', () => {
        expect(release({ offset: 0 })).toBe(false);
    });

    it('dismisses on a slow pull past the distance threshold', () => {
        const past = 400 * DISMISS_DISTANCE_RATIO;
        expect(release({ offset: past, travelPx: 1, elapsedMs: 100 })).toBe(true);
    });

    it('settles back just short of the distance threshold at the same speed', () => {
        const short = 400 * DISMISS_DISTANCE_RATIO - 1;
        expect(release({ offset: short, travelPx: 1, elapsedMs: 100 })).toBe(false);
    });

    it('dismisses on a fast flick that never reached the distance threshold', () => {
        expect(release({ offset: 30, travelPx: 20, elapsedMs: 16 })).toBe(true);
    });

    it('settles back on a short, slow drag — neither threshold met', () => {
        expect(release({ offset: 30, travelPx: 2, elapsedMs: 100 })).toBe(false);
    });

    it('scales the distance threshold with the panel, so a short sheet needs a shorter pull', () => {
        expect(release({ offset: 30, panelHeight: 100, travelPx: 1, elapsedMs: 100 })).toBe(true);
        expect(release({ offset: 30, panelHeight: 800, travelPx: 1, elapsedMs: 100 })).toBe(false);
    });

    it('reads a stalled clock as no velocity rather than an infinitely fast flick', () => {
        expect(release({ offset: 10, travelPx: 10, elapsedMs: 0 })).toBe(false);
    });

    it('treats an unmeasured panel height as distance-less, leaving velocity the only way out', () => {
        expect(release({ offset: 300, panelHeight: 0, travelPx: 1, elapsedMs: 100 })).toBe(false);
        expect(release({ offset: 300, panelHeight: 0, travelPx: 20, elapsedMs: 16 })).toBe(true);
    });

    it('takes exactly the documented velocity as enough', () => {
        const travel = DISMISS_VELOCITY_PX_PER_MS * 20;
        expect(release({ offset: 10, travelPx: travel, elapsedMs: 20 })).toBe(true);
        expect(release({ offset: 10, travelPx: travel - 0.01, elapsedMs: 20 })).toBe(false);
    });

    it('ignores upward velocity, which is a pointer heading back to the resting place', () => {
        expect(release({ offset: 10, travelPx: -40, elapsedMs: 16 })).toBe(false);
    });
});
