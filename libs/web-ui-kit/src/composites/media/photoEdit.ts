/**
 * A photo's crop, quarter turn and mirror, kept as instructions rather than pixels, and the one
 * transform that turns those instructions into an output — apart from the DOM so the geometry can be
 * checked on its own.
 *
 * An edit reads in one fixed order against the photo as decoded (EXIF orientation already applied):
 * mirror the source left-right when `flipH`, then turn it `rotation` degrees clockwise — that is the
 * displayed image — then keep `crop` of it. The crop is normalised to the displayed frame (0..1 each
 * way), so it means the same region at any rendition size, and the editor, the preview and the export
 * at send all read the same edit through `planPhotoEdit`.
 *
 * The toolbar's actions are defined on what the user sees, not on the stored fields: "rotate left"
 * and "flip" each act on the displayed image whatever is already applied, and both keep the crop
 * framing the same part of the photo.
 */

/** Clockwise quarter turns of the displayed image, in degrees. */
export type QuarterTurn = 0 | 90 | 180 | 270;

export interface EditSize {
    width: number;
    height: number;
}

/** A rectangle in normalised coordinates (0..1) of the DISPLAYED frame — after flip and rotation. */
export interface EditRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export type CropAspect = 'free' | 'original' | '1:1' | '4:3' | '3:4' | '16:9' | '9:16';

/** The presets in the order the editor's preset row shows them. */
export const CROP_ASPECTS: readonly CropAspect[] = ['free', 'original', '1:1', '4:3', '3:4', '16:9', '9:16'];

/**
 * Canonical meaning: displayed = rotate(rotation clockwise, flipH ? mirrorX(source) : source);
 * the output is `crop` of displayed. `source` is the photo as decoded (EXIF orientation already
 * applied by the browser), measured in pixels.
 */
export interface PhotoEdit {
    rotation: QuarterTurn;
    flipH: boolean;
    crop: EditRect;
    /** The preset the crop box is locked to. A label for the editor; it changes no pixel on its own. */
    aspect: CropAspect;
}

export const IDENTITY_PHOTO_EDIT: PhotoEdit = {
    rotation: 0,
    flipH: false,
    crop: { x: 0, y: 0, width: 1, height: 1 },
    aspect: 'free',
};

/**
 * How far a crop edge may sit from the frame's edge and still count as uncropped. A crop box dragged
 * back to the edge lands a float's breadth away from it, and that must not cost a re-encode at send.
 */
const CROP_EPSILON = 1e-4;

/** The iOS WebKit canvas area limit; past it a canvas draws nothing, without an error. */
export const PHOTO_EDIT_MAX_AREA = 16_777_216;

/**
 * Slack added before flooring a scaled-down length, so float error (4095.9999999 for 4096) does not
 * cost a pixel. Far below a pixel, so it cannot carry a length past a whole-number cap.
 */
const FLOOR_SLACK = 1e-6;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const isUsableSize = (size: EditSize): boolean =>
    Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0;

/** Any number of degrees as the nearest quarter turn, so arithmetic on it never leaves 0/90/180/270. */
const toQuarterTurn = (degrees: number): QuarterTurn => {
    const quarters = Number.isFinite(degrees) ? Math.round(degrees / 90) : 0;
    return ((((quarters % 4) + 4) % 4) * 90) as QuarterTurn;
};

/**
 * One axis of a crop pulled inside the frame. An axis whose numbers are not finite falls back to the
 * full span, so a corrupted edit draws the whole photo rather than nothing.
 */
const clampSpan = (start: number, length: number): [number, number] => {
    if (!Number.isFinite(start) || !Number.isFinite(length)) return [0, 1];
    const from = clamp(start, 0, 1);
    return [from, clamp(length, 0, 1 - from)];
};

const clampCrop = (crop: EditRect | null | undefined): EditRect => {
    if (!crop) return { x: 0, y: 0, width: 1, height: 1 };
    const [x, width] = clampSpan(crop.x, crop.width);
    const [y, height] = clampSpan(crop.y, crop.height);
    return { x, y, width, height };
};

/** True for undefined/null too. Crop compared with a small epsilon (1e-4). Aspect alone does not count as an edit. */
export const isIdentityPhotoEdit = (edit: PhotoEdit | null | undefined): boolean => {
    if (!edit) return true;
    if (toQuarterTurn(edit.rotation) !== 0 || edit.flipH) return false;
    const crop = clampCrop(edit.crop);
    return (
        crop.x <= CROP_EPSILON &&
        crop.y <= CROP_EPSILON &&
        crop.width >= 1 - CROP_EPSILON &&
        crop.height >= 1 - CROP_EPSILON
    );
};

/** The displayed frame's size: a quarter turn either way swaps the sides. */
export const orientedSize = (source: EditSize, rotation: QuarterTurn): EditSize =>
    toQuarterTurn(rotation) % 180 === 0
        ? { width: source.width, height: source.height }
        : { width: source.height, height: source.width };

/** A turned frame swaps its sides, so a preset that names a shape names the turned one after it. */
const TURNED_ASPECT: Partial<Record<CropAspect, CropAspect>> = {
    '4:3': '3:4',
    '3:4': '4:3',
    '16:9': '9:16',
    '9:16': '16:9',
};

/** Rotates the DISPLAYED image 90° counter-clockwise: rotation' = (r + 270) % 360, crop remapped so it
 *  keeps framing the same content, aspect preset swapped (4:3<->3:4, 16:9<->9:16). */
export const rotatePhotoEditLeft = (edit: PhotoEdit): PhotoEdit => {
    const crop = clampCrop(edit.crop);
    return {
        // The turn is added on the displayed side of the flip, so it composes the same way flipped or not.
        rotation: toQuarterTurn(edit.rotation + 270),
        flipH: Boolean(edit.flipH),
        // Turned left, the point (u, v) of the frame lands at (v, 1 − u): the crop's top edge becomes its
        // left edge, and its right edge becomes its top.
        crop: clampCrop({ x: crop.y, y: 1 - crop.x - crop.width, width: crop.height, height: crop.width }),
        aspect: TURNED_ASPECT[edit.aspect] ?? edit.aspect,
    };
};

/** Mirrors the DISPLAYED image left-right whatever the rotation: flipH' = !flipH,
 *  rotation' = (360 - r) % 360, crop.x' = 1 - x - width. */
export const flipPhotoEditHorizontal = (edit: PhotoEdit): PhotoEdit => {
    const crop = clampCrop(edit.crop);
    return {
        // The stored flip sits on the source side of the turn. Mirroring after a turn is the same as
        // mirroring first and turning the other way, which is why the turn is negated.
        rotation: toQuarterTurn(360 - edit.rotation),
        flipH: !edit.flipH,
        crop: clampCrop({ ...crop, x: 1 - crop.x - crop.width }),
        aspect: edit.aspect,
    };
};

const PRESET_RATIOS: Partial<Record<CropAspect, number>> = {
    '1:1': 1,
    '4:3': 4 / 3,
    '3:4': 3 / 4,
    '16:9': 16 / 9,
    '9:16': 9 / 16,
};

/** Pixel width/height ratio of a preset for this displayed size; null for 'free'. */
export const cropAspectRatio = (aspect: CropAspect, displayed: EditSize): number | null => {
    if (aspect === 'original') return isUsableSize(displayed) ? displayed.width / displayed.height : null;
    return PRESET_RATIOS[aspect] ?? null;
};

/** Sets the preset and fits the crop: the largest rect of that ratio, centred on the current crop's
 *  centre, inside 0..1 (shifted in, never overflowing). 'free' only records the preset. */
export const setPhotoEditAspect = (edit: PhotoEdit, aspect: CropAspect, source: EditSize): PhotoEdit => {
    const displayed = orientedSize(source, edit.rotation);
    const ratio = cropAspectRatio(aspect, displayed);
    if (ratio === null || !isUsableSize(displayed)) return { ...edit, aspect };

    // The ratio in normalised units: a pixel square on a wide photo is a tall rect of the 0..1 frame.
    const normalised = (ratio * displayed.height) / displayed.width;
    const width = normalised >= 1 ? 1 : normalised;
    const height = normalised >= 1 ? 1 / normalised : 1;
    const crop = clampCrop(edit.crop);
    const centreX = crop.x + crop.width / 2;
    const centreY = crop.y + crop.height / 2;
    return {
        ...edit,
        aspect,
        crop: {
            x: clamp(centreX - width / 2, 0, 1 - width),
            y: clamp(centreY - height / 2, 0, 1 - height),
            width,
            height,
        },
    };
};

export interface PhotoEditPlan {
    /** Output pixel size (rounded, >= 1). */
    width: number;
    height: number;
    /** Maps a SOURCE pixel (x, y) to an OUTPUT pixel: X = a·x + c·y + e, Y = b·x + d·y + f —
     *  the argument order of both CSS `matrix()` and `CanvasRenderingContext2D.setTransform`. */
    matrix: [number, number, number, number, number, number];
}

type Matrix = PhotoEditPlan['matrix'];

/** Where a clockwise turn sends the point (x, y) of a w × h source, in the turned frame. */
const turnMatrix = (rotation: QuarterTurn, { width: w, height: h }: EditSize): Matrix => {
    switch (rotation) {
        case 90:
            return [0, 1, -1, 0, h, 0]; // (x, y) → (h − y, x)
        case 180:
            return [-1, 0, 0, -1, w, h]; // (x, y) → (w − x, h − y)
        case 270:
            return [0, -1, 1, 0, 0, w]; // (x, y) → (y, w − x)
        default:
            return [1, 0, 0, 1, 0, 0];
    }
};

/**
 * A normalised span as whole pixels of a `total`-pixel side: `[start, length]`. Snapping to the pixel
 * grid means an unscaled export copies pixels one to one, instead of resampling the whole photo by a
 * fraction of a pixel and softening it. The length is rounded on its own rather than as the gap
 * between two rounded edges, so a crop's pixel size does not depend on where it sits — a centred 4:3
 * box whose edges fall on half pixels would otherwise come out a pixel taller. At least one pixel is
 * kept so the output is never empty.
 */
const pixelSpan = (start: number, length: number, total: number): [number, number] => {
    const size = clamp(Math.round(length * total), Math.min(1, total), total);
    return [clamp(Math.round(start * total), 0, total - size), size];
};

/**
 * A crop length at the output's scale. Scaled down, it is floored rather than rounded so the area and
 * edge caps still hold once both sides are whole pixels.
 */
const outputLength = (length: number, scale: number): number =>
    Math.max(1, scale < 1 ? Math.floor(length * scale + FLOOR_SLACK) : Math.round(length));

const positiveOr = (value: number | undefined, fallback: number): number =>
    typeof value === 'number' && value > 0 ? value : fallback;

/** `-0` reads as `0` everywhere else, but not to a strict equality check on the tuple. */
const unsigned = (value: number): number => (value === 0 ? 0 : value);

/** Output size and transform. Scales down uniformly so width·height <= maxArea and max edge <= maxEdge
 *  (defaults: PHOTO_EDIT_MAX_AREA, Infinity). Never scales up. */
export const planPhotoEdit = (
    source: EditSize,
    edit: PhotoEdit,
    limits: { maxArea?: number; maxEdge?: number } = {}
): PhotoEditPlan => {
    // Nothing to draw: a one-pixel plan keeps a caller's canvas valid instead of throwing.
    if (!isUsableSize(source)) return { width: 1, height: 1, matrix: [1, 0, 0, 1, 0, 0] };

    const maxArea = positiveOr(limits.maxArea, PHOTO_EDIT_MAX_AREA);
    const maxEdge = positiveOr(limits.maxEdge, Infinity);
    const rotation = toQuarterTurn(edit.rotation);
    const displayed = orientedSize(source, rotation);
    const crop = clampCrop(edit.crop);
    const [left, cropWidth] = pixelSpan(crop.x, crop.width, displayed.width);
    const [top, cropHeight] = pixelSpan(crop.y, crop.height, displayed.height);

    const scale = Math.min(1, maxEdge / Math.max(cropWidth, cropHeight), Math.sqrt(maxArea / (cropWidth * cropHeight)));
    const width = outputLength(cropWidth, scale);
    const height = outputLength(cropHeight, scale);
    // The scale is uniform up to the rounding of each side to whole pixels; taking it per axis from
    // the rounded size makes the crop fill the output exactly, with no unpainted sliver at an edge.
    const scaleX = width / cropWidth;
    const scaleY = height / cropHeight;

    const [a, b, c, d, e, f] = turnMatrix(rotation, source);
    // Mirroring the source first, (x, y) → (w − x, y), folds into the turn as a negated x column.
    const [ta, tb, tc, td, te, tf]: Matrix = edit.flipH
        ? [-a, -b, c, d, a * source.width + e, b * source.width + f]
        : [a, b, c, d, e, f];

    return {
        width,
        height,
        matrix: [
            unsigned(scaleX * ta),
            unsigned(scaleY * tb),
            unsigned(scaleX * tc),
            unsigned(scaleY * td),
            unsigned(scaleX * (te - left)),
            unsigned(scaleY * (tf - top)),
        ],
    };
};
