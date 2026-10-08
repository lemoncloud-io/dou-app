import { dragCropRect, type CropHandle } from './cropBox';
import type { EditRect } from './photoEdit';

const expectRect = (actual: EditRect, expected: EditRect) => {
    expect(actual.x).toBeCloseTo(expected.x, 9);
    expect(actual.y).toBeCloseTo(expected.y, 9);
    expect(actual.width).toBeCloseTo(expected.width, 9);
    expect(actual.height).toBeCloseTo(expected.height, 9);
};

// A box clear of every edge of the frame, so a small drag moves freely in any direction.
const start: EditRect = { x: 0.2, y: 0.3, width: 0.4, height: 0.4 };
const min = { width: 0.1, height: 0.1 };
const free = { ratio: null, min };
const square = { ratio: 1, min };

describe('dragCropRect — move', () => {
    it('translates the box without resizing it', () => {
        expectRect(dragCropRect(start, 'move', { dx: 0.1, dy: -0.1 }, free), {
            x: 0.3,
            y: 0.2,
            width: 0.4,
            height: 0.4,
        });
    });

    it('stops at each edge of the frame', () => {
        expectRect(dragCropRect(start, 'move', { dx: -1, dy: 0 }, free), { ...start, x: 0 });
        expectRect(dragCropRect(start, 'move', { dx: 1, dy: 0 }, free), { ...start, x: 0.6 });
        expectRect(dragCropRect(start, 'move', { dx: 0, dy: -1 }, free), { ...start, y: 0 });
        expectRect(dragCropRect(start, 'move', { dx: 0, dy: 1 }, free), { ...start, y: 0.6 });
    });

    it('ignores a ratio, which a move cannot break', () => {
        const wide = { x: 0.1, y: 0.1, width: 0.6, height: 0.2 };
        expectRect(dragCropRect(wide, 'move', { dx: 0.1, dy: 0.1 }, square), { ...wide, x: 0.2, y: 0.2 });
    });
});

describe('dragCropRect — free resize', () => {
    it.each<[CropHandle, { dx: number; dy: number }, EditRect]>([
        ['e', { dx: 0.1, dy: 0.5 }, { x: 0.2, y: 0.3, width: 0.5, height: 0.4 }],
        ['w', { dx: -0.1, dy: 0.5 }, { x: 0.1, y: 0.3, width: 0.5, height: 0.4 }],
        ['n', { dx: 0.5, dy: -0.1 }, { x: 0.2, y: 0.2, width: 0.4, height: 0.5 }],
        ['s', { dx: 0.5, dy: 0.1 }, { x: 0.2, y: 0.3, width: 0.4, height: 0.5 }],
    ])('moves only the %s edge, whatever the other axis does', (handle, delta, expected) => {
        expectRect(dragCropRect(start, handle, delta, free), expected);
    });

    it.each<[CropHandle, { dx: number; dy: number }, EditRect]>([
        ['se', { dx: 0.1, dy: 0.2 }, { x: 0.2, y: 0.3, width: 0.5, height: 0.6 }],
        ['nw', { dx: -0.1, dy: -0.2 }, { x: 0.1, y: 0.1, width: 0.5, height: 0.6 }],
        ['ne', { dx: 0.1, dy: -0.2 }, { x: 0.2, y: 0.1, width: 0.5, height: 0.6 }],
        ['sw', { dx: -0.1, dy: 0.2 }, { x: 0.1, y: 0.3, width: 0.5, height: 0.6 }],
    ])('moves both edges of the %s corner on their own', (handle, delta, expected) => {
        expectRect(dragCropRect(start, handle, delta, free), expected);
    });

    it('stops each edge at the frame', () => {
        expectRect(dragCropRect(start, 'w', { dx: -1, dy: 0 }, free), { x: 0, y: 0.3, width: 0.6, height: 0.4 });
        expectRect(dragCropRect(start, 'e', { dx: 1, dy: 0 }, free), { x: 0.2, y: 0.3, width: 0.8, height: 0.4 });
        expectRect(dragCropRect(start, 'n', { dx: 0, dy: -1 }, free), { x: 0.2, y: 0, width: 0.4, height: 0.7 });
        expectRect(dragCropRect(start, 's', { dx: 0, dy: 1 }, free), { x: 0.2, y: 0.3, width: 0.4, height: 0.7 });
        expectRect(dragCropRect(start, 'nw', { dx: -1, dy: -1 }, free), { x: 0, y: 0, width: 0.6, height: 0.7 });
    });

    it('stops each edge at the minimum size instead of crossing the opposite one', () => {
        expectRect(dragCropRect(start, 'e', { dx: -1, dy: 0 }, free), { x: 0.2, y: 0.3, width: 0.1, height: 0.4 });
        expectRect(dragCropRect(start, 'w', { dx: 1, dy: 0 }, free), { x: 0.5, y: 0.3, width: 0.1, height: 0.4 });
        expectRect(dragCropRect(start, 'n', { dx: 0, dy: 1 }, free), { x: 0.2, y: 0.6, width: 0.4, height: 0.1 });
        expectRect(dragCropRect(start, 's', { dx: 0, dy: -1 }, free), { x: 0.2, y: 0.3, width: 0.4, height: 0.1 });
        expectRect(dragCropRect(start, 'se', { dx: -1, dy: -1 }, free), { x: 0.2, y: 0.3, width: 0.1, height: 0.1 });
    });
});

describe('dragCropRect — corner with a ratio', () => {
    const box: EditRect = { x: 0.2, y: 0.2, width: 0.4, height: 0.4 };

    it('follows the sideways movement when it is the larger', () => {
        expectRect(dragCropRect(box, 'se', { dx: 0.2, dy: 0.05 }, square), { x: 0.2, y: 0.2, width: 0.6, height: 0.6 });
    });

    it('follows the vertical movement when it is the larger', () => {
        expectRect(dragCropRect(box, 'se', { dx: 0.05, dy: 0.2 }, square), { x: 0.2, y: 0.2, width: 0.6, height: 0.6 });
    });

    it.each<[CropHandle, { dx: number; dy: number }, EditRect]>([
        ['nw', { dx: -0.1, dy: 0 }, { x: 0.1, y: 0.1, width: 0.5, height: 0.5 }],
        ['ne', { dx: 0, dy: -0.15 }, { x: 0.2, y: 0.05, width: 0.55, height: 0.55 }],
        ['sw', { dx: -0.1, dy: 0.05 }, { x: 0.1, y: 0.2, width: 0.5, height: 0.5 }],
        ['se', { dx: -0.2, dy: 0 }, { x: 0.2, y: 0.2, width: 0.2, height: 0.2 }],
    ])('keeps the corner opposite %s where it was', (handle, delta, expected) => {
        expectRect(dragCropRect(box, handle, delta, square), expected);
    });

    it('stops at the frame without breaking the ratio', () => {
        expectRect(dragCropRect(box, 'se', { dx: 0.9, dy: 0 }, square), { x: 0.2, y: 0.2, width: 0.8, height: 0.8 });
        // Tall: the bottom of the frame is reached before the right.
        const tall = { x: 0.1, y: 0.1, width: 0.2, height: 0.4 };
        expectRect(dragCropRect(tall, 'se', { dx: 0.9, dy: 0 }, { ratio: 0.5, min }), {
            x: 0.1,
            y: 0.1,
            width: 0.45,
            height: 0.9,
        });
        // Wide: the right of the frame is reached first.
        const wide = { x: 0.1, y: 0.1, width: 0.4, height: 0.2 };
        expectRect(dragCropRect(wide, 'se', { dx: 0.9, dy: 0 }, { ratio: 2, min }), {
            x: 0.1,
            y: 0.1,
            width: 0.9,
            height: 0.45,
        });
    });

    it('stops at the minimum on both sides', () => {
        expectRect(dragCropRect(box, 'se', { dx: -1, dy: 0 }, square), { x: 0.2, y: 0.2, width: 0.1, height: 0.1 });
        // At 2:1 the minimum height is the tighter one: 0.1 tall is 0.2 wide.
        const wide = { x: 0.1, y: 0.1, width: 0.4, height: 0.2 };
        expectRect(dragCropRect(wide, 'nw', { dx: 1, dy: 0 }, { ratio: 2, min }), {
            x: 0.3,
            y: 0.2,
            width: 0.2,
            height: 0.1,
        });
    });

    it('brings a box that is off the ratio onto it', () => {
        const off = { x: 0.2, y: 0.2, width: 0.4, height: 0.2 };
        expectRect(dragCropRect(off, 'se', { dx: 0, dy: 0 }, square), { x: 0.2, y: 0.2, width: 0.4, height: 0.4 });
    });
});

describe('dragCropRect — edge with a ratio', () => {
    it.each<[CropHandle, { dx: number; dy: number }, EditRect]>([
        ['e', { dx: 0.2, dy: 0.3 }, { x: 0.2, y: 0.2, width: 0.6, height: 0.6 }],
        ['w', { dx: -0.1, dy: 0.3 }, { x: 0.1, y: 0.25, width: 0.5, height: 0.5 }],
        ['n', { dx: 0.3, dy: -0.2 }, { x: 0.1, y: 0.1, width: 0.6, height: 0.6 }],
        ['s', { dx: 0.3, dy: 0.1 }, { x: 0.15, y: 0.3, width: 0.5, height: 0.5 }],
    ])('grows the other side of %s evenly about the centre', (handle, delta, expected) => {
        expectRect(dragCropRect(start, handle, delta, square), expected);
    });

    it('shifts the box back inside the frame instead of stopping against it', () => {
        const atTop = { x: 0.2, y: 0, width: 0.3, height: 0.3 };
        expectRect(dragCropRect(atTop, 'e', { dx: 0.2, dy: 0 }, square), { x: 0.2, y: 0, width: 0.5, height: 0.5 });
        const atLeft = { x: 0, y: 0.2, width: 0.3, height: 0.3 };
        expectRect(dragCropRect(atLeft, 's', { dx: 0, dy: 0.2 }, square), { x: 0, y: 0.2, width: 0.5, height: 0.5 });
    });

    it('stops where the dragged edge meets the frame', () => {
        const nearRight = { x: 0.5, y: 0.4, width: 0.2, height: 0.2 };
        expectRect(dragCropRect(nearRight, 'e', { dx: 0.9, dy: 0 }, square), {
            x: 0.5,
            y: 0.25,
            width: 0.5,
            height: 0.5,
        });
        const nearTop = { x: 0.4, y: 0.3, width: 0.2, height: 0.2 };
        expectRect(dragCropRect(nearTop, 'n', { dx: 0, dy: -0.9 }, square), { x: 0.25, y: 0, width: 0.5, height: 0.5 });
    });

    it('stops where the side that follows fills the frame', () => {
        // A tall ratio: widening it makes it taller, and it can be no taller than the frame.
        const tall = { x: 0.1, y: 0.1, width: 0.2, height: 0.4 };
        expectRect(dragCropRect(tall, 'e', { dx: 0.9, dy: 0 }, { ratio: 0.5, min }), {
            x: 0.1,
            y: 0,
            width: 0.5,
            height: 1,
        });
        const wide = { x: 0.1, y: 0.1, width: 0.4, height: 0.2 };
        expectRect(dragCropRect(wide, 's', { dx: 0, dy: 0.9 }, { ratio: 2, min }), {
            x: 0,
            y: 0.1,
            width: 1,
            height: 0.5,
        });
    });

    it('stops at the minimum, still centred', () => {
        expectRect(dragCropRect(start, 'e', { dx: -1, dy: 0 }, square), { x: 0.2, y: 0.45, width: 0.1, height: 0.1 });
        expectRect(dragCropRect(start, 'n', { dx: 0, dy: 1 }, square), { x: 0.35, y: 0.6, width: 0.1, height: 0.1 });
    });
});

describe('dragCropRect — invariants', () => {
    const HANDLES: CropHandle[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw', 'move'];
    const STEPS = [-1, -0.3, -0.05, 0, 0.05, 0.3, 1];
    const RATIOS = [null, 0.5, 1, 1.7];
    const box: EditRect = { x: 0.25, y: 0.3, width: 0.4, height: 0.3 };
    const small = { width: 0.05, height: 0.05 };

    it('keeps every drag inside the frame, at least the minimum, and on the ratio', () => {
        for (const handle of HANDLES) {
            for (const ratio of RATIOS) {
                for (const dx of STEPS) {
                    for (const dy of STEPS) {
                        const rect = dragCropRect(box, handle, { dx, dy }, { ratio, min: small });
                        const where = `${handle} ratio ${ratio} by (${dx}, ${dy})`;
                        expect([where, rect.x >= 0 && rect.y >= 0]).toEqual([where, true]);
                        expect([where, rect.x + rect.width <= 1 + 1e-12]).toEqual([where, true]);
                        expect([where, rect.y + rect.height <= 1 + 1e-12]).toEqual([where, true]);
                        expect([where, rect.width >= small.width - 1e-12]).toEqual([where, true]);
                        expect([where, rect.height >= small.height - 1e-12]).toEqual([where, true]);
                        if (ratio !== null && handle !== 'move') {
                            expect([where, Math.abs(rect.width / rect.height - ratio) < 1e-9]).toEqual([where, true]);
                        }
                    }
                }
            }
        }
    });
});

describe('dragCropRect — degenerate input', () => {
    it('ignores a delta that is not a number', () => {
        expectRect(dragCropRect(start, 'se', { dx: Number.NaN, dy: Infinity }, free), start);
    });

    it('treats a ratio that is not a positive number as no ratio', () => {
        const expected = dragCropRect(start, 'se', { dx: 0.1, dy: 0.2 }, free);
        for (const ratio of [Number.NaN, 0, -1, Infinity]) {
            expectRect(dragCropRect(start, 'se', { dx: 0.1, dy: 0.2 }, { ratio, min }), expected);
        }
    });

    it('pulls a start outside the frame back inside before dragging', () => {
        expectRect(dragCropRect({ x: -0.2, y: 0.9, width: 0.5, height: 0.5 }, 'move', { dx: 0, dy: 0 }, free), {
            x: 0,
            y: 0.9,
            width: 0.5,
            height: 0.1,
        });
        expectRect(dragCropRect({ x: Number.NaN, y: 0, width: 0.5, height: 1 }, 'move', { dx: 0, dy: 0 }, free), {
            x: 0,
            y: 0,
            width: 1,
            height: 1,
        });
    });

    it('treats a minimum that is not a number as none, and keeps a too-large one inside the frame', () => {
        expectRect(
            dragCropRect(start, 'e', { dx: -1, dy: 0 }, { ratio: null, min: { width: Number.NaN, height: 0 } }),
            { x: 0.2, y: 0.3, width: 0, height: 0.4 }
        );
        const huge = dragCropRect(start, 'se', { dx: -1, dy: -1 }, { ratio: 1, min: { width: 5, height: 5 } });
        expect(huge.x + huge.width).toBeLessThanOrEqual(1);
        expect(huge.y + huge.height).toBeLessThanOrEqual(1);
    });
});
