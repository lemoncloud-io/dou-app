import {
    CROP_ASPECTS,
    cropAspectRatio,
    flipPhotoEditHorizontal,
    IDENTITY_PHOTO_EDIT,
    isIdentityPhotoEdit,
    orientedSize,
    PHOTO_EDIT_MAX_AREA,
    planPhotoEdit,
    rotatePhotoEditLeft,
    setPhotoEditAspect,
    type EditRect,
    type EditSize,
    type PhotoEdit,
    type PhotoEditPlan,
    type QuarterTurn,
} from './photoEdit';

type Matrix = PhotoEditPlan['matrix'];
interface Point {
    x: number;
    y: number;
}

// Where a source pixel lands under a plan — the canvas's and CSS's reading of the six numbers.
const apply = ([a, b, c, d, e, f]: Matrix, p: Point): Point => ({ x: a * p.x + c * p.y + e, y: b * p.x + d * p.y + f });
const invert = ([a, b, c, d, e, f]: Matrix): Matrix => {
    const det = a * d - b * c;
    return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
};

const expectPoint = (actual: Point, expected: Point) => {
    expect(actual.x).toBeCloseTo(expected.x, 6);
    expect(actual.y).toBeCloseTo(expected.y, 6);
};
const expectRect = (actual: EditRect, expected: EditRect) => {
    expect(actual.x).toBeCloseTo(expected.x, 6);
    expect(actual.y).toBeCloseTo(expected.y, 6);
    expect(actual.width).toBeCloseTo(expected.width, 6);
    expect(actual.height).toBeCloseTo(expected.height, 6);
};
const expectSameEdit = (actual: PhotoEdit, expected: PhotoEdit) => {
    expect(actual.rotation).toBe(expected.rotation);
    expect(actual.flipH).toBe(expected.flipH);
    expect(actual.aspect).toBe(expected.aspect);
    expectRect(actual.crop, expected.crop);
};

// A landscape photo whose sides split into whole pixels at every fraction the tests use.
const source: EditSize = { width: 400, height: 300 };
const unlimited = { maxArea: Infinity };
const edit = (rotation: QuarterTurn, flipH: boolean, crop: EditRect = IDENTITY_PHOTO_EDIT.crop): PhotoEdit => ({
    rotation,
    flipH,
    crop,
    aspect: 'free',
});

const ROTATIONS: QuarterTurn[] = [0, 90, 180, 270];
const COMBINATIONS = ROTATIONS.flatMap(rotation => [false, true].map(flipH => ({ rotation, flipH })));

// The part of the source an edit keeps: its output's corners taken back through the plan. A crop is
// axis-aligned in the displayed frame and turns are quarter turns, so it is an axis-aligned source rect.
const sourceRegion = (photo: EditSize, photoEdit: PhotoEdit) => {
    const plan = planPhotoEdit(photo, photoEdit, unlimited);
    const back = invert(plan.matrix);
    const corners = [
        { x: 0, y: 0 },
        { x: plan.width, y: 0 },
        { x: plan.width, y: plan.height },
        { x: 0, y: plan.height },
    ].map(corner => apply(back, corner));
    const xs = corners.map(p => p.x);
    const ys = corners.map(p => p.y);
    return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
};
const expectSameRegion = (actual: ReturnType<typeof sourceRegion>, expected: ReturnType<typeof sourceRegion>) => {
    expect(actual.left).toBeCloseTo(expected.left, 6);
    expect(actual.top).toBeCloseTo(expected.top, 6);
    expect(actual.right).toBeCloseTo(expected.right, 6);
    expect(actual.bottom).toBeCloseTo(expected.bottom, 6);
};

// Source points the transform tests follow: the four corners and one off-centre point, which tells
// a turn from a mirror where the corners alone could coincide.
const PROBES: Point[] = [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 400, y: 300 },
    { x: 0, y: 300 },
    { x: 100, y: 60 },
];

describe('CROP_ASPECTS', () => {
    it('lists the presets in the order the preset row shows them', () => {
        expect(CROP_ASPECTS).toEqual(['free', 'original', '1:1', '4:3', '3:4', '16:9', '9:16']);
    });
});

describe('isIdentityPhotoEdit', () => {
    it('treats no edit and the identity as unedited', () => {
        expect(isIdentityPhotoEdit(undefined)).toBe(true);
        expect(isIdentityPhotoEdit(null)).toBe(true);
        expect(isIdentityPhotoEdit(IDENTITY_PHOTO_EDIT)).toBe(true);
    });

    it('does not count a preset alone as an edit', () => {
        expect(isIdentityPhotoEdit({ ...IDENTITY_PHOTO_EDIT, aspect: '1:1' })).toBe(true);
    });

    it('ignores a crop a float away from the frame', () => {
        expect(isIdentityPhotoEdit(edit(0, false, { x: 0.00005, y: 0, width: 0.99995, height: 0.99999 }))).toBe(true);
    });

    it('counts a real crop, a turn and a mirror', () => {
        expect(isIdentityPhotoEdit(edit(0, false, { x: 0.001, y: 0, width: 0.999, height: 1 }))).toBe(false);
        expect(isIdentityPhotoEdit(edit(0, false, { x: 0, y: 0, width: 1, height: 0.99 }))).toBe(false);
        expect(isIdentityPhotoEdit(edit(90, false))).toBe(false);
        expect(isIdentityPhotoEdit(edit(0, true))).toBe(false);
        // Half a turn while mirrored is a vertical flip, not the original.
        expect(isIdentityPhotoEdit(edit(180, true))).toBe(false);
    });
});

describe('orientedSize', () => {
    it('swaps the sides for a quarter turn either way', () => {
        expect(orientedSize(source, 0)).toEqual({ width: 400, height: 300 });
        expect(orientedSize(source, 90)).toEqual({ width: 300, height: 400 });
        expect(orientedSize(source, 180)).toEqual({ width: 400, height: 300 });
        expect(orientedSize(source, 270)).toEqual({ width: 300, height: 400 });
    });
});

describe('planPhotoEdit', () => {
    it('copies an unedited photo pixel for pixel', () => {
        expect(planPhotoEdit(source, IDENTITY_PHOTO_EDIT)).toEqual({
            width: 400,
            height: 300,
            matrix: [1, 0, 0, 1, 0, 0],
        });
    });

    // Where each source corner of the 400 × 300 photo ends up, worked out from the pictures rather than
    // the matrices: a clockwise turn takes the top-left corner to the top-right, a mirror swaps left and
    // right, and the mirror happens before the turn.
    const CORNERS: Record<string, { size: EditSize; tl: Point; tr: Point; br: Point; bl: Point }> = {
        '0 unflipped': {
            size: { width: 400, height: 300 },
            tl: { x: 0, y: 0 },
            tr: { x: 400, y: 0 },
            br: { x: 400, y: 300 },
            bl: { x: 0, y: 300 },
        },
        '90 unflipped': {
            size: { width: 300, height: 400 },
            tl: { x: 300, y: 0 },
            tr: { x: 300, y: 400 },
            br: { x: 0, y: 400 },
            bl: { x: 0, y: 0 },
        },
        '180 unflipped': {
            size: { width: 400, height: 300 },
            tl: { x: 400, y: 300 },
            tr: { x: 0, y: 300 },
            br: { x: 0, y: 0 },
            bl: { x: 400, y: 0 },
        },
        '270 unflipped': {
            size: { width: 300, height: 400 },
            tl: { x: 0, y: 400 },
            tr: { x: 0, y: 0 },
            br: { x: 300, y: 0 },
            bl: { x: 300, y: 400 },
        },
        '0 flipped': {
            size: { width: 400, height: 300 },
            tl: { x: 400, y: 0 },
            tr: { x: 0, y: 0 },
            br: { x: 0, y: 300 },
            bl: { x: 400, y: 300 },
        },
        '90 flipped': {
            size: { width: 300, height: 400 },
            tl: { x: 300, y: 400 },
            tr: { x: 300, y: 0 },
            br: { x: 0, y: 0 },
            bl: { x: 0, y: 400 },
        },
        '180 flipped': {
            size: { width: 400, height: 300 },
            tl: { x: 0, y: 300 },
            tr: { x: 400, y: 300 },
            br: { x: 400, y: 0 },
            bl: { x: 0, y: 0 },
        },
        '270 flipped': {
            size: { width: 300, height: 400 },
            tl: { x: 0, y: 0 },
            tr: { x: 0, y: 400 },
            br: { x: 300, y: 400 },
            bl: { x: 300, y: 0 },
        },
    };

    it.each(COMBINATIONS)('lands the source corners where a $rotation° turn, flipped: $flipH, puts them', c => {
        const expected = CORNERS[`${c.rotation} ${c.flipH ? 'flipped' : 'unflipped'}`];
        const plan = planPhotoEdit(source, edit(c.rotation, c.flipH));

        expect({ width: plan.width, height: plan.height }).toEqual(expected.size);
        expectPoint(apply(plan.matrix, { x: 0, y: 0 }), expected.tl);
        expectPoint(apply(plan.matrix, { x: 400, y: 0 }), expected.tr);
        expectPoint(apply(plan.matrix, { x: 400, y: 300 }), expected.br);
        expectPoint(apply(plan.matrix, { x: 0, y: 300 }), expected.bl);
    });

    it('frames a crop of the turned photo onto the whole output', () => {
        // Turned 90°, the photo is 300 × 400 and this crop is its 150 × 200 at (60, 100). The displayed
        // point (X, Y) is the source point (Y, 300 − X), so the crop's top-left is source (100, 240) and
        // its bottom-right source (300, 90).
        const plan = planPhotoEdit(source, edit(90, false, { x: 0.2, y: 0.25, width: 0.5, height: 0.5 }));

        expect({ width: plan.width, height: plan.height }).toEqual({ width: 150, height: 200 });
        expectPoint(apply(plan.matrix, { x: 100, y: 240 }), { x: 0, y: 0 });
        expectPoint(apply(plan.matrix, { x: 100, y: 90 }), { x: 150, y: 0 });
        expectPoint(apply(plan.matrix, { x: 300, y: 90 }), { x: 150, y: 200 });
        expectPoint(apply(plan.matrix, { x: 300, y: 240 }), { x: 0, y: 200 });
    });

    it.each(COMBINATIONS)('shifts the whole picture by the crop at a $rotation° turn, flipped: $flipH', c => {
        const crop = { x: 0.25, y: 0.2, width: 0.5, height: 0.6 };
        const whole = planPhotoEdit(source, edit(c.rotation, c.flipH));
        const cropped = planPhotoEdit(source, edit(c.rotation, c.flipH, crop));
        const offset = { x: crop.x * whole.width, y: crop.y * whole.height };

        expect(cropped.width).toBeCloseTo(whole.width * crop.width, 6);
        expect(cropped.height).toBeCloseTo(whole.height * crop.height, 6);
        for (const p of PROBES) {
            const shown = apply(whole.matrix, p);
            expectPoint(apply(cropped.matrix, p), { x: shown.x - offset.x, y: shown.y - offset.y });
        }
    });

    it('scales a photo past the area cap down to fit it, keeping its shape', () => {
        // A 48 MP photo is about 2.9 times the iOS canvas limit.
        const large = { width: 8000, height: 6000 };
        const plan = planPhotoEdit(large, IDENTITY_PHOTO_EDIT);

        expect(plan.width * plan.height).toBeLessThanOrEqual(PHOTO_EDIT_MAX_AREA);
        expect(plan.width * plan.height).toBeGreaterThan(PHOTO_EDIT_MAX_AREA * 0.999);
        expect(plan.width / plan.height).toBeCloseTo(4 / 3, 3);
        expectPoint(apply(plan.matrix, { x: 0, y: 0 }), { x: 0, y: 0 });
        expectPoint(apply(plan.matrix, { x: 8000, y: 6000 }), { x: plan.width, y: plan.height });
    });

    it.each(COMBINATIONS)('keeps a cropped photo under the area cap at a $rotation° turn, flipped: $flipH', c => {
        const large = { width: 8000, height: 6000 };
        const crop = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
        const capped = planPhotoEdit(large, edit(c.rotation, c.flipH, crop));
        const full = planPhotoEdit(large, edit(c.rotation, c.flipH, crop), unlimited);

        expect(capped.width * capped.height).toBeLessThanOrEqual(PHOTO_EDIT_MAX_AREA);
        // The capped output is the uncapped one shrunk: every source point lands at the same fraction.
        for (const p of [
            { x: 0, y: 0 },
            { x: 8000, y: 6000 },
            { x: 2500, y: 1300 },
        ]) {
            const at = apply(full.matrix, p);
            expectPoint(apply(capped.matrix, p), {
                x: (at.x * capped.width) / full.width,
                y: (at.y * capped.height) / full.height,
            });
        }
    });

    it('honours a cap on the long edge', () => {
        const plan = planPhotoEdit({ width: 4000, height: 3000 }, IDENTITY_PHOTO_EDIT, { maxEdge: 2048 });
        expect({ width: plan.width, height: plan.height }).toEqual({ width: 2048, height: 1536 });
        expectPoint(apply(plan.matrix, { x: 4000, y: 3000 }), { x: 2048, y: 1536 });
    });

    it('never scales a photo up', () => {
        const plan = planPhotoEdit({ width: 100, height: 50 }, IDENTITY_PHOTO_EDIT, {
            maxArea: Infinity,
            maxEdge: 4096,
        });
        expect(plan).toEqual({ width: 100, height: 50, matrix: [1, 0, 0, 1, 0, 0] });
    });

    it('snaps the crop to whole source pixels so an unscaled export does not resample', () => {
        // A third of 1000 px is 333.3: the crop snaps to 333 pixels, starting at pixel 333.
        const plan = planPhotoEdit(
            { width: 1000, height: 1000 },
            edit(0, false, { x: 1 / 3, y: 1 / 3, width: 1 / 3, height: 1 / 3 })
        );
        expect(plan).toEqual({ width: 333, height: 333, matrix: [1, 0, 0, 1, -333, -333] });
    });

    it('gives a crop the same pixel size wherever it sits', () => {
        // 0.5625 of 400 is 225 pixels; at these positions the crop's edges fall on half pixels.
        const sizes = [0.21875, 0.21875 - 1e-15, 0.21875 + 1e-15, 0.4375].map(y => {
            const plan = planPhotoEdit(source, edit(90, false, { x: 0, y, width: 1, height: 0.5625 }));
            return plan.height;
        });
        expect(sizes).toEqual([225, 225, 225, 225]);
    });

    it('keeps at least one pixel of a crop squeezed to nothing', () => {
        const plan = planPhotoEdit(source, edit(0, false, { x: 1, y: 0.5, width: 0, height: 0 }));
        expect({ width: plan.width, height: plan.height }).toEqual({ width: 1, height: 1 });
        // The pixel kept is the last column, the one the crop pointed at.
        expectPoint(apply(plan.matrix, { x: 399, y: 150 }), { x: 0, y: 0 });
    });

    it('returns a one-pixel plan for a photo with no usable size', () => {
        for (const size of [
            { width: 0, height: 300 },
            { width: Number.NaN, height: 300 },
            { width: 400, height: -1 },
            { width: Infinity, height: 300 },
        ]) {
            const plan = planPhotoEdit(size, edit(90, true));
            expect(plan.width).toBe(1);
            expect(plan.height).toBe(1);
            expect(plan.matrix.every(Number.isFinite)).toBe(true);
        }
    });

    it('draws the whole photo for a crop that is not a number', () => {
        const plan = planPhotoEdit(source, edit(0, false, { x: Number.NaN, y: 0, width: 0.5, height: Number.NaN }));
        expect(plan).toEqual({ width: 400, height: 300, matrix: [1, 0, 0, 1, 0, 0] });
    });

    it('pulls a crop that overflows the frame back inside it', () => {
        const plan = planPhotoEdit(source, edit(0, false, { x: -0.5, y: 0.5, width: 2, height: 2 }));
        expect(plan).toEqual({ width: 400, height: 150, matrix: [1, 0, 0, 1, 0, -150] });
    });

    it('falls back to the default caps for limits that are not positive numbers', () => {
        const large = { width: 8000, height: 6000 };
        const expected = planPhotoEdit(large, IDENTITY_PHOTO_EDIT);
        expect(planPhotoEdit(large, IDENTITY_PHOTO_EDIT, { maxArea: Number.NaN, maxEdge: 0 })).toEqual(expected);
    });
});

// A spread of edits the toolbar tests start from: every turn and mirror, with an off-centre crop.
const STARTS = COMBINATIONS.map(
    ({ rotation, flipH }): PhotoEdit => ({
        rotation,
        flipH,
        crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
        aspect: '4:3',
    })
);

describe('rotatePhotoEditLeft', () => {
    it('steps the turn back a quarter at a time', () => {
        let current = IDENTITY_PHOTO_EDIT;
        const turns: QuarterTurn[] = [];
        for (let i = 0; i < 4; i += 1) {
            current = rotatePhotoEditLeft(current);
            turns.push(current.rotation);
        }
        expect(turns).toEqual([270, 180, 90, 0]);
    });

    it.each(STARTS)('comes back to the same edit after four turns from $rotation°, flipped: $flipH', start => {
        const back = [1, 2, 3, 4].reduce(current => rotatePhotoEditLeft(current), start);
        expectSameEdit(back, start);
    });

    it.each(STARTS)('turns the displayed picture a quarter left from $rotation°, flipped: $flipH', start => {
        // Turned left, a point at (X, Y) of a W-wide picture moves to (Y, W − X): what was the top-right
        // corner is now the top-left one. The crop turns with the picture, so it is the same picture.
        const before = planPhotoEdit(source, start, unlimited);
        const after = planPhotoEdit(source, rotatePhotoEditLeft(start), unlimited);

        expect({ width: after.width, height: after.height }).toEqual({ width: before.height, height: before.width });
        for (const p of PROBES) {
            const was = apply(before.matrix, p);
            expectPoint(apply(after.matrix, p), { x: was.y, y: before.width - was.x });
        }
    });

    it.each(STARTS)('keeps framing the same part of the photo from $rotation°, flipped: $flipH', start => {
        expectSameRegion(sourceRegion(source, rotatePhotoEditLeft(start)), sourceRegion(source, start));
    });

    it('turns a preset that names a shape into the turned shape', () => {
        const aspectAfter = (aspect: PhotoEdit['aspect']) =>
            rotatePhotoEditLeft({ ...IDENTITY_PHOTO_EDIT, aspect }).aspect;
        expect(aspectAfter('4:3')).toBe('3:4');
        expect(aspectAfter('3:4')).toBe('4:3');
        expect(aspectAfter('16:9')).toBe('9:16');
        expect(aspectAfter('9:16')).toBe('16:9');
        expect(aspectAfter('1:1')).toBe('1:1');
        expect(aspectAfter('original')).toBe('original');
        expect(aspectAfter('free')).toBe('free');
    });

    it('keeps a 4:3 crop the same shape on the photo, now drawn 3:4', () => {
        const wide = setPhotoEditAspect(IDENTITY_PHOTO_EDIT, '4:3', { width: 1000, height: 1000 });
        const turned = planPhotoEdit({ width: 1000, height: 1000 }, rotatePhotoEditLeft(wide));
        expect(turned.width / turned.height).toBeCloseTo(3 / 4, 2);
    });
});

describe('flipPhotoEditHorizontal', () => {
    it.each(STARTS)('comes back to the same edit after two flips from $rotation°, flipped: $flipH', start => {
        expectSameEdit(flipPhotoEditHorizontal(flipPhotoEditHorizontal(start)), start);
    });

    it.each(STARTS)('mirrors the displayed picture left-right from $rotation°, flipped: $flipH', start => {
        // Whatever the turn, the point at (X, Y) of a W-wide picture moves to (W − X, Y).
        const before = planPhotoEdit(source, start, unlimited);
        const after = planPhotoEdit(source, flipPhotoEditHorizontal(start), unlimited);

        expect({ width: after.width, height: after.height }).toEqual({ width: before.width, height: before.height });
        for (const p of PROBES) {
            const was = apply(before.matrix, p);
            expectPoint(apply(after.matrix, p), { x: before.width - was.x, y: was.y });
        }
    });

    it.each(STARTS)('keeps framing the same part of the photo from $rotation°, flipped: $flipH', start => {
        expectSameRegion(sourceRegion(source, flipPhotoEditHorizontal(start)), sourceRegion(source, start));
    });

    it('negates the turn and mirrors the crop', () => {
        const flipped = flipPhotoEditHorizontal(STARTS[2]); // 90°, unflipped
        expect(flipped.rotation).toBe(270);
        expect(flipped.flipH).toBe(true);
        expect(flipped.aspect).toBe('4:3');
        expectRect(flipped.crop, { x: 0.4, y: 0.2, width: 0.5, height: 0.4 });
    });
});

describe('turning and mirroring together', () => {
    it.each(STARTS)('frames the same part of the photo in either order from $rotation°, flipped: $flipH', start => {
        const region = sourceRegion(source, start);
        expectSameRegion(sourceRegion(source, flipPhotoEditHorizontal(rotatePhotoEditLeft(start))), region);
        expectSameRegion(sourceRegion(source, rotatePhotoEditLeft(flipPhotoEditHorizontal(start))), region);
    });

    it.each(STARTS)('shows the turned picture mirrored, from $rotation°, flipped: $flipH', start => {
        // A turn then a mirror is the turned picture's mirror image, wherever the edit started.
        const turned = planPhotoEdit(source, rotatePhotoEditLeft(start), unlimited);
        const both = planPhotoEdit(source, flipPhotoEditHorizontal(rotatePhotoEditLeft(start)), unlimited);
        for (const p of PROBES) {
            const was = apply(turned.matrix, p);
            expectPoint(apply(both.matrix, p), { x: turned.width - was.x, y: was.y });
        }
    });

    it('turns left then mirrors to the same picture as mirroring then turning right', () => {
        // Mirror ∘ turn-left = turn-right ∘ mirror; a right turn is three left ones.
        const start = STARTS[3]; // 90°, flipped
        const a = flipPhotoEditHorizontal(rotatePhotoEditLeft(start));
        const b = [1, 2, 3].reduce(current => rotatePhotoEditLeft(current), flipPhotoEditHorizontal(start));
        expectSameEdit(a, b);
    });
});

describe('cropAspectRatio', () => {
    it('gives each fixed preset its pixel ratio', () => {
        expect(cropAspectRatio('1:1', source)).toBe(1);
        expect(cropAspectRatio('4:3', source)).toBeCloseTo(4 / 3);
        expect(cropAspectRatio('3:4', source)).toBeCloseTo(3 / 4);
        expect(cropAspectRatio('16:9', source)).toBeCloseTo(16 / 9);
        expect(cropAspectRatio('9:16', source)).toBeCloseTo(9 / 16);
    });

    it('reads the original ratio from the displayed size it is given', () => {
        expect(cropAspectRatio('original', orientedSize(source, 0))).toBeCloseTo(4 / 3);
        expect(cropAspectRatio('original', orientedSize(source, 90))).toBeCloseTo(3 / 4);
    });

    it('has no ratio for free, or for an original with no usable size', () => {
        expect(cropAspectRatio('free', source)).toBeNull();
        expect(cropAspectRatio('original', { width: 0, height: 300 })).toBeNull();
    });
});

describe('setPhotoEditAspect', () => {
    it('only records the free preset, leaving the crop as it is', () => {
        const start = { ...edit(0, false, { x: 0.1, y: 0.1, width: 0.3, height: 0.7 }), aspect: '1:1' as const };
        expect(setPhotoEditAspect(start, 'free', source)).toEqual({ ...start, aspect: 'free' });
    });

    it('fits the largest square of a landscape photo, centred', () => {
        const square = setPhotoEditAspect(IDENTITY_PHOTO_EDIT, '1:1', source);
        expect(square.aspect).toBe('1:1');
        expectRect(square.crop, { x: 0.125, y: 0, width: 0.75, height: 1 });
        const plan = planPhotoEdit(source, square);
        expect({ width: plan.width, height: plan.height }).toEqual({ width: 300, height: 300 });
    });

    it('measures the original ratio on the turned photo', () => {
        // Turned 90°, the displayed photo is 300 × 400, so "original" is 3:4 and fills it.
        const turnedSquare = setPhotoEditAspect(edit(90, false), '1:1', source);
        const original = setPhotoEditAspect(turnedSquare, 'original', source);
        expectRect(original.crop, { x: 0, y: 0, width: 1, height: 1 });

        const wide = planPhotoEdit(source, setPhotoEditAspect(edit(90, false), '4:3', source));
        expect({ width: wide.width, height: wide.height }).toEqual({ width: 300, height: 225 });
    });

    it('centres the fitted crop on the current crop', () => {
        const square = { width: 1000, height: 1000 };
        const start = edit(0, false, { x: 0.3, y: 0.3, width: 0.2, height: 0.2 });
        const wide = setPhotoEditAspect(start, '16:9', square);
        expectRect(wide.crop, { x: 0, y: 0.4 - 0.5625 / 2, width: 1, height: 0.5625 });
    });

    it('shifts a fitted crop that would overflow back inside the frame', () => {
        const start = edit(0, false, { x: 0.8, y: 0.8, width: 0.2, height: 0.2 });
        const square = setPhotoEditAspect(start, '1:1', source);
        expectRect(square.crop, { x: 0.25, y: 0, width: 0.75, height: 1 });
    });

    it('fits a tall preset on a landscape photo by its height', () => {
        const tall = planPhotoEdit(source, setPhotoEditAspect(IDENTITY_PHOTO_EDIT, '9:16', source));
        expect(tall.height).toBe(300);
        expect(tall.width / tall.height).toBeCloseTo(9 / 16, 2);
    });

    it('only records the preset for a photo with no usable size', () => {
        const start = edit(0, false, { x: 0.1, y: 0.1, width: 0.3, height: 0.7 });
        expect(setPhotoEditAspect(start, '1:1', { width: 0, height: 0 })).toEqual({ ...start, aspect: '1:1' });
    });
});
