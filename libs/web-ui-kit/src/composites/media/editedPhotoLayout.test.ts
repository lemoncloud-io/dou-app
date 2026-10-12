import { cssMatrix, fitPhotoEditPlan, type FittedPhotoEdit } from './editedPhotoLayout';
import { IDENTITY_PHOTO_EDIT, planPhotoEdit, type PhotoEdit, type PhotoEditPlan } from './photoEdit';

const SOURCE = { width: 4000, height: 3000 };
const plan = (edit: Partial<PhotoEdit> = {}): PhotoEditPlan =>
    planPhotoEdit(SOURCE, { ...IDENTITY_PHOTO_EDIT, ...edit }, { maxArea: Infinity });

/** Where a source pixel lands in the box: through the matrix into the frame, then the frame's offset. */
const apply = (
    { matrix: [a, b, c, d, e, f], left, top }: FittedPhotoEdit,
    [x, y]: [number, number]
): [number, number] => [left + a * x + c * y + e, top + b * x + d * y + f];

const expectPoint = (actual: [number, number], expected: [number, number]) => {
    expect(actual[0]).toBeCloseTo(expected[0], 6);
    expect(actual[1]).toBeCloseTo(expected[1], 6);
};

describe('fitPhotoEditPlan', () => {
    it('letterboxes the whole photo in the box for contain, centred', () => {
        // 4000 × 3000 into 400 × 600: a tenth, 300 tall, 150 of black above and below.
        const fitted = fitPhotoEditPlan(plan(), { width: 400, height: 600 }, 'contain');

        expect(fitted).toMatchObject({ left: 0, top: 150, width: 400, height: 300 });
        expectPoint(apply(fitted, [0, 0]), [0, 150]);
        expectPoint(apply(fitted, [4000, 3000]), [400, 450]);
    });

    it('fills the box for cover, clipping the long side evenly', () => {
        // 4000 × 3000 into a 100px square: scaled to 100 tall, 133 wide, a sixth cut off each side.
        const fitted = fitPhotoEditPlan(plan(), { width: 100, height: 100 }, 'cover');

        expect(fitted.left).toBeCloseTo(-50 / 3, 6);
        expect(fitted.width).toBeCloseTo(100 + 100 / 3, 6);
        expectPoint(apply(fitted, [0, 0]), [-50 / 3, 0]);
        expectPoint(apply(fitted, [4000, 3000]), [100 + 50 / 3, 100]);
    });

    it('fits the turned photo, not the original, after a quarter turn', () => {
        // Turned clockwise the photo is 3000 × 4000; the source's top-left lands top-right.
        const fitted = fitPhotoEditPlan(plan({ rotation: 90 }), { width: 300, height: 400 }, 'contain');

        expectPoint(apply(fitted, [0, 0]), [300, 0]);
        expectPoint(apply(fitted, [4000, 3000]), [0, 400]);
    });

    it('frames only the cropped part, with the rest falling outside the frame', () => {
        // The right half: 2000 × 3000, into a 400 × 300 box at a tenth — a 200 × 300 frame in the middle.
        const fitted = fitPhotoEditPlan(
            plan({ crop: { x: 0.5, y: 0, width: 0.5, height: 1 } }),
            { width: 400, height: 300 },
            'contain'
        );

        expect(fitted).toMatchObject({ left: 100, top: 0, width: 200, height: 300 });
        expectPoint(apply(fitted, [2000, 0]), [100, 0]);
        expectPoint(apply(fitted, [4000, 3000]), [300, 300]);
        // The left half the crop drops lands inside the box but left of the frame, which clips it.
        expectPoint(apply(fitted, [0, 0]), [-100, 0]);
    });

    it('scales to nothing in a box that has not been measured', () => {
        const fitted = fitPhotoEditPlan(plan({ rotation: 180 }), { width: 0, height: 0 }, 'contain');

        expect(fitted.matrix.map(value => Math.abs(value))).toEqual([0, 0, 0, 0, 0, 0]);
        expect([fitted.width, fitted.height]).toEqual([0, 0]);
    });
});

describe('cssMatrix', () => {
    it('writes the six values in CSS matrix() order', () => {
        expect(cssMatrix([1, 2, 3, 4, 5, 6])).toBe('matrix(1, 2, 3, 4, 5, 6)');
    });
});
