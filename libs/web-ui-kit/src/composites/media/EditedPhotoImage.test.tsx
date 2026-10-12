import { act, render, screen } from '@testing-library/react';

import { EditedPhotoImage } from './EditedPhotoImage';
import { IDENTITY_PHOTO_EDIT, type PhotoEdit } from './photoEdit';

/** The six numbers of an element's `matrix()` transform. */
const matrixOf = (element: HTMLElement): number[] => {
    const match = /^matrix\((.*)\)$/.exec(element.style.transform);
    if (!match) throw new Error(`not a matrix: ${element.style.transform}`);
    return match[1].split(',').map(Number);
};

const expectMatrix = (element: HTMLElement, expected: number[]) => {
    const actual = matrixOf(element);
    expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, 6));
};

// jsdom lays nothing out: give every box a phone-sized 400 × 600.
let boxWidth = 400;
let boxHeight = 600;
beforeEach(() => {
    boxWidth = 400;
    boxHeight = 600;
    jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => boxWidth);
    jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => boxHeight);
});
afterEach(() => {
    jest.restoreAllMocks();
    delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
});

// Decorative by default (`alt=""`), so it has no role to query by.
const image = () => document.querySelector('[data-edited-photo] img') as HTMLImageElement;
const frame = () => document.querySelector('[data-edited-frame]') as HTMLElement;
const frameBox = () => ['left', 'top', 'width', 'height'].map(side => parseFloat(frame().style.getPropertyValue(side)));

describe('EditedPhotoImage', () => {
    it('lays the rendition out at the original size and maps it into the box', () => {
        render(
            <EditedPhotoImage src="blob:photo" width={4000} height={3000} edit={IDENTITY_PHOTO_EDIT} alt="A photo" />
        );

        const img = screen.getByRole('img', { name: 'A photo' });
        expect(img).toHaveAttribute('src', 'blob:photo');
        expect(img.style.width).toBe('4000px');
        expect(img.style.height).toBe('3000px');
        expect(img.style.transformOrigin).toBe('0 0');
        // Contain: a tenth of the original, in a 400 × 300 frame centred with 150px above and below.
        expectMatrix(img, [0.1, 0, 0, 0.1, 0, 0]);
        expect(frameBox()).toEqual([0, 150, 400, 300]);
        expect(frame().style.visibility).toBe('');
    });

    it('fills the box for cover', () => {
        boxWidth = 100;
        boxHeight = 100;
        render(<EditedPhotoImage src="blob:photo" width={4000} height={3000} edit={IDENTITY_PHOTO_EDIT} fit="cover" />);

        const scale = 100 / 3000;
        expectMatrix(image(), [scale, 0, 0, scale, 0, 0]);
        // Wider than the box, evenly past both sides: the box clips it.
        const [left, top, width, height] = frameBox();
        expect(left).toBeCloseTo((100 - 4000 * scale) / 2, 6);
        expect(top).toBe(0);
        expect(width).toBeCloseTo(4000 * scale, 6);
        expect(height).toBeCloseTo(100, 6);
    });

    it('draws the crop, the turn and the mirror of the edit', () => {
        // Mirrored, turned clockwise, then the top half of the turned frame: 3000 × 2000 of a 3000 × 4000 frame.
        const edit: PhotoEdit = {
            rotation: 90,
            flipH: true,
            crop: { x: 0, y: 0, width: 1, height: 0.5 },
            aspect: 'free',
        };
        boxWidth = 300;
        boxHeight = 200;
        render(<EditedPhotoImage src="blob:photo" width={4000} height={3000} edit={edit} />);

        // Mirrored then turned clockwise, the source's top-right corner (4000, 0) is the turned frame's
        // top-right corner, and the bottom-right (4000, 3000) its top-left.
        const [a, b, c, d, e, f] = matrixOf(image());
        const at = (x: number, y: number) => [a * x + c * y + e, b * x + d * y + f];
        expect(at(4000, 0)[0]).toBeCloseTo(300, 6);
        expect(at(4000, 0)[1]).toBeCloseTo(0, 6);
        expect(at(4000, 3000)[0]).toBeCloseTo(0, 6);
        expect(at(4000, 3000)[1]).toBeCloseTo(0, 6);
    });

    // Letterboxed, the box is bigger than the result: what the crop drops would show around it.
    it('clips the photo to a frame the size of the cropped result', () => {
        const edit: PhotoEdit = { ...IDENTITY_PHOTO_EDIT, crop: { x: 0.5, y: 0, width: 0.5, height: 1 } };
        render(<EditedPhotoImage src="blob:photo" width={4000} height={3000} edit={edit} />);

        // 2000 × 3000 in 400 × 600: a fifth, 400 × 600 — and the photo's left half to the left of it.
        expect(frame()).toHaveClass('overflow-hidden');
        expect(frameBox()).toEqual([0, 0, 400, 600]);
        expectMatrix(image(), [0.2, 0, 0, 0.2, -400, 0]);
    });

    it('draws nothing until the box has a size', () => {
        boxWidth = 0;
        boxHeight = 0;
        render(<EditedPhotoImage src="blob:photo" width={4000} height={3000} edit={IDENTITY_PHOTO_EDIT} />);

        expect(frame().style.visibility).toBe('hidden');
    });

    it('fits again when the box resizes', () => {
        let resize: (() => void) | undefined;
        (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
            constructor(callback: () => void) {
                resize = callback;
            }
            observe = jest.fn();
            disconnect = jest.fn();
        };
        render(<EditedPhotoImage src="blob:photo" width={4000} height={3000} edit={IDENTITY_PHOTO_EDIT} />);
        expect(frameBox()).toEqual([0, 150, 400, 300]);

        // The phone turned: the box is now wide.
        boxWidth = 800;
        boxHeight = 300;
        act(() => resize?.());

        expect(frameBox()).toEqual([200, 0, 400, 300]);
        expectMatrix(image(), [0.1, 0, 0, 0.1, 0, 0]);
    });
});
