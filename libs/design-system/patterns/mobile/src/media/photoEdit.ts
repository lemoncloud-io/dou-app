export type QuarterTurn = 0 | 90 | 180 | 270;

export interface EditSize {
    width: number;
    height: number;
}

export interface EditRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export type CropAspect = 'free' | 'original' | '1:1' | '4:3' | '3:4' | '16:9' | '9:16';

export const CROP_ASPECTS: readonly CropAspect[] = ['free', 'original', '1:1', '4:3', '3:4', '16:9', '9:16'];

export interface PhotoEdit {
    rotation: QuarterTurn;
    flipH: boolean;
    crop: EditRect;
    aspect: CropAspect;
}

export const IDENTITY_PHOTO_EDIT: PhotoEdit = {
    rotation: 0,
    flipH: false,
    crop: { x: 0, y: 0, width: 1, height: 1 },
    aspect: 'free',
};

const CROP_EPSILON = 1e-4;

export const PHOTO_EDIT_MAX_AREA = 16_777_216;

const FLOOR_SLACK = 1e-6;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const isUsableSize = (size: EditSize): boolean =>
    Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0;

const toQuarterTurn = (degrees: number): QuarterTurn => {
    const quarters = Number.isFinite(degrees) ? Math.round(degrees / 90) : 0;
    return ((((quarters % 4) + 4) % 4) * 90) as QuarterTurn;
};

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

export const orientedSize = (source: EditSize, rotation: QuarterTurn): EditSize =>
    toQuarterTurn(rotation) % 180 === 0
        ? { width: source.width, height: source.height }
        : { width: source.height, height: source.width };

const TURNED_ASPECT: Partial<Record<CropAspect, CropAspect>> = {
    '4:3': '3:4',
    '3:4': '4:3',
    '16:9': '9:16',
    '9:16': '16:9',
};

export const rotatePhotoEditLeft = (edit: PhotoEdit): PhotoEdit => {
    const crop = clampCrop(edit.crop);
    return {
        rotation: toQuarterTurn(edit.rotation + 270),
        flipH: Boolean(edit.flipH),
        crop: clampCrop({ x: crop.y, y: 1 - crop.x - crop.width, width: crop.height, height: crop.width }),
        aspect: TURNED_ASPECT[edit.aspect] ?? edit.aspect,
    };
};

export const flipPhotoEditHorizontal = (edit: PhotoEdit): PhotoEdit => {
    const crop = clampCrop(edit.crop);
    return {
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

export const cropAspectRatio = (aspect: CropAspect, displayed: EditSize): number | null => {
    if (aspect === 'original') return isUsableSize(displayed) ? displayed.width / displayed.height : null;
    return PRESET_RATIOS[aspect] ?? null;
};

export const setPhotoEditAspect = (edit: PhotoEdit, aspect: CropAspect, source: EditSize): PhotoEdit => {
    const displayed = orientedSize(source, edit.rotation);
    const ratio = cropAspectRatio(aspect, displayed);
    if (ratio === null || !isUsableSize(displayed)) return { ...edit, aspect };

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
    width: number;
    height: number;
    matrix: [number, number, number, number, number, number];
}

type Matrix = PhotoEditPlan['matrix'];

const turnMatrix = (rotation: QuarterTurn, { width: w, height: h }: EditSize): Matrix => {
    switch (rotation) {
        case 90:
            return [0, 1, -1, 0, h, 0];
        case 180:
            return [-1, 0, 0, -1, w, h];
        case 270:
            return [0, -1, 1, 0, 0, w];
        default:
            return [1, 0, 0, 1, 0, 0];
    }
};

const pixelSpan = (start: number, length: number, total: number): [number, number] => {
    const size = clamp(Math.round(length * total), Math.min(1, total), total);
    return [clamp(Math.round(start * total), 0, total - size), size];
};

const outputLength = (length: number, scale: number): number =>
    Math.max(1, scale < 1 ? Math.floor(length * scale + FLOOR_SLACK) : Math.round(length));

const positiveOr = (value: number | undefined, fallback: number): number =>
    typeof value === 'number' && value > 0 ? value : fallback;

const unsigned = (value: number): number => (value === 0 ? 0 : value);

export const planPhotoEdit = (
    source: EditSize,
    edit: PhotoEdit,
    limits: { maxArea?: number; maxEdge?: number } = {}
): PhotoEditPlan => {
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
    const scaleX = width / cropWidth;
    const scaleY = height / cropHeight;

    const [a, b, c, d, e, f] = turnMatrix(rotation, source);
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
