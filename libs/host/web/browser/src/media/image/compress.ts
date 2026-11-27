import type { DecodedImage } from './decode';
import type { CompressProfile } from './profiles';

export const drawToCanvas = (decoded: DecodedImage, profile: CompressProfile): HTMLCanvasElement | null => {
    const { image, width, height } = decoded;
    const { fit, maxEdge } = profile;
    const canvas = document.createElement('canvas');

    if (fit === 'cover') {
        canvas.width = maxEdge;
        canvas.height = maxEdge;
    } else {
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

export const compressToBlob = async (
    decoded: DecodedImage,
    profile: CompressProfile
): Promise<CompressedBlob | null> => {
    const canvas = drawToCanvas(decoded, profile);
    if (!canvas) return null;

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, profile.type, profile.quality));
    return blob ? { blob, width: canvas.width, height: canvas.height } : null;
};

export const compressToDataUrl = (decoded: DecodedImage, profile: CompressProfile): string | null => {
    const canvas = drawToCanvas(decoded, profile);
    return canvas && canvas.toDataURL('image/jpeg', profile.quality);
};
