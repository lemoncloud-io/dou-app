import { cssMatrix, fitPhotoEditPlan, type FittedPhotoEdit } from './editedPhotoLayout';
import { IDENTITY_PHOTO_EDIT, planPhotoEdit, type PhotoEdit, type PhotoEditPlan } from './photoEdit';

const SOURCE = { width: 4000, height: 3000 };
const plan = (edit: Partial<PhotoEdit> = {}): PhotoEditPlan =>
    planPhotoEdit(SOURCE, { ...IDENTITY_PHOTO_EDIT, ...edit }, { maxArea: Infinity });

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
        const fitted = fitPhotoEditPlan(plan(), { width: 400, height: 600 }, 'contain');

        expect(fitted).toMatchObject({ left: 0, top: 150, width: 400, height: 300 });
        expectPoint(apply(fitted, [0, 0]), [0, 150]);
        expectPoint(apply(fitted, [4000, 3000]), [400, 450]);
    });

    it('fills the box for cover, clipping the long side evenly', () => {
        const fitted = fitPhotoEditPlan(plan(), { width: 100, height: 100 }, 'cover');

        expect(fitted.left).toBeCloseTo(-50 / 3, 6);
        expect(fitted.width).toBeCloseTo(100 + 100 / 3, 6);
        expectPoint(apply(fitted, [0, 0]), [-50 / 3, 0]);
        expectPoint(apply(fitted, [4000, 3000]), [100 + 50 / 3, 100]);
    });

    it('fits the turned photo, not the original, after a quarter turn', () => {
        const fitted = fitPhotoEditPlan(plan({ rotation: 90 }), { width: 300, height: 400 }, 'contain');

        expectPoint(apply(fitted, [0, 0]), [300, 0]);
        expectPoint(apply(fitted, [4000, 3000]), [0, 400]);
    });

    it('frames only the cropped part, with the rest falling outside the frame', () => {
        const fitted = fitPhotoEditPlan(
            plan({ crop: { x: 0.5, y: 0, width: 0.5, height: 1 } }),
            { width: 400, height: 300 },
            'contain'
        );

        expect(fitted).toMatchObject({ left: 100, top: 0, width: 200, height: 300 });
        expectPoint(apply(fitted, [2000, 0]), [100, 0]);
        expectPoint(apply(fitted, [4000, 3000]), [300, 300]);
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
