import jsQR from 'jsqr';

export interface QrPixels {
    data: Uint8ClampedArray;
    width: number;
    height: number;
}

export type QrPixelLoader = (base64: string, mimeType?: string) => Promise<QrPixels | null>;

const PAIRING_CODE = /^\d{8}$/;

export type QrInversion = 'attemptBoth' | 'dontInvert' | 'onlyInvert';

const invertedCopy = (data: Uint8ClampedArray): Uint8ClampedArray => {
    const out = new Uint8ClampedArray(data.length);
    for (let i = 0; i < data.length; i += 4) {
        out[i] = 255 - data[i];
        out[i + 1] = 255 - data[i + 1];
        out[i + 2] = 255 - data[i + 2];
        out[i + 3] = data[i + 3];
    }
    return out;
};

export const readQrText = (
    { data, width, height }: QrPixels,
    inversion: QrInversion = 'attemptBoth'
): string | null => {
    const pixels = inversion === 'onlyInvert' ? invertedCopy(data) : data;
    const inversionAttempts = inversion === 'attemptBoth' ? 'attemptBoth' : 'dontInvert';
    return jsQR(pixels, width, height, { inversionAttempts })?.data ?? null;
};

export const toPairingCode = (text: string | null): string | null => {
    const trimmed = text?.trim() ?? '';
    return PAIRING_CODE.test(trimmed) ? trimmed : null;
};

const MAX_EDGE = 1024;

export const loadImagePixels: QrPixelLoader = async (base64, mimeType = 'image/jpeg') => {
    const source = base64.startsWith('data:') ? base64 : `data:${mimeType};base64,${base64}`;
    const image = new Image();
    try {
        image.src = source;
        await image.decode();
    } catch {
        return null;
    }
    if (!image.naturalWidth || !image.naturalHeight) return null;
    const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.round(image.naturalWidth * scale);
    const height = Math.round(image.naturalHeight * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, width, height);
    const { data } = context.getImageData(0, 0, width, height);
    return { data, width, height };
};

export const decodePairingQr = async (
    base64: string,
    options: { mimeType?: string; loadPixels?: QrPixelLoader } = {}
): Promise<string | null> => {
    const { mimeType, loadPixels = loadImagePixels } = options;
    const pixels = await loadPixels(base64, mimeType);
    return pixels ? toPairingCode(readQrText(pixels)) : null;
};
