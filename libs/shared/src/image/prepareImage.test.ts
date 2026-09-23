import { prepareImage } from './prepareImage';
import { THUMBNAIL_PROFILE } from './profiles';

// jsdom has neither `URL.createObjectURL` nor a canvas implementation, so the browser edges this
// function is made of are stubbed here. The stubs stay deliberately thin: each test states the one
// thing the real browser would have done — decoded to these dimensions, produced these bytes — and
// the assertions are about the branch taken, never about the pixels.

interface DecodeResult {
    /** Dimensions the decoder reports. `null` stands for a source the browser cannot decode. */
    size: { width: number; height: number } | null;
}

let decode: DecodeResult = { size: { width: 4032, height: 3024 } };
/** Bytes each `toBlob` hands back, in call order; a `null` stands for the encoder failing. */
let encodedSizes: (number | null)[] = [];
let toBlobCalls: { type: string | undefined; quality: number | undefined }[] = [];
let toDataUrlCalls: { type: string | undefined; quality: number | undefined }[] = [];
let drawCalls: { x: number; y: number; width: number; height: number }[] = [];
let canvasSizes: { width: number; height: number }[] = [];
let canvasContext: object | null = {};

const file = (name: string, type: string, size = 5_000_000): File => {
    const f = new File(['x'], name, { type });
    // A File's `size` follows its contents, and allocating megabytes per test to move it would be
    // wasteful — the code only ever compares it against the encoded size.
    Object.defineProperty(f, 'size', { value: size });
    return f;
};

beforeEach(() => {
    decode = { size: { width: 4032, height: 3024 } };
    encodedSizes = [];
    toBlobCalls = [];
    toDataUrlCalls = [];
    drawCalls = [];
    canvasSizes = [];
    canvasContext = {};

    Object.defineProperty(URL, 'createObjectURL', { value: jest.fn(() => 'blob:stub'), configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: jest.fn(), configurable: true });

    // `src = …` is what kicks off a decode in a real browser, so the setter is where the stubbed
    // outcome is delivered — asynchronously, as the real events are.
    Object.defineProperty(Image.prototype, 'src', {
        configurable: true,
        set() {
            const img = this as HTMLImageElement & { onload?: () => void; onerror?: () => void };
            queueMicrotask(() => {
                if (!decode.size) {
                    img.onerror?.();
                    return;
                }
                Object.defineProperty(img, 'naturalWidth', { value: decode.size.width, configurable: true });
                Object.defineProperty(img, 'naturalHeight', { value: decode.size.height, configurable: true });
                img.onload?.();
            });
        },
    });

    const createElement = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag !== 'canvas') return createElement(tag);
        const canvas = {
            width: 0,
            height: 0,
            getContext: () =>
                canvasContext && {
                    drawImage: (_i: unknown, x: number, y: number, width: number, height: number) => {
                        canvasSizes.push({ width: canvas.width, height: canvas.height });
                        drawCalls.push({ x, y, width, height });
                    },
                },
            toBlob: (cb: (b: Blob | null) => void, type?: string, quality?: number) => {
                const size = encodedSizes.length ? encodedSizes.shift() : 200_000;
                toBlobCalls.push({ type, quality });
                cb(size === null || size === undefined ? null : ({ size } as Blob));
            },
            toDataURL: (type?: string, quality?: number) => {
                toDataUrlCalls.push({ type, quality });
                return 'data:image/jpeg;base64,stub';
            },
        };
        return canvas as unknown as HTMLElement;
    });
});

afterEach(() => jest.restoreAllMocks());

const ORIGINAL = { as: 'file' } as const;
const THUMB = { as: 'file', profile: THUMBNAIL_PROFILE, suffix: '-thumb' } as const;
const PREVIEW = { as: 'dataUrl', profile: THUMBNAIL_PROFILE } as const;

describe('prepareImage — 프로필 없는 file 은 원문이다', () => {
    it('큰 사진도 줄이지 않는다', async () => {
        const source = file('photo.jpg', 'image/jpeg');

        const { original } = await prepareImage(source, { original: ORIGINAL });

        // The transport carries it, and re-encoding would spend the quality the sender chose.
        expect(original.file).toBe(source);
        expect([original.width, original.height]).toEqual([4032, 3024]);
    });

    it('세로 사진의 치수가 세로로 나온다 — 도착 전에 자리를 잡는다', async () => {
        decode = { size: { width: 3024, height: 4032 } };

        const { original } = await prepareImage(file('portrait.jpg', 'image/jpeg'), { original: ORIGINAL });

        expect([original.width, original.height]).toEqual([3024, 4032]);
    });

    it('HEIC는 원문 크기 그대로 jpeg로 바꾼다 — 크기가 아니라 정합성 문제다', async () => {
        const { original } = await prepareImage(file('IMG_0001.heic', 'image/heic'), { original: ORIGINAL });

        expect(original.file.type).toBe('image/jpeg');
        expect(original.file.name).toBe('IMG_0001.jpg');
        // Not resized — still 4032 wide.
        expect([original.width, original.height]).toEqual([4032, 3024]);
    });

    it('png는 png로 남고 다시 굽지 않는다', async () => {
        const source = file('shot.png', 'image/png');

        const { original } = await prepareImage(source, { original: ORIGINAL });

        expect(original.file).toBe(source);
    });

    it('gif는 건드리지 않는다', async () => {
        const source = file('loop.gif', 'image/gif');

        const { original } = await prepareImage(source, { original: ORIGINAL });

        expect(original.file).toBe(source);
    });

    it('디코딩에 실패해도 원본은 나온다 — 업로드가 미리보기에 막히지 않는다', async () => {
        decode = { size: null };
        const source = file('photo.heic', 'image/heic');

        const { original, preview } = await prepareImage(source, { original: ORIGINAL, preview: PREVIEW });

        // The type says this one is not nullable, and that is the guarantee: something always ships.
        expect(original.file).toBe(source);
        expect(preview).toBeNull();
    });
});

describe('prepareImage — 프로필 있는 file 은 줄인 사본이다', () => {
    it('긴 변을 프로필에 맞추고 치수를 낸다', async () => {
        const { thumbnail } = await prepareImage(file('photo.jpg', 'image/jpeg'), { thumbnail: THUMB });

        expect([thumbnail?.width, thumbnail?.height]).toEqual([512, 384]);
        expect(toBlobCalls).toEqual([{ type: 'image/jpeg', quality: 0.7 }]);
    });

    it('이름이 원본과 겹치지 않는다 — 한 업로드의 두 객체다', async () => {
        const { original, thumbnail } = await prepareImage(file('photo.jpg', 'image/jpeg'), {
            original: ORIGINAL,
            thumbnail: THUMB,
        });

        expect(thumbnail?.file.name).toBe('photo-thumb.jpg');
        expect(thumbnail?.file.name).not.toBe(original.file.name);
    });

    it('suffix를 안 주면 키 이름을 쓴다', async () => {
        const { small } = await prepareImage(file('photo.jpg', 'image/jpeg'), {
            small: { as: 'file', profile: THUMBNAIL_PROFILE },
        });

        expect(small?.file.name).toBe('photo-small.jpg');
    });

    it('gif도 썸네일을 받는다 — 첫 프레임이 목록 행에 맞다', async () => {
        const source = file('loop.gif', 'image/gif');

        const { original, thumbnail } = await prepareImage(source, { original: ORIGINAL, thumbnail: THUMB });

        // The animation survives where it matters, and the list still gets something small.
        expect(original.file).toBe(source);
        expect(thumbnail?.file.type).toBe('image/jpeg');
    });

    it('인코딩이 실패하면 null이고, 원본 업로드는 산다', async () => {
        encodedSizes = [null];

        const { original, thumbnail } = await prepareImage(file('photo.jpg', 'image/jpeg'), {
            original: ORIGINAL,
            thumbnail: THUMB,
        });

        expect(thumbnail).toBeNull();
        expect(original.file.name).toBe('photo.jpg');
    });

    it('원본이 작으면 확대하지 않는다', async () => {
        decode = { size: { width: 300, height: 200 } };

        const { thumbnail } = await prepareImage(file('small.jpg', 'image/jpeg'), { thumbnail: THUMB });

        expect([thumbnail?.width, thumbnail?.height]).toEqual([300, 200]);
    });
});

describe('prepareImage — dataUrl 은 언제나 압축한다', () => {
    it('data URL을 낸다', async () => {
        const { preview } = await prepareImage(file('photo.jpg', 'image/jpeg'), { preview: PREVIEW });

        expect(preview).toBe('data:image/jpeg;base64,stub');
        expect(toDataUrlCalls).toHaveLength(1);
        // Only one encoder runs — the two forms do not both fire.
        expect(toBlobCalls).toHaveLength(0);
    });

    it('gif도 다시 굽는다 — base64로 애니메이션을 나를 수는 없다', async () => {
        await prepareImage(file('loop.gif', 'image/gif'), { preview: PREVIEW });

        expect(toDataUrlCalls).toHaveLength(1);
    });

    it('이미 작아도 다시 굽는다 — 건너뛰기는 원문 전용이다', async () => {
        decode = { size: { width: 300, height: 200 } };

        await prepareImage(file('small.jpg', 'image/jpeg'), { preview: PREVIEW });

        expect(canvasSizes).toEqual([{ width: 300, height: 200 }]);
        expect(toDataUrlCalls).toHaveLength(1);
    });

    it('2D 컨텍스트가 없으면 null이다', async () => {
        canvasContext = null;

        const { preview } = await prepareImage(file('photo.jpg', 'image/jpeg'), { preview: PREVIEW });

        expect(preview).toBeNull();
    });
});

describe('prepareImage — 직교', () => {
    it('같은 프로필을 두 형태로 동시에 낸다 — 이 조합이 4판까지는 불가능했다', async () => {
        const { thumbnail, preview } = await prepareImage(file('photo.jpg', 'image/jpeg'), {
            thumbnail: THUMB,
            preview: PREVIEW,
        });

        expect(thumbnail?.file.type).toBe('image/jpeg');
        expect(typeof preview).toBe('string');
    });

    it('셋을 요청해도 디코딩은 한 번이다', async () => {
        await prepareImage(file('photo.jpg', 'image/jpeg'), {
            original: ORIGINAL,
            thumbnail: THUMB,
            preview: PREVIEW,
        });

        // The whole reason the request is a set rather than three calls.
        expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    });

    it('요청한 키만 돌아온다', async () => {
        const out = await prepareImage(file('photo.jpg', 'image/jpeg'), { original: ORIGINAL });

        expect(Object.keys(out)).toEqual(['original']);
    });
});
