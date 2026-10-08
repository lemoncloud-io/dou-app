/**
 * The crop box's drag arithmetic, apart from pointer events so it can be checked on its own.
 *
 * Everything is in the displayed frame's normalised units (0..1 each way) — the space `PhotoEdit.crop`
 * is stored in. A ratio is normalised the same way, a pixel ratio times displayed.height /
 * displayed.width, so a square crop on a wide photo has a ratio below 1. The pointer's delta is
 * measured from where the drag began and applied to the rect as it was then, so a drag never
 * accumulates rounding from one move to the next.
 */
import type { EditRect } from './photoEdit';

export type CropHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'move';

/** Which way each handle's edges face: +1 is the right or bottom edge, −1 the left or top, 0 neither. */
const HANDLE_SIDES: Record<Exclude<CropHandle, 'move'>, { x: -1 | 0 | 1; y: -1 | 0 | 1 }> = {
    n: { x: 0, y: -1 },
    s: { x: 0, y: 1 },
    e: { x: 1, y: 0 },
    w: { x: -1, y: 0 },
    ne: { x: 1, y: -1 },
    nw: { x: -1, y: -1 },
    se: { x: 1, y: 1 },
    sw: { x: -1, y: 1 },
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const finiteOr = (value: number, fallback: number): number => (Number.isFinite(value) ? value : fallback);

/** A rect pulled inside the frame; an axis whose numbers are not finite becomes the full span. */
const insideFrame = (rect: EditRect): EditRect => {
    const axis = (start: number, length: number): [number, number] => {
        if (!Number.isFinite(start) || !Number.isFinite(length)) return [0, 1];
        const from = clamp(start, 0, 1);
        return [from, clamp(length, 0, 1 - from)];
    };
    const [x, width] = axis(rect.x, rect.width);
    const [y, height] = axis(rect.y, rect.height);
    return { x, y, width, height };
};

interface Limits {
    minWidth: number;
    minHeight: number;
}

/** Without a ratio each edge a handle carries moves on its own, stopping at the frame and at the minimum. */
const dragFree = (rect: EditRect, sides: { x: number; y: number }, dx: number, dy: number, limits: Limits) => {
    let left = rect.x;
    let top = rect.y;
    let right = rect.x + rect.width;
    let bottom = rect.y + rect.height;
    if (sides.x < 0) left = clamp(left + dx, 0, Math.max(0, right - limits.minWidth));
    if (sides.x > 0) right = clamp(right + dx, Math.min(1, left + limits.minWidth), 1);
    if (sides.y < 0) top = clamp(top + dy, 0, Math.max(0, bottom - limits.minHeight));
    if (sides.y > 0) bottom = clamp(bottom + dy, Math.min(1, top + limits.minHeight), 1);
    return { x: left, y: top, width: right - left, height: bottom - top };
};

/**
 * A corner with a ratio: the opposite corner stays put, and the size follows whichever axis the
 * pointer moved further along (compared in width units), so a mostly sideways drag is not overruled
 * by a little vertical wobble.
 */
const dragLockedCorner = (
    rect: EditRect,
    sides: { x: number; y: number },
    dx: number,
    dy: number,
    ratio: number,
    limits: Limits
): EditRect => {
    const anchorX = sides.x > 0 ? rect.x : rect.x + rect.width;
    const anchorY = sides.y > 0 ? rect.y : rect.y + rect.height;
    const followsX = Math.abs(dx) >= Math.abs(dy * ratio);
    const wanted = followsX ? rect.width + sides.x * dx : (rect.height + sides.y * dy) * ratio;
    const room = Math.min(sides.x > 0 ? 1 - anchorX : anchorX, (sides.y > 0 ? 1 - anchorY : anchorY) * ratio);
    // Staying inside the frame wins over the minimum when there is no room for both.
    const least = Math.min(room, Math.max(limits.minWidth, limits.minHeight * ratio));
    const width = clamp(wanted, least, room);
    const height = width / ratio;
    return {
        x: sides.x > 0 ? anchorX : anchorX - width,
        y: sides.y > 0 ? anchorY : anchorY - height,
        width,
        height,
    };
};

/**
 * An edge with a ratio: the dragged edge sets that side, the opposite edge stays put, and the other
 * side grows evenly about the rect's centre. Where that would cross the frame, the rect is shifted
 * back in rather than stopped, so a box against the top of the photo can still be widened.
 */
const dragLockedEdge = (
    rect: EditRect,
    sides: { x: number; y: number },
    dx: number,
    dy: number,
    ratio: number,
    limits: Limits
): EditRect => {
    if (sides.x !== 0) {
        const anchorX = sides.x > 0 ? rect.x : rect.x + rect.width;
        // The height is capped at the frame's, which caps the width at the ratio.
        const room = Math.min(sides.x > 0 ? 1 - anchorX : anchorX, ratio);
        const least = Math.min(room, Math.max(limits.minWidth, limits.minHeight * ratio));
        const width = clamp(rect.width + sides.x * dx, least, room);
        const height = width / ratio;
        const centreY = rect.y + rect.height / 2;
        return {
            x: sides.x > 0 ? anchorX : anchorX - width,
            y: clamp(centreY - height / 2, 0, 1 - height),
            width,
            height,
        };
    }
    const anchorY = sides.y > 0 ? rect.y : rect.y + rect.height;
    const room = Math.min(sides.y > 0 ? 1 - anchorY : anchorY, 1 / ratio);
    const least = Math.min(room, Math.max(limits.minHeight, limits.minWidth / ratio));
    const height = clamp(rect.height + sides.y * dy, least, room);
    const width = height * ratio;
    const centreX = rect.x + rect.width / 2;
    return {
        x: clamp(centreX - width / 2, 0, 1 - width),
        y: sides.y > 0 ? anchorY : anchorY - height,
        width,
        height,
    };
};

/** Applies a pointer drag (dx, dy in normalised displayed units) to `start`. Keeps the rect inside
 *  0..1, keeps width/height >= min, and for a non-null `ratio` (normalised width/height, i.e. pixel
 *  ratio · displayed.height / displayed.width) keeps that ratio — corner handles follow the larger
 *  movement, edge handles grow the other side symmetrically about the centre. 'move' translates
 *  and clamps. */
export const dragCropRect = (
    start: EditRect,
    handle: CropHandle,
    delta: { dx: number; dy: number },
    options: { ratio: number | null; min: { width: number; height: number } }
): EditRect => {
    const rect = insideFrame(start);
    const dx = finiteOr(delta.dx, 0);
    const dy = finiteOr(delta.dy, 0);

    if (handle === 'move') {
        return {
            ...rect,
            x: clamp(rect.x + dx, 0, 1 - rect.width),
            y: clamp(rect.y + dy, 0, 1 - rect.height),
        };
    }

    const limits: Limits = {
        minWidth: clamp(finiteOr(options.min.width, 0), 0, 1),
        minHeight: clamp(finiteOr(options.min.height, 0), 0, 1),
    };
    const ratio = options.ratio !== null && Number.isFinite(options.ratio) && options.ratio > 0 ? options.ratio : null;
    const sides = HANDLE_SIDES[handle];
    const moved =
        ratio === null
            ? dragFree(rect, sides, dx, dy, limits)
            : sides.x !== 0 && sides.y !== 0
              ? dragLockedCorner(rect, sides, dx, dy, ratio, limits)
              : dragLockedEdge(rect, sides, dx, dy, ratio, limits);
    // Float error at the frame's edge (an x + width a hair past 1) is pulled back in.
    return insideFrame(moved);
};
