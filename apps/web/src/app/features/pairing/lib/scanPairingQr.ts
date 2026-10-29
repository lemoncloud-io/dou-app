import { appBridge } from '../../../bridge';
import { loadImagePixels, readQrText, toPairingCode } from './pairingQr';

/**
 * What a "scan the QR" tap ended in:
 *
 * - `code` — a pairing code, ready for the input.
 * - `cancel` — the camera was closed without a photo; nothing to say.
 * - `oldApp` — the photo came back without base64: an app from before the shell passed capture options
 *   on. Its `uri` is a path the page cannot read, so the screen asks for an update and typing instead.
 * - `notOurs` — a QR code with anything other than eight digits in it.
 * - `noQr` — no QR code found in the photo.
 */
export type PairingQrScan = { kind: 'code'; code: string } | { kind: 'cancel' | 'oldApp' | 'notOurs' | 'noQr' };

/** 1024 px and 0.7 quality: plenty for a QR code, and a bounded base64 string across the bridge. */
const CAPTURE = { mediaType: 'photo', includeBase64: true, maxWidth: 1024, quality: 0.7 } as const;

export const scanPairingQr = async (
    deps = { openCamera: appBridge.openCamera.bind(appBridge), loadPixels: loadImagePixels }
): Promise<PairingQrScan> => {
    const response = await deps.openCamera(CAPTURE);
    const asset = response?.data?.assets?.[0];
    if (!asset) return { kind: 'cancel' };
    if (!asset.base64) return { kind: 'oldApp' };

    const pixels = await deps.loadPixels(asset.base64, asset.type ?? undefined);
    const text = pixels ? readQrText(pixels) : null;
    if (text === null) return { kind: 'noQr' };
    const code = toPairingCode(text);
    return code ? { kind: 'code', code } : { kind: 'notOurs' };
};
