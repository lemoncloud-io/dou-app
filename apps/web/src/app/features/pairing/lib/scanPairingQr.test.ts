import { scanPairingQr } from './scanPairingQr';

jest.mock('../../../bridge', () => ({ appBridge: { openCamera: jest.fn() } }));
const readQrText = jest.fn();
jest.mock('./pairingQr', () => ({
    loadImagePixels: jest.fn(),
    readQrText: (...a: unknown[]) => readQrText(...a),
    toPairingCode: (text: string | null) => (text && /^\d{8}$/.test(text) ? text : null),
}));

const PIXELS = { data: new Uint8ClampedArray(4), width: 1, height: 1 };
const scan = (assets: unknown[], pixels: unknown = PIXELS) => {
    const openCamera = jest.fn().mockResolvedValue({ data: { assets } });
    const loadPixels = jest.fn().mockResolvedValue(pixels);
    return { result: scanPairingQr({ openCamera, loadPixels } as never), openCamera, loadPixels };
};

beforeEach(() => jest.clearAllMocks());

describe('scanPairingQr', () => {
    it('asks for a small base64 photo', async () => {
        const { result, openCamera } = scan([]);
        await result;

        expect(openCamera).toHaveBeenCalledWith({
            mediaType: 'photo',
            includeBase64: true,
            maxWidth: 1024,
            quality: 0.7,
        });
    });

    it('reads the code off the photo', async () => {
        readQrText.mockReturnValue('07344168');
        const { result, loadPixels } = scan([{ base64: 'abc', type: 'image/jpeg' }]);

        await expect(result).resolves.toEqual({ kind: 'code', code: '07344168' });
        expect(loadPixels).toHaveBeenCalledWith('abc', 'image/jpeg');
    });

    it('does nothing when the camera was cancelled', async () => {
        await expect(scan([]).result).resolves.toEqual({ kind: 'cancel' });
    });

    it('asks an app that returned no base64 to update', async () => {
        await expect(scan([{ uri: 'file:///tmp/a.jpg' }]).result).resolves.toEqual({ kind: 'oldApp' });
    });

    it('tells a QR with other content apart from a photo with no QR', async () => {
        readQrText.mockReturnValueOnce('https://example.com').mockReturnValueOnce(null);

        await expect(scan([{ base64: 'abc' }]).result).resolves.toEqual({ kind: 'notOurs' });
        await expect(scan([{ base64: 'abc' }]).result).resolves.toEqual({ kind: 'noQr' });
    });

    it('treats an undecodable photo as no QR', async () => {
        await expect(scan([{ base64: 'abc' }], null).result).resolves.toEqual({ kind: 'noQr' });
    });
});
