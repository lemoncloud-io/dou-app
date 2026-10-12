import { decodeImage, type DecodedImage } from '@chatic/shared';
import { IDENTITY_PHOTO_EDIT, PHOTO_EDIT_MAX_AREA, type PhotoEdit } from '@chatic/web-ui-kit';

import { bakePhotoEdit, EDIT_RENDITION_MAX_EDGE, makeEditRendition } from './bakePhotoEdit';

// jsdom decodes nothing and has no canvas, so both are stubbed. What is under test is what this
// module asks of them — the size, the transform, the fill, the format and quality, the clean-up — and
// what it makes of their answers.
jest.mock('@chatic/shared', () => ({ ...jest.requireActual('@chatic/shared'), decodeImage: jest.fn() }));
const mockDecode = decodeImage as jest.MockedFunction<typeof decodeImage>;

interface FakeCanvas {
    width: number;
    height: number;
    calls: unknown[][];
    fillStyle?: string;
    sizes: Array<[number, number]>;
}

let canvases: FakeCanvas[] = [];
let hasContext = true;
/** What the encoder answers for a requested type: the type of the blob it hands back, or null. */
let encodes: (type: string) => string | null = type => type;

const decoded = (width: number, height: number): DecodedImage =>
    ({ image: { tag: 'img' } as unknown as HTMLImageElement, width, height }) as DecodedImage;

const file = (name: string, type: string) => new File(['bytes'], name, { type, lastModified: 42 });

const cropped: PhotoEdit = { ...IDENTITY_PHOTO_EDIT, crop: { x: 0.25, y: 0, width: 0.5, height: 1 } };

beforeEach(() => {
    canvases = [];
    hasContext = true;
    encodes = type => type;
    mockDecode.mockReset();

    const createElement = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag !== 'canvas') return createElement(tag);
        const canvas: FakeCanvas & Record<string, unknown> = {
            width: 0,
            height: 0,
            calls: [],
            sizes: [],
            getContext: () => {
                // The size the canvas was given before drawing — read back here, after both sides are set.
                canvas.sizes.push([canvas.width, canvas.height]);
                return (
                    hasContext && {
                        set fillStyle(value: string) {
                            canvas.fillStyle = value;
                        },
                        setTransform: (...args: unknown[]) => canvas.calls.push(['setTransform', ...args]),
                        clearRect: (...args: unknown[]) => canvas.calls.push(['clearRect', ...args]),
                        fillRect: (...args: unknown[]) => canvas.calls.push(['fillRect', ...args]),
                        drawImage: (...args: unknown[]) => canvas.calls.push(['drawImage', ...args]),
                    }
                );
            },
            toBlob: (callback: (blob: Blob | null) => void, type: string, quality: number) => {
                canvas.calls.push(['toBlob', type, quality]);
                const answered = encodes(type);
                callback(answered === null ? null : new Blob(['out'], { type: answered }));
            },
        };
        canvases.push(canvas);
        return canvas as unknown as HTMLElement;
    });
    URL.createObjectURL = jest.fn(() => 'blob:rendition');
});

afterEach(() => jest.restoreAllMocks());

const callsNamed = (canvas: FakeCanvas, name: string) => canvas.calls.filter(call => call[0] === name);

describe('bakePhotoEdit', () => {
    it('draws the crop through the planned transform and encodes a JPEG at 0.9 on white', async () => {
        mockDecode.mockResolvedValue(decoded(400, 300));

        const baked = await bakePhotoEdit(file('IMG_1.jpg', 'image/jpeg'), cropped);

        const [canvas] = canvases;
        expect(canvas.sizes[0]).toEqual([200, 300]);
        expect(canvas.fillStyle).toBe('#ffffff');
        expect(callsNamed(canvas, 'fillRect')).toEqual([['fillRect', 0, 0, 200, 300]]);
        // The half-width crop starting a quarter in: the source shifts 100 px left, unscaled.
        expect(callsNamed(canvas, 'setTransform').at(-1)).toEqual(['setTransform', 1, 0, 0, 1, -100, 0]);
        expect(callsNamed(canvas, 'drawImage')).toEqual([['drawImage', { tag: 'img' }, 0, 0, 400, 300]]);
        expect(callsNamed(canvas, 'toBlob')).toEqual([['toBlob', 'image/jpeg', 0.9]]);
        expect(baked?.name).toBe('IMG_1-edit.jpg');
        expect(baked?.type).toBe('image/jpeg');
        expect(baked?.lastModified).toBe(42);
    });

    it('keeps a PNG a PNG, without the white fill, so transparency survives', async () => {
        mockDecode.mockResolvedValue(decoded(400, 300));

        const baked = await bakePhotoEdit(file('shot.png', 'image/png'), cropped);

        expect(canvases[0].fillStyle).toBeUndefined();
        expect(callsNamed(canvases[0], 'toBlob')).toEqual([['toBlob', 'image/png', 0.9]]);
        expect(baked?.name).toBe('shot-edit.png');
    });

    it('turns a HEIC the browser could decode into a JPEG', async () => {
        mockDecode.mockResolvedValue(decoded(400, 300));

        const baked = await bakePhotoEdit(file('a.heic', 'image/heic'), cropped);

        expect(baked?.type).toBe('image/jpeg');
        expect(baked?.name).toBe('a-edit.jpg');
    });

    // WebKit has no WebP encoder: asked for WebP it answers a PNG, which would go up misnamed.
    it('re-encodes as JPEG on white when the WebP encoder answers another format', async () => {
        mockDecode.mockResolvedValue(decoded(400, 300));
        encodes = type => (type === 'image/webp' ? 'image/png' : type);

        const baked = await bakePhotoEdit(file('a.webp', 'image/webp'), cropped);

        expect(callsNamed(canvases[0], 'toBlob')).toEqual([
            ['toBlob', 'image/webp', 0.9],
            ['toBlob', 'image/jpeg', 0.9],
        ]);
        expect(callsNamed(canvases[0], 'drawImage')).toHaveLength(2);
        expect(canvases[0].fillStyle).toBe('#ffffff');
        expect(baked?.type).toBe('image/jpeg');
        expect(baked?.name).toBe('a-edit.jpg');
    });

    it('keeps a WebP a WebP where the browser can encode one', async () => {
        mockDecode.mockResolvedValue(decoded(400, 300));

        const baked = await bakePhotoEdit(file('a.webp', 'image/webp'), cropped);

        expect(baked?.type).toBe('image/webp');
    });

    it('scales a crop past the WebKit canvas area down to fit it', async () => {
        // 24 MP, the default on recent iPhones — past the 16.7 MP a WebKit canvas draws.
        mockDecode.mockResolvedValue(decoded(5712, 4284));

        await bakePhotoEdit(file('big.jpg', 'image/jpeg'), { ...IDENTITY_PHOTO_EDIT, rotation: 90 });

        const [width, height] = canvases[0].sizes[0];
        expect(width * height).toBeLessThanOrEqual(PHOTO_EDIT_MAX_AREA);
        expect(width * height).toBeGreaterThan(PHOTO_EDIT_MAX_AREA * 0.99);
        // Turned a quarter, the output is portrait, and scaled the same both ways.
        expect(height).toBeGreaterThan(width);
        expect(height / width).toBeCloseTo(5712 / 4284, 2);
    });

    it('always empties the canvas afterwards, whether it worked or not', async () => {
        mockDecode.mockResolvedValue(decoded(400, 300));
        await bakePhotoEdit(file('a.jpg', 'image/jpeg'), cropped);
        encodes = () => null;
        await bakePhotoEdit(file('b.jpg', 'image/jpeg'), cropped);

        expect(canvases.map(canvas => [canvas.width, canvas.height])).toEqual([
            [0, 0],
            [0, 0],
        ]);
    });

    it('answers null when the photo cannot be decoded', async () => {
        mockDecode.mockResolvedValue(null);

        await expect(bakePhotoEdit(file('a.heic', 'image/heic'), cropped)).resolves.toBeNull();
        expect(canvases).toHaveLength(0);
    });

    it('answers null without a 2D context — past WebKit’s canvas limits there is none', async () => {
        mockDecode.mockResolvedValue(decoded(400, 300));
        hasContext = false;

        await expect(bakePhotoEdit(file('a.jpg', 'image/jpeg'), cropped)).resolves.toBeNull();
        expect([canvases[0].width, canvases[0].height]).toEqual([0, 0]);
    });

    it('answers null when the encoder produces nothing', async () => {
        mockDecode.mockResolvedValue(decoded(400, 300));
        encodes = () => null;

        await expect(bakePhotoEdit(file('a.jpg', 'image/jpeg'), cropped)).resolves.toBeNull();
    });

    it('answers null when even the JPEG fallback comes back as another format', async () => {
        mockDecode.mockResolvedValue(decoded(400, 300));
        encodes = () => 'image/png';

        await expect(bakePhotoEdit(file('a.webp', 'image/webp'), cropped)).resolves.toBeNull();
    });

    it('answers null when drawing throws', async () => {
        mockDecode.mockResolvedValue(decoded(400, 300));
        jest.spyOn(document, 'createElement').mockImplementation(() => {
            const canvas = { width: 0, height: 0, getContext: () => ({ setTransform: () => undefined }) };
            return canvas as unknown as HTMLElement;
        });

        await expect(bakePhotoEdit(file('a.jpg', 'image/jpeg'), cropped)).resolves.toBeNull();
    });

    // A canvas keeps a GIF's first frame only; the editor never offers one, and asking gets nothing.
    it('answers null for a GIF without decoding it', async () => {
        await expect(bakePhotoEdit(file('a.gif', 'image/gif'), cropped)).resolves.toBeNull();
        expect(mockDecode).not.toHaveBeenCalled();
    });
});

describe('makeEditRendition', () => {
    it('makes a JPEG copy on white at most 2048 long and reports the original size', async () => {
        mockDecode.mockResolvedValue(decoded(4032, 3024));

        const rendition = await makeEditRendition(file('a.jpg', 'image/jpeg'));

        expect(rendition).toEqual({ src: 'blob:rendition', width: 4032, height: 3024 });
        expect(canvases[0].sizes[0]).toEqual([EDIT_RENDITION_MAX_EDGE, 1536]);
        expect(canvases[0].fillStyle).toBe('#ffffff');
        expect(callsNamed(canvases[0], 'fillRect')).toEqual([['fillRect', 0, 0, 2048, 1536]]);
        expect(callsNamed(canvases[0], 'toBlob')).toEqual([['toBlob', 'image/jpeg', 0.85]]);
        expect([canvases[0].width, canvases[0].height]).toEqual([0, 0]);
    });

    it('copies a HEIC as a JPEG, the format it goes up in', async () => {
        mockDecode.mockResolvedValue(decoded(800, 600));

        await makeEditRendition(file('a.heic', 'image/heic'));

        expect(callsNamed(canvases[0], 'toBlob')[0][1]).toBe('image/jpeg');
    });

    // A PNG and a WebP keep their transparency at the send; a JPEG copy would show it white. WebKit
    // cannot encode WebP, so a WebP is copied as a PNG too.
    it.each([
        ['a.png', 'image/png'],
        ['a.webp', 'image/webp'],
    ])('copies %s as a PNG, unpainted, at most 2048 long', async (name, type) => {
        mockDecode.mockResolvedValue(decoded(4032, 3024));

        const rendition = await makeEditRendition(file(name, type));

        expect(rendition).toEqual({ src: 'blob:rendition', width: 4032, height: 3024 });
        expect(canvases[0].sizes[0]).toEqual([EDIT_RENDITION_MAX_EDGE, 1536]);
        expect(canvases[0].fillStyle).toBeUndefined();
        expect(callsNamed(canvases[0], 'fillRect')).toEqual([]);
        expect(callsNamed(canvases[0], 'toBlob').map(call => call[1])).toEqual(['image/png']);
        expect([canvases[0].width, canvases[0].height]).toEqual([0, 0]);
    });

    it('never enlarges a small photo', async () => {
        mockDecode.mockResolvedValue(decoded(800, 600));

        await makeEditRendition(file('a.jpg', 'image/jpeg'));

        expect(callsNamed(canvases[0], 'fillRect')).toEqual([['fillRect', 0, 0, 800, 600]]);
    });

    it('shows a GIF as itself, so it keeps moving', async () => {
        mockDecode.mockResolvedValue(decoded(320, 240));
        const gif = file('a.gif', 'image/gif');

        const rendition = await makeEditRendition(gif);

        expect(rendition).toEqual({ src: 'blob:rendition', width: 320, height: 240 });
        expect(URL.createObjectURL).toHaveBeenCalledWith(gif);
        expect(canvases).toHaveLength(0);
    });

    it('answers null when the photo cannot be decoded or drawn', async () => {
        mockDecode.mockResolvedValueOnce(null);
        await expect(makeEditRendition(file('a.jpg', 'image/jpeg'))).resolves.toBeNull();

        mockDecode.mockResolvedValueOnce(decoded(800, 600));
        hasContext = false;
        await expect(makeEditRendition(file('a.jpg', 'image/jpeg'))).resolves.toBeNull();
    });
});
