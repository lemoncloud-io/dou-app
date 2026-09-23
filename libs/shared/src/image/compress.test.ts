import { drawToCanvas } from './compress';
import { AVATAR_PROFILE, INLINE_PROFILE, sameSizeProfile, THUMBNAIL_PROFILE } from './profiles';
import type { DecodedImage } from './decode';

// jsdom has no canvas, so the element is stubbed. These tests are about the geometry a profile
// picks — the numbers that decide whether a photo is cropped, stretched or left alone — so nothing
// here needs real pixels.

let drawCalls: { x: number; y: number; width: number; height: number }[] = [];
let hasContext = true;

const decoded = (width: number, height: number): DecodedImage =>
    ({ image: {} as HTMLImageElement, width, height }) as DecodedImage;

beforeEach(() => {
    drawCalls = [];
    hasContext = true;

    const createElement = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag !== 'canvas') return createElement(tag);
        const canvas = {
            width: 0,
            height: 0,
            getContext: () =>
                hasContext && {
                    drawImage: (_i: unknown, x: number, y: number, width: number, height: number) =>
                        drawCalls.push({ x, y, width, height }),
                },
        };
        return canvas as unknown as HTMLElement;
    });
});

afterEach(() => jest.restoreAllMocks());

describe("drawToCanvas — fit: 'contain'", () => {
    it('긴 변을 maxEdge에 맞추고 비율을 지킨다', () => {
        const canvas = drawToCanvas(decoded(4032, 3024), THUMBNAIL_PROFILE);

        expect([canvas?.width, canvas?.height]).toEqual([512, 384]);
        expect(drawCalls).toEqual([{ x: 0, y: 0, width: 512, height: 384 }]);
    });

    it('세로 사진은 높이가 긴 변이다', () => {
        const canvas = drawToCanvas(decoded(3024, 4032), THUMBNAIL_PROFILE);

        expect([canvas?.width, canvas?.height]).toEqual([384, 512]);
    });

    it('확대하지 않는다 — 작은 원본은 그 크기 그대로다', () => {
        const canvas = drawToCanvas(decoded(300, 200), INLINE_PROFILE);

        expect([canvas?.width, canvas?.height]).toEqual([300, 200]);
    });
});

describe("drawToCanvas — fit: 'cover'", () => {
    it('중앙에서 잘라 정사각을 만든다', () => {
        const canvas = drawToCanvas(decoded(400, 200), AVATAR_PROFILE);

        expect([canvas?.width, canvas?.height]).toEqual([150, 150]);
        // Scaled by 150/200 so the short edge fills, then pulled left by half the overflow.
        expect(drawCalls).toEqual([{ x: -75, y: 0, width: 300, height: 150 }]);
    });

    it('세로 사진은 위아래가 잘린다', () => {
        const canvas = drawToCanvas(decoded(200, 400), AVATAR_PROFILE);

        expect(drawCalls).toEqual([{ x: 0, y: -75, width: 150, height: 300 }]);
        expect([canvas?.width, canvas?.height]).toEqual([150, 150]);
    });

    it('확대한다 — 정사각이 목적이라 비우면 안 된다', () => {
        drawToCanvas(decoded(50, 50), AVATAR_PROFILE);

        expect(drawCalls).toEqual([{ x: 0, y: 0, width: 150, height: 150 }]);
    });
});

describe('sameSizeProfile — 형식만 바꾸는 프로필', () => {
    it('원본 치수를 유지한다', () => {
        const canvas = drawToCanvas(decoded(4032, 3024), sameSizeProfile(4032, 3024, 'image/jpeg'));

        // A HEIC has to become JPEG or the endpoint answers 415 — but that is correctness, not a
        // size budget, so the pixels are left alone.
        expect([canvas?.width, canvas?.height]).toEqual([4032, 3024]);
    });
});

describe('drawToCanvas — 2D 컨텍스트가 없으면', () => {
    it('null을 낸다 — 던지지 않는다', () => {
        hasContext = false;

        expect(drawToCanvas(decoded(4032, 3024), THUMBNAIL_PROFILE)).toBeNull();
    });
});
