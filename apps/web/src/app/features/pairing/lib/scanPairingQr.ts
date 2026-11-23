import { appBridge } from '../../../bridge';
import { loadImagePixels, readQrText, toPairingCode } from './pairingQr';

export type PairingQrScan = { kind: 'code'; code: string } | { kind: 'cancel' | 'oldApp' | 'notOurs' | 'noQr' };

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
