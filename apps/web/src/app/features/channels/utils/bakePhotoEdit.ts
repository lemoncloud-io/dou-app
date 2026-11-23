import { decodeImage, encodeTypeFor, toUploadFile, type DecodedImage, type UploadableType } from '@chatic/shared';
import { IDENTITY_PHOTO_EDIT, planPhotoEdit, type PhotoEdit, type PhotoEditPlan } from '@chatic/web-ui-kit';

export const EDIT_RENDITION_MAX_EDGE = 2048;

export const BAKE_QUALITY = 0.9;
const RENDITION_QUALITY = 0.85;

export const EDIT_SUFFIX = '-edit';

export interface EditRendition {
    src: string;
    width: number;
    height: number;
}

const isGif = (file: File) => file.type === 'image/gif';

const draw = (decoded: DecodedImage, plan: PhotoEditPlan, canvas: HTMLCanvasElement, type: UploadableType) => {
    canvas.width = plan.width;
    canvas.height = plan.height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, plan.width, plan.height);
    if (type === 'image/jpeg') {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, plan.width, plan.height);
    }
    context.setTransform(...plan.matrix);
    context.drawImage(decoded.image, 0, 0, decoded.width, decoded.height);
    return context;
};

const encode = (canvas: HTMLCanvasElement, type: UploadableType, quality: number): Promise<Blob | null> =>
    new Promise(resolve => canvas.toBlob(resolve, type, quality));

const render = async (
    decoded: DecodedImage,
    plan: PhotoEditPlan,
    type: UploadableType,
    quality: number
): Promise<{ blob: Blob; type: UploadableType } | null> => {
    const canvas = document.createElement('canvas');
    try {
        if (!draw(decoded, plan, canvas, type)) return null;
        const blob = await encode(canvas, type, quality);
        if (!blob) return null;
        if (blob.type === type) return { blob, type };
        if (type === 'image/jpeg') return null;
        if (!draw(decoded, plan, canvas, 'image/jpeg')) return null;
        const jpeg = await encode(canvas, 'image/jpeg', quality);
        return jpeg?.type === 'image/jpeg' ? { blob: jpeg, type: 'image/jpeg' } : null;
    } catch {
        return null;
    } finally {
        canvas.width = 0;
        canvas.height = 0;
    }
};

export const bakePhotoEdit = async (file: File, edit: PhotoEdit): Promise<File | null> => {
    if (isGif(file)) return null;
    const decoded = await decodeImage(file);
    if (!decoded) return null;
    const plan = planPhotoEdit({ width: decoded.width, height: decoded.height }, edit);
    const rendered = await render(decoded, plan, encodeTypeFor(file.type), BAKE_QUALITY);
    return rendered && toUploadFile(rendered.blob, file, rendered.type, EDIT_SUFFIX);
};

const renditionTypeFor = (sourceType: string): UploadableType =>
    encodeTypeFor(sourceType) === 'image/jpeg' ? 'image/jpeg' : 'image/png';

export const makeEditRendition = async (file: File): Promise<EditRendition | null> => {
    const decoded = await decodeImage(file);
    if (!decoded) return null;
    const size = { width: decoded.width, height: decoded.height };
    if (isGif(file)) return { src: URL.createObjectURL(file), ...size };
    const plan = planPhotoEdit(size, IDENTITY_PHOTO_EDIT, { maxEdge: EDIT_RENDITION_MAX_EDGE });
    const rendered = await render(decoded, plan, renditionTypeFor(file.type), RENDITION_QUALITY);
    return rendered && { src: URL.createObjectURL(rendered.blob), ...size };
};
