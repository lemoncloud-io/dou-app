import type { DecodedImage } from './decode';
import type { CompressProfile } from './profiles';

/**
 * Draw `decoded` into a canvas sized by `profile`. `null` when no 2D context is available.
 *
 * Exported because the dimensions it picks are the part worth asserting on: a caller that wants to
 * know what a profile would produce should not have to encode bytes to find out.
 */
export const drawToCanvas = (decoded: DecodedImage, profile: CompressProfile): HTMLCanvasElement | null => {
    const { image, width, height } = decoded;
    const { fit, maxEdge } = profile;
    const canvas = document.createElement('canvas');

    if (fit === 'cover') {
        canvas.width = maxEdge;
        canvas.height = maxEdge;
    } else {
        // Never upscale on 'contain': a 400px screenshot blown up costs bytes and adds no detail.
        const scale = Math.min(1, maxEdge / Math.max(width, height));
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    if (fit === 'cover') {
        const scale = Math.max(maxEdge / width, maxEdge / height);
        const scaledW = width * scale;
        const scaledH = height * scale;
        ctx.drawImage(image, (maxEdge - scaledW) / 2, (maxEdge - scaledH) / 2, scaledW, scaledH);
    } else {
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    }

    return canvas;
};

export interface CompressedBlob {
    blob: Blob;
    width: number;
    height: number;
}

/** Bytes for an upload. `null` when there is no 2D context or the encoder produced nothing. */
export const compressToBlob = async (
    decoded: DecodedImage,
    profile: CompressProfile
): Promise<CompressedBlob | null> => {
    const canvas = drawToCanvas(decoded, profile);
    if (!canvas) return null;

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, profile.type, profile.quality));
    return blob ? { blob, width: canvas.width, height: canvas.height } : null;
};

/**
 * A base64 data URL for a record field.
 *
 * Always JPEG, whatever the profile's `type` says: the callers that store a data URL all want one
 * format, and a PNG data URL of a photo is the size mistake this path exists to avoid.
 */
export const compressToDataUrl = (decoded: DecodedImage, profile: CompressProfile): string | null => {
    const canvas = drawToCanvas(decoded, profile);
    return canvas && canvas.toDataURL('image/jpeg', profile.quality);
};
