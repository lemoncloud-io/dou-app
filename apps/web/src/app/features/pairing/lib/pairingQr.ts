import jsQR from 'jsqr';

/** RGBA pixels, four bytes per pixel, row by row — the shape a canvas hands back. */
export interface QrPixels {
    data: Uint8ClampedArray;
    width: number;
    height: number;
}

/** Turns a photo into pixels, or `null` when it cannot be decoded. Swapped out in tests. */
export type QrPixelLoader = (base64: string, mimeType?: string) => Promise<QrPixels | null>;

/** A pairing QR carries the eight-digit code and nothing else — no link, no separator. */
const PAIRING_CODE = /^\d{8}$/;

/** The text in the first QR code found in the pixels, or `null` when there is none. */
export const readQrText = ({ data, width, height }: QrPixels): string | null => {
    // A photo of a screen in dark mode shows the code light on dark, so the inverted image is tried too.
    return jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
};

/**
 * The pairing code a QR's text holds, or `null` for any other QR. Nothing else is read from it: the
 * code is only ever typed into the field, never opened as a link.
 */
export const toPairingCode = (text: string | null): string | null => {
    const trimmed = text?.trim() ?? '';
    return PAIRING_CODE.test(trimmed) ? trimmed : null;
};

/**
 * The longest edge a photo is drawn at. Plenty for a QR code that fills part of the frame, and it bounds
 * the pixel buffer and the decode time on the main thread even when a caller forgets `maxWidth` and an
 * original-size photo (about 48 MB as RGBA) comes back.
 */
const MAX_EDGE = 1024;

/**
 * Decodes a base64 photo through an `<img>` and a canvas, scaled down to `MAX_EDGE`. `null` when the
 * browser cannot decode the image or has no 2D canvas to draw it on.
 */
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

/**
 * The pairing code in a photo the camera bridge returned as base64, or `null` — when there is no QR
 * code in it, and when the QR code holds something other than a pairing code. A screen that needs to
 * tell those two apart calls `readQrText` and `toPairingCode` itself.
 */
export const decodePairingQr = async (
    base64: string,
    options: { mimeType?: string; loadPixels?: QrPixelLoader } = {}
): Promise<string | null> => {
    const { mimeType, loadPixels = loadImagePixels } = options;
    const pixels = await loadPixels(base64, mimeType);
    return pixels ? toPairingCode(readQrText(pixels)) : null;
};
