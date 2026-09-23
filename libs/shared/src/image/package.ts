import type { UploadableType } from './types';

/** Appended to a thumbnail's name so it is not mistaken for the original it came from. */
export const THUMBNAIL_SUFFIX = '-thumb';

/** Doubles as the format list: a new accepted type will not compile until it has an extension. */
const EXTENSION_BY_TYPE: Record<UploadableType, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
};

/**
 * The format these bytes have to leave as.
 *
 * PNG and WebP survive as themselves so transparency does, and `quality` still applies to WebP.
 * Everything else — JPEG, HEIC/HEIF, and whatever a browser hands us with an empty `type` — becomes
 * JPEG, the only format every target can both write and upload.
 */
export const encodeTypeFor = (sourceType: string): UploadableType =>
    sourceType === 'image/png' || sourceType === 'image/webp' ? sourceType : 'image/jpeg';

/** Whether the endpoint would take this type as-is. */
export const isUploadableType = (type: string): type is UploadableType => type in EXTENSION_BY_TYPE;

/**
 * Swaps the extension so the name matches the bytes; a name with no extension just gains one.
 *
 * `suffix` distinguishes a derived copy from its source. Without it a thumbnail of `photo.jpg` is
 * also called `photo.jpg`, and the two objects of one upload become indistinguishable in logs and
 * in anything the upload path keys by name.
 */
export const renameForType = (name: string, type: UploadableType, suffix = ''): string => {
    const base = name.replace(/\.[^./\\]+$/, '') || name;
    return `${base}${suffix}.${EXTENSION_BY_TYPE[type]}`;
};

/**
 * Wrap bytes as a `File` that declares itself correctly.
 *
 * A `File` rather than a `Blob` because converting a format changes the name and the `contentType`,
 * and both are declared to the upload endpoint and signed. A caller handed only bytes would have to
 * re-derive the name, and that is where a declaration and its bytes drift apart.
 */
export const toUploadFile = (blob: Blob, source: File, type: UploadableType, suffix = ''): File =>
    new File([blob], renameForType(source.name, type, suffix), { type, lastModified: source.lastModified });
