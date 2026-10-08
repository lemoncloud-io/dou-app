import { fireEvent, render, screen, within } from '@testing-library/react';

import { IDENTITY_PHOTO_EDIT, type PhotoEdit } from './photoEdit';
import { PhotoEditor, type PhotoEditorItem, type PhotoEditorProps } from './PhotoEditor';

const photo = (i: number, extra: Partial<PhotoEditorItem> = {}): PhotoEditorItem => ({
    id: `p${i}`,
    previewSrc: `data:preview-${i}`,
    src: `blob:photo-${i}`,
    width: 4000,
    height: 3000,
    editable: true,
    ...extra,
});
const photos = (count: number) => Array.from({ length: count }, (_, i) => photo(i));

const props = (overrides: Partial<PhotoEditorProps> = {}): PhotoEditorProps => ({
    open: true,
    items: photos(3),
    index: 0,
    onIndexChange: jest.fn(),
    onEditChange: jest.fn(),
    onCancel: jest.fn(),
    onDone: jest.fn(),
    onSend: jest.fn(),
    sendLabel: 'Send 3',
    ...overrides,
});

// jsdom's PointerEvent drops clientX/Y from the init, so the coordinates are hung on the event.
const pointer = (type: string, [x, y]: [number, number], pointerId = 1, isPrimary = true) => {
    const event = new Event(type, { bubbles: true });
    Object.assign(event, { clientX: x, clientY: y, pointerId, isPrimary });
    return event;
};
const drag = (target: Element, from: [number, number], to: [number, number]) => {
    fireEvent(target, pointer('pointerdown', from));
    fireEvent(target, pointer('pointermove', to));
    fireEvent(target, pointer('pointerup', to));
};

const dialog = () => screen.getByRole('dialog');
const pager = () => dialog().querySelector('[data-pager]') as HTMLElement;
const strip = () => dialog().querySelector('[data-pager-strip]') as HTMLElement;
const showingPage = () => dialog().querySelector('[data-page]:not([aria-hidden])') as HTMLElement;
const cropButton = () => screen.getByRole('button', { name: 'Crop & rotate' });
const stage = () => dialog().querySelector('[data-crop-stage]') as HTMLElement | null;
const cropBox = () => dialog().querySelector('[data-crop-box]') as HTMLElement;
const handle = (name: string) => dialog().querySelector(`[data-crop-handle="${name}"]`) as HTMLElement;
const lift = () => document.documentElement.style.getPropertyValue('--toast-lift');

/** The edit the host was handed last. */
const lastEdit = (onEditChange: jest.Mock): PhotoEdit => onEditChange.mock.calls.at(-1)?.[1];

// jsdom lays nothing out. Every box is 400 × 600, so a 4000 × 3000 photo on the crop stage — 24px of
// room around it — is drawn 352 × 264: a pixel of drag is 1/352 of the width and 1/264 of the height.
const STAGE_PHOTO = { width: 352, height: 264 };
beforeEach(() => {
    jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
    jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
});
afterEach(() => jest.restoreAllMocks());

describe('PhotoEditor', () => {
    it('is closed while not open', () => {
        render(<PhotoEditor {...props({ open: false })} />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('shows the picked items with where it is among them, under its own name', () => {
        render(<PhotoEditor {...props({ index: 1, labels: { title: 'Edit', counter: (p, t) => `${p} of ${t}` } })} />);

        expect(screen.getByRole('dialog', { name: 'Edit' })).toBeInTheDocument();
        expect(screen.getByText('2 of 3')).toBeInTheDocument();
        expect(showingPage().querySelector('[data-edited-photo] img')).toHaveAttribute('src', 'blob:photo-1');
    });

    it('draws no count for a single item', () => {
        render(<PhotoEditor {...props({ items: photos(1) })} />);

        expect(screen.queryByText('1 / 1')).not.toBeInTheDocument();
    });

    it('draws only the showing page and its neighbours', () => {
        render(<PhotoEditor {...props({ items: photos(6), index: 3 })} />);

        const drawn = Array.from(dialog().querySelectorAll('[data-page]')).map(page =>
            page.querySelector('img')?.getAttribute('src')
        );
        expect(drawn).toEqual([undefined, undefined, 'blob:photo-2', 'blob:photo-3', 'blob:photo-4', undefined]);
        // The neighbours are there for the swipe, but not for a screen reader.
        expect(dialog().querySelectorAll('[data-page]:not([aria-hidden])')).toHaveLength(1);
    });

    describe('pager', () => {
        it('turns the page on a horizontal swipe, either way', () => {
            const onIndexChange = jest.fn();
            render(<PhotoEditor {...props({ index: 1, onIndexChange })} />);

            drag(pager(), [300, 300], [150, 310]);
            drag(pager(), [150, 300], [300, 290]);

            expect(onIndexChange.mock.calls).toEqual([[2], [0]]);
        });

        it('moves the strip under the finger and gives only a little past the last item', () => {
            render(<PhotoEditor {...props({ index: 2 })} />);

            fireEvent(pager(), pointer('pointerdown', [300, 300]));
            fireEvent(pager(), pointer('pointermove', [200, 300]));
            expect(strip().style.transform).toBe('translate3d(calc(-200% + -30px), 0, 0)');
            expect(strip()).not.toHaveClass('transition-transform');

            fireEvent(pager(), pointer('pointerup', [200, 300]));
            expect(strip().style.transform).toBe('translate3d(calc(-200% + 0px), 0, 0)');
        });

        // Leaving loses what was edited, so nothing but the ✕ and Done leaves.
        it('does not close or page on a tap, a short drag or a pull down', () => {
            const onIndexChange = jest.fn();
            const onCancel = jest.fn();
            render(<PhotoEditor {...props({ index: 1, onIndexChange, onCancel })} />);

            fireEvent(pager(), pointer('pointerdown', [200, 300]));
            fireEvent(pager(), pointer('pointerup', [200, 300]));
            fireEvent.click(pager());
            drag(pager(), [200, 300], [190, 300]);
            drag(pager(), [200, 100], [210, 500]);

            expect(onIndexChange).not.toHaveBeenCalled();
            expect(onCancel).not.toHaveBeenCalled();
        });

        it('lets a second finger cancel the swipe', () => {
            const onIndexChange = jest.fn();
            render(<PhotoEditor {...props({ index: 1, onIndexChange })} />);

            fireEvent(pager(), pointer('pointerdown', [300, 300], 1));
            fireEvent(pager(), pointer('pointermove', [150, 300], 1));
            fireEvent(pager(), pointer('pointerdown', [100, 300], 2, false));
            fireEvent(pager(), pointer('pointerup', [150, 300], 1));

            expect(onIndexChange).not.toHaveBeenCalled();
            expect(strip().style.transform).toBe('translate3d(calc(-100% + 0px), 0, 0)');
        });

        // A release outside the pager before the drag was captured never reaches it.
        it('starts afresh on the next press after a release it never saw', () => {
            const onIndexChange = jest.fn();
            render(<PhotoEditor {...props({ index: 1, onIndexChange })} />);

            fireEvent(pager(), pointer('pointerdown', [100, 300]));
            drag(pager(), [300, 300], [150, 300]);

            expect(onIndexChange.mock.calls).toEqual([[2]]);
        });

        it('steps with the arrow keys', () => {
            const onIndexChange = jest.fn();
            render(<PhotoEditor {...props({ index: 1, onIndexChange })} />);

            fireEvent.keyDown(dialog(), { key: 'ArrowRight' });
            fireEvent.keyDown(dialog(), { key: 'ArrowLeft' });

            expect(onIndexChange.mock.calls).toEqual([[2], [0]]);
        });
    });

    describe('thumbnail strip', () => {
        it('rings the showing item and jumps to a tapped one', () => {
            const onIndexChange = jest.fn();
            render(<PhotoEditor {...props({ index: 0, onIndexChange, labels: { thumbnail: p => `Item ${p}` } })} />);

            expect(screen.getByRole('button', { name: 'Item 1' })).toHaveAttribute('aria-current', 'true');
            expect(screen.getByRole('button', { name: 'Item 3' })).not.toHaveAttribute('aria-current');

            fireEvent.click(screen.getByRole('button', { name: 'Item 3' }));
            fireEvent.click(screen.getByRole('button', { name: 'Item 1' }));

            expect(onIndexChange.mock.calls).toEqual([[2]]);
        });

        it('draws an edited item with its edit and an unedited one from its preview', () => {
            const edit: PhotoEdit = { ...IDENTITY_PHOTO_EDIT, rotation: 90 };
            render(<PhotoEditor {...props({ items: [photo(0, { edit }), photo(1)] })} />);

            const edited = screen.getByRole('button', { name: 'Photo 1' });
            const plain = screen.getByRole('button', { name: 'Photo 2' });
            expect(edited.querySelector('[data-edited-photo] img')).toHaveAttribute('src', 'blob:photo-0');
            expect(plain.querySelector('img')).toHaveAttribute('src', 'data:preview-1');
        });

        it('is left out for a single item', () => {
            render(<PhotoEditor {...props({ items: photos(1) })} />);

            expect(screen.queryByRole('button', { name: 'Photo 1' })).not.toBeInTheDocument();
        });
    });

    describe('leaving and sending', () => {
        it('asks the host from the close button, and reports Done and Send', () => {
            const onCancel = jest.fn();
            const onDone = jest.fn();
            const onSend = jest.fn();
            render(<PhotoEditor {...props({ onCancel, onDone, onSend })} />);

            fireEvent.click(screen.getByRole('button', { name: 'Close' }));
            fireEvent.click(screen.getByRole('button', { name: 'Done' }));
            fireEvent.click(screen.getByRole('button', { name: 'Send 3' }));

            expect(onCancel).toHaveBeenCalledTimes(1);
            expect(onDone).toHaveBeenCalledTimes(1);
            expect(onSend).toHaveBeenCalledTimes(1);
        });

        // Android's back arrives as Escape; the host may want to confirm before anything closes.
        it('asks the host on Escape and stays open until the host closes it', () => {
            const onCancel = jest.fn();
            render(<PhotoEditor {...props({ onCancel })} />);

            fireEvent.keyDown(dialog(), { key: 'Escape' });

            expect(onCancel).toHaveBeenCalledTimes(1);
            expect(screen.getByRole('dialog')).toBeInTheDocument();
        });

        it('greys the send button out and marks it busy while sending', () => {
            const onSend = jest.fn();
            render(<PhotoEditor {...props({ onSend, sending: true, sendLabel: 'Preparing' })} />);

            const send = screen.getByRole('button', { name: 'Preparing' });
            expect(send).toBeDisabled();
            expect(send).toHaveAttribute('aria-busy', 'true');
            fireEvent.click(send);
            expect(onSend).not.toHaveBeenCalled();
        });

        it('stays open when something drawn over it, such as a toast, is pressed', async () => {
            const onCancel = jest.fn();
            render(
                <>
                    <PhotoEditor {...props({ onCancel })} />
                    <button type="button">toast action</button>
                </>
            );
            // Radix arms its outside-press listener on the next tick.
            await new Promise(resolve => setTimeout(resolve, 0));

            const action = screen.getByText('toast action');
            fireEvent.pointerDown(action);
            fireEvent.pointerUp(action);
            fireEvent.click(action);

            expect(onCancel).not.toHaveBeenCalled();
        });
    });

    describe('items the tool cannot open on', () => {
        it('shows a video with its poster and mark, greys the tool and says why', () => {
            render(
                <PhotoEditor
                    {...props({
                        items: [
                            photo(0, { kind: 'video', editable: false, durationMs: 65_000, src: undefined }),
                            photo(1),
                        ],
                        labels: { notEditable: 'Cannot edit videos' },
                    })}
                />
            );

            expect(showingPage().querySelector('img')).toHaveAttribute('src', 'data:preview-0');
            expect(within(showingPage()).getByText('1:05')).toBeInTheDocument();
            expect(cropButton()).toBeDisabled();
            expect(screen.getByText('Cannot edit videos')).toBeInTheDocument();
        });

        it('shows the preview with a spinner while the photo is still being read', () => {
            render(
                <PhotoEditor
                    {...props({
                        items: [photo(0, { src: undefined, width: undefined, height: undefined })],
                        labels: { loading: 'Loading' },
                    })}
                />
            );

            expect(showingPage().querySelector('img[data-placeholder]')).toHaveAttribute('src', 'data:preview-0');
            expect(showingPage().querySelector('.animate-spin')).toBeInTheDocument();
            expect(cropButton()).toBeDisabled();
            expect(screen.getByText('Loading')).toBeInTheDocument();
        });

        it('promises nothing for a GIF that is never read', () => {
            render(
                <PhotoEditor
                    {...props({
                        items: [photo(0, { editable: false, src: undefined, width: undefined, height: undefined })],
                    })}
                />
            );

            expect(showingPage().querySelector('img[data-placeholder]')).toBeInTheDocument();
            expect(showingPage().querySelector('.animate-spin')).toBeNull();
            expect(screen.getByText('Videos and GIFs cannot be edited')).toBeInTheDocument();
        });

        it('says so on the page and under the toolbar when the photo could not be read', () => {
            render(
                <PhotoEditor
                    {...props({ items: [photo(0, { failed: true })], labels: { failed: 'Could not load' } })}
                />
            );

            expect(within(showingPage()).getByText('Could not load')).toBeInTheDocument();
            expect(dialog().querySelector('[data-status="failed"]')).toHaveTextContent('Could not load');
            expect(cropButton()).toBeDisabled();
        });

        it('draws a loaded photo with its edit and says nothing under the toolbar', () => {
            render(
                <PhotoEditor {...props({ items: [photo(0, { edit: { ...IDENTITY_PHOTO_EDIT, rotation: 90 } })] })} />
            );

            const img = showingPage().querySelector('[data-edited-photo] img') as HTMLImageElement;
            expect(img.style.width).toBe('4000px');
            expect(img.style.transform).toMatch(/^matrix\(0, /);
            expect(cropButton()).toBeEnabled();
            expect(dialog().querySelector('[data-status]')).toBeNull();
        });
    });

    describe('closing', () => {
        // jsdom runs no animations, so Radix would unmount at once. Report an exit animation on the
        // closed state, as the browser does, so the editor stays up while it would be sliding away.
        beforeEach(() => {
            const real = window.getComputedStyle.bind(window);
            jest.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
                const style = real(element, pseudo);
                const closed = element.getAttribute('data-state') === 'closed';
                return new Proxy(style, {
                    get: (target, key) => {
                        if (key === 'animationName') return closed ? 'slide-out' : 'slide-in';
                        const value = Reflect.get(target, key);
                        return typeof value === 'function' ? value.bind(target) : value;
                    },
                });
            });
        });

        it('keeps showing the photo it had while it slides away, though the host cleared the pick', () => {
            const { rerender } = render(<PhotoEditor {...props({ index: 1 })} />);

            rerender(<PhotoEditor {...props({ open: false, items: [], index: 0 })} />);

            const content = document.querySelector('[data-state="closed"][role="dialog"]') as HTMLElement;
            expect(content).toBeInTheDocument();
            expect(content.querySelector('[data-page]:not([aria-hidden]) [data-edited-photo] img')).toHaveAttribute(
                'src',
                'blob:photo-1'
            );
        });
    });

    describe('snackbar lift', () => {
        it('lifts the snackbar above the footer while open, and drops it once closed', () => {
            const { rerender } = render(<PhotoEditor {...props()} />);
            // Every box measures 600 tall here.
            expect(lift()).toBe('600px');

            rerender(<PhotoEditor {...props({ open: false })} />);
            expect(lift()).toBe('');
        });
    });

    describe('crop mode', () => {
        const openCrop = (overrides: Partial<PhotoEditorProps> = {}) => {
            const onEditChange = jest.fn();
            const utils = render(<PhotoEditor {...props({ onEditChange, ...overrides })} />);
            fireEvent.click(cropButton());
            return { onEditChange, ...utils };
        };

        it('swaps the pager, the strip and send for the crop stage and its tools', () => {
            openCrop();

            expect(stage()).toBeInTheDocument();
            expect(pager()).toBeNull();
            expect(screen.queryByRole('button', { name: 'Send 3' })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Photo 1' })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Rotate left' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Flip' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Free' })).toHaveAttribute('aria-pressed', 'true');
        });

        it('draws the whole photo with the crop box over it, eight handles and the thirds', () => {
            openCrop({
                items: [
                    photo(0, { edit: { ...IDENTITY_PHOTO_EDIT, crop: { x: 0.25, y: 0.5, width: 0.5, height: 0.25 } } }),
                ],
            });

            const placed = dialog().querySelector('[data-crop-photo]') as HTMLElement;
            expect(placed.style.width).toBe(`${STAGE_PHOTO.width}px`);
            expect(placed.style.height).toBe(`${STAGE_PHOTO.height}px`);
            expect(cropBox().style.left).toBe('25%');
            expect(cropBox().style.top).toBe('50%');
            expect(cropBox().style.width).toBe('50%');
            expect(cropBox().style.height).toBe('25%');
            for (const name of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
                expect(handle(name)).toHaveClass('touch-none');
            }
        });

        it('resizes the box from a corner handle and reports it on Apply', () => {
            const { onEditChange } = openCrop();

            // A tenth of the width in, from the bottom-right corner.
            drag(handle('se'), [376, 432], [376 - STAGE_PHOTO.width / 10, 432]);
            expect(onEditChange).not.toHaveBeenCalled();
            fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

            const edit = lastEdit(onEditChange);
            expect(onEditChange.mock.calls[0][0]).toBe('p0');
            expect(edit.crop.x).toBeCloseTo(0, 6);
            expect(edit.crop.width).toBeCloseTo(0.9, 6);
            expect(edit.crop.height).toBeCloseTo(1, 6);
            // Back out of crop mode.
            expect(stage()).toBeNull();
        });

        it('moves the box with a drag inside it, keeping it on the photo', () => {
            const { onEditChange } = openCrop({
                items: [
                    photo(0, { edit: { ...IDENTITY_PHOTO_EDIT, crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } } }),
                ],
            });

            drag(cropBox(), [200, 300], [200 + STAGE_PHOTO.width / 10, 300 + STAGE_PHOTO.height]);
            fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

            const { crop } = lastEdit(onEditChange);
            expect(crop.x).toBeCloseTo(0.35, 6);
            expect(crop.y).toBeCloseTo(0.5, 6);
            expect(crop.width).toBeCloseTo(0.5, 6);
        });

        it('keeps a chosen aspect while a corner is dragged', () => {
            const { onEditChange } = openCrop();

            fireEvent.click(screen.getByRole('button', { name: '1:1' }));
            expect(screen.getByRole('button', { name: '1:1' })).toHaveAttribute('aria-pressed', 'true');
            drag(handle('se'), [300, 400], [300 - 50, 400]);
            fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

            const { crop, aspect } = lastEdit(onEditChange);
            expect(aspect).toBe('1:1');
            // Square in pixels: the normalised height is the width times 4000 / 3000.
            expect(crop.height).toBeCloseTo((crop.width * 4000) / 3000, 6);
            expect(crop.width).toBeLessThan(0.75);
        });

        it('ignores a second finger while one drags the box', () => {
            const { onEditChange } = openCrop();

            fireEvent(handle('se'), pointer('pointerdown', [376, 432], 1));
            fireEvent(handle('nw'), pointer('pointerdown', [24, 168], 2, false));
            fireEvent(handle('nw'), pointer('pointermove', [124, 268], 2, false));
            fireEvent(handle('se'), pointer('pointermove', [376 - STAGE_PHOTO.width / 10, 432], 1));
            fireEvent(handle('se'), pointer('pointerup', [376 - STAGE_PHOTO.width / 10, 432], 1));
            fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

            const { crop } = lastEdit(onEditChange);
            expect(crop.x).toBeCloseTo(0, 6);
            expect(crop.y).toBeCloseTo(0, 6);
            expect(crop.width).toBeCloseTo(0.9, 6);
        });

        it('does not let the box be dragged smaller than a finger can hold', () => {
            const { onEditChange } = openCrop();

            drag(handle('se'), [376, 432], [0, 0]);
            fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

            const { crop } = lastEdit(onEditChange);
            expect(crop.width * STAGE_PHOTO.width).toBeCloseTo(48, 6);
            expect(crop.height * STAGE_PHOTO.height).toBeCloseTo(48, 6);
        });

        it('rotates and flips the draft', () => {
            const { onEditChange } = openCrop();

            fireEvent.click(screen.getByRole('button', { name: 'Rotate left' }));
            fireEvent.click(screen.getByRole('button', { name: 'Flip' }));
            // Turned, the photo is drawn 3000 wide by 4000 tall.
            const placed = dialog().querySelector('[data-crop-photo]') as HTMLElement;
            expect(parseFloat(placed.style.width)).toBeLessThan(parseFloat(placed.style.height));
            fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

            // A left turn, then a mirror of what is shown: stored as a mirrored source turned right.
            expect(lastEdit(onEditChange)).toMatchObject({ rotation: 90, flipH: true });
        });

        it('takes the draft back to the untouched photo on Reset, which still needs Apply', () => {
            const { onEditChange } = openCrop({
                items: [photo(0, { edit: { ...IDENTITY_PHOTO_EDIT, rotation: 270 } })],
            });

            fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
            expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled();
            expect(onEditChange).not.toHaveBeenCalled();

            fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
            expect(lastEdit(onEditChange)).toEqual(IDENTITY_PHOTO_EDIT);
        });

        it('has nothing to reset on an untouched photo', () => {
            openCrop();

            expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled();
        });

        it('opens on the edit the photo already has', () => {
            const edit: PhotoEdit = {
                rotation: 180,
                flipH: false,
                crop: { x: 0, y: 0, width: 1, height: 0.75 },
                aspect: '4:3',
            };
            openCrop({ items: [photo(0, { edit })] });

            expect(screen.getByRole('button', { name: '4:3' })).toHaveAttribute('aria-pressed', 'true');
            expect(cropBox().style.height).toBe('75%');
        });

        it('drops the draft on Cancel, keeping the editor open', () => {
            const { onEditChange } = openCrop();

            fireEvent.click(screen.getByRole('button', { name: 'Rotate left' }));
            fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

            expect(onEditChange).not.toHaveBeenCalled();
            expect(stage()).toBeNull();
            expect(screen.getByRole('button', { name: 'Send 3' })).toBeInTheDocument();
        });

        it('leaves crop mode on Escape without asking the host to leave the editor', () => {
            const onCancel = jest.fn();
            const { onEditChange } = openCrop({ onCancel });

            fireEvent.click(screen.getByRole('button', { name: 'Rotate left' }));
            fireEvent.keyDown(dialog(), { key: 'Escape' });

            expect(stage()).toBeNull();
            expect(onCancel).not.toHaveBeenCalled();
            expect(onEditChange).not.toHaveBeenCalled();
            expect(screen.getByRole('dialog')).toBeInTheDocument();
        });

        it('does not page while cropping', () => {
            const onIndexChange = jest.fn();
            openCrop({ onIndexChange });

            fireEvent.keyDown(dialog(), { key: 'ArrowRight' });

            expect(onIndexChange).not.toHaveBeenCalled();
        });

        it('drops the draft when the host moves to another page', () => {
            const { rerender } = openCrop();
            fireEvent.click(screen.getByRole('button', { name: 'Rotate left' }));

            rerender(<PhotoEditor {...props({ index: 1 })} />);
            expect(stage()).toBeNull();

            rerender(<PhotoEditor {...props({ index: 0 })} />);
            expect(stage()).toBeNull();
        });
    });
});
