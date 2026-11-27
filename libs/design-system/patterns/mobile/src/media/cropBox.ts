import type { EditRect } from './photoEdit';

export type CropHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'move';

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
    return insideFrame(moved);
};
