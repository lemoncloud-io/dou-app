import { decodeImage, encodeTypeFor, toUploadFile, type DecodedImage, type UploadableType } from '@chatic/shared';
import { IDENTITY_PHOTO_EDIT, planPhotoEdit, type PhotoEdit, type PhotoEditPlan } from '@chatic/web-ui-kit';

/**
 * The editor's display copy is at most this long on its long edge. The editor draws the showing photo
 * and its neighbours; three 24 MP originals decoded side by side would hold some 300 MB in the WebView,
 * where three of these hold about 50 MB and still look sharp full-screen on a phone.
 */
export const EDIT_RENDITION_MAX_EDGE = 2048;

/** The quality an edited photo is encoded at — the one the shell uses for the JPEGs it converts. */
export const BAKE_QUALITY = 0.9;
const RENDITION_QUALITY = 0.85;

/** Appended to an edited photo's name, so it never counts as the same item as its original. */
export const EDIT_SUFFIX = '-edit';

/** A display copy for the editor, and the size the photo's edit is measured in. */
export interface EditRendition {
    /** An object URL — the caller revokes it. */
    src: string;
    /** The original's upright pixel size, not the copy's. */
    width: number;
    height: number;
}

const isGif = (file: File) => file.type === 'image/gif';

/**
 * Draws `decoded` through `plan` into a fresh canvas. JPEG has no transparency and turns transparent
 * pixels black, so it is painted white first, as the shell does before its own JPEG conversion.
 * `null` when the browser gives no 2D context — past WebKit's canvas limits it gives none.
 */
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

/**
 * Draws and encodes `decoded` through `plan`, as `type` — or as JPEG when this browser cannot encode
 * `type`: WebKit has no WebP encoder and hands back a PNG instead, which would be a photo several times
 * its size under a name that says WebP. The canvas is emptied afterwards whatever happened: WebKit caps
 * the canvas memory of the whole page, and one left at full size counts against the next.
 */
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

/**
 * The photo with its edit drawn in, ready for the send — or `null` when it cannot be made: a format
 * this browser cannot decode, no canvas, an encoder that produced nothing. The caller refuses that
 * photo alone rather than sending the original the person had cropped.
 *
 * The output keeps the source's format where it can (`encodeTypeFor`: PNG and WebP stay themselves so
 * transparency does — WebP falls back to JPEG where the browser cannot encode it — everything else is
 * JPEG) at the shell's quality, and is never larger than the iOS WebKit canvas area (`planPhotoEdit`'s
 * default cap) — a crop bigger than that is scaled down to fit, since past it WebKit draws nothing at
 * all. EXIF orientation is applied by the decode, and the edit is measured against that upright photo,
 * so the output carries no orientation of its own.
 *
 * A GIF is not edited: a canvas keeps only its first frame, so asking is answered `null`.
 */
export const bakePhotoEdit = async (file: File, edit: PhotoEdit): Promise<File | null> => {
    if (isGif(file)) return null;
    const decoded = await decodeImage(file);
    if (!decoded) return null;
    const plan = planPhotoEdit({ width: decoded.width, height: decoded.height }, edit);
    const rendered = await render(decoded, plan, encodeTypeFor(file.type), BAKE_QUALITY);
    return rendered && toUploadFile(rendered.blob, file, rendered.type, EDIT_SUFFIX);
};

/**
 * The format of the editor's copy. A photo whose format keeps transparency at the send (PNG, WebP)
 * gets a PNG copy, unpainted, so the editor shows it as it goes rather than on the white a JPEG copy
 * would be painted with. PNG and not WebP for both: WebKit has no WebP encoder, and the copy is only
 * ever shown in the page. Everything else becomes JPEG at the send, and its copy is one too.
 */
const renditionTypeFor = (sourceType: string): UploadableType =>
    encodeTypeFor(sourceType) === 'image/jpeg' ? 'image/jpeg' : 'image/png';

/**
 * The editor's copy of a photo: the whole upright photo at most `EDIT_RENDITION_MAX_EDGE` long — a
 * PNG for a PNG or WebP, a JPEG otherwise (`renditionTypeFor`) — and the original's size, which is the
 * space an edit is measured in. A GIF is shown as itself — it is not editable, and its own bytes keep
 * it moving. `null` when the photo cannot be decoded.
 */
export const makeEditRendition = async (file: File): Promise<EditRendition | null> => {
    const decoded = await decodeImage(file);
    if (!decoded) return null;
    const size = { width: decoded.width, height: decoded.height };
    if (isGif(file)) return { src: URL.createObjectURL(file), ...size };
    const plan = planPhotoEdit(size, IDENTITY_PHOTO_EDIT, { maxEdge: EDIT_RENDITION_MAX_EDGE });
    const rendered = await render(decoded, plan, renditionTypeFor(file.type), RENDITION_QUALITY);
    return rendered && { src: URL.createObjectURL(rendered.blob), ...size };
};
