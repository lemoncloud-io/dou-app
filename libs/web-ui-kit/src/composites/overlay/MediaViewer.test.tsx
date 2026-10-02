import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createPortal } from 'react-dom';

import {
    MEDIA_VIEWER_FOOTER_TOAST_LIFT,
    MediaViewer,
    MediaViewerActionButton,
    type MediaViewerItem,
} from './MediaViewer';

const images = ['https://example.com/a.jpg', 'https://example.com/b.jpg', 'https://example.com/c.jpg'];
const photo = (src: string | undefined, i: number, preview?: string): MediaViewerItem => ({
    key: `photo-${i}`,
    kind: 'image',
    src,
    preview,
    state: 'ready',
});
const photos = (srcs: (string | undefined)[], previews?: string[]) =>
    srcs.map((src, i) => photo(src, i, previews?.[i]));
const items = photos(images);

const shown = () => screen.getByRole('dialog').querySelector('img[data-current]') as HTMLImageElement;
const strip = () => screen.getByRole('dialog').querySelector('.flex') as HTMLElement;

// jsdom's PointerEvent drops clientX/Y from the init, so the coordinates are hung on the event.
const pointer = (type: string, [x, y]: [number, number], pointerId = 1) => {
    const event = new Event(type, { bubbles: true });
    Object.assign(event, { clientX: x, clientY: y, pointerId });
    return event;
};
const press = (target: Element, from: [number, number], to: [number, number]) => {
    fireEvent(target, pointer('pointerdown', from));
    fireEvent(target, pointer('pointermove', to));
};
const drag = (target: Element, from: [number, number], to: [number, number]) => {
    press(target, from, to);
    fireEvent(target, pointer('pointerup', to));
};
const pinch = (
    target: Element,
    from: [[number, number], [number, number]],
    to: [[number, number], [number, number]]
) => {
    fireEvent(target, pointer('pointerdown', from[0], 1));
    fireEvent(target, pointer('pointerdown', from[1], 2));
    fireEvent(target, pointer('pointermove', to[0], 1));
    fireEvent(target, pointer('pointermove', to[1], 2));
    fireEvent(target, pointer('pointerup', to[0], 1));
    fireEvent(target, pointer('pointerup', to[1], 2));
};
const zoomIn = (target: Element) =>
    pinch(
        target,
        [
            [-50, 0],
            [50, 0],
        ],
        [
            [-100, 0],
            [100, 0],
        ]
    );
const tap = (target: Element, at: [number, number]) => {
    fireEvent(target, pointer('pointerdown', at));
    fireEvent(target, pointer('pointerup', at));
};

describe('MediaViewer', () => {
    it('is closed while nothing is chosen', () => {
        render(<MediaViewer items={items} index={null} onIndexChange={jest.fn()} onClose={jest.fn()} />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('shows the chosen image and where it is among them', () => {
        render(
            <MediaViewer
                items={items}
                index={1}
                onIndexChange={jest.fn()}
                onClose={jest.fn()}
                labels={{ title: '사진' }}
            />
        );

        expect(screen.getByRole('dialog', { name: '사진' })).toBeInTheDocument();
        expect(shown()).toHaveAttribute('src', images[1]);
        expect(screen.getByText('2 / 3')).toBeInTheDocument();
    });

    it('steps with the arrow buttons', () => {
        const onIndexChange = jest.fn();
        render(
            <MediaViewer
                items={items}
                index={1}
                onIndexChange={onIndexChange}
                onClose={jest.fn()}
                labels={{ previous: '이전', next: '다음' }}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: '다음' }));
        fireEvent.click(screen.getByRole('button', { name: '이전' }));

        expect(onIndexChange.mock.calls).toEqual([[2], [0]]);
    });

    // A count that jumps from the last back to "1" reads as a different message.
    it('stops at the ends instead of wrapping', () => {
        const { rerender } = render(
            <MediaViewer items={items} index={0} onIndexChange={jest.fn()} onClose={jest.fn()} />
        );
        expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();

        rerender(<MediaViewer items={items} index={2} onIndexChange={jest.fn()} onClose={jest.fn()} />);
        expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    });

    it('turns the page on a horizontal swipe, either way', () => {
        const onIndexChange = jest.fn();
        render(<MediaViewer items={items} index={1} onIndexChange={onIndexChange} onClose={jest.fn()} />);

        drag(shown(), [300, 400], [150, 410]);
        drag(shown(), [150, 400], [300, 390]);

        expect(onIndexChange.mock.calls).toEqual([[2], [0]]);
    });

    it('ignores a short or mostly vertical drag', () => {
        const onIndexChange = jest.fn();
        render(<MediaViewer items={items} index={1} onIndexChange={onIndexChange} onClose={jest.fn()} />);

        drag(shown(), [300, 400], [280, 400]);
        drag(shown(), [300, 400], [230, 600]);

        expect(onIndexChange).not.toHaveBeenCalled();
    });

    // A swipe that ends beside the image is followed by a click there; it must not close the viewer.
    it('does not close on the click that ends a swipe on the backdrop', () => {
        const onClose = jest.fn();
        render(<MediaViewer items={items} index={1} onIndexChange={jest.fn()} onClose={onClose} />);
        const backdrop = screen.getByRole('dialog');

        drag(backdrop, [300, 400], [100, 400]);
        fireEvent.click(backdrop);
        expect(onClose).not.toHaveBeenCalled();

        fireEvent.click(backdrop);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('moves the strip under the finger, and slides it into place on release', () => {
        render(<MediaViewer items={items} index={1} onIndexChange={jest.fn()} onClose={jest.fn()} />);

        expect(strip().style.transform).toBe('translate3d(calc(-100% + 0px), 0, 0)');
        press(shown(), [300, 400], [260, 402]);
        expect(strip().style.transform).toBe('translate3d(calc(-100% + -40px), 0, 0)');
        // No transition while held, so the strip keeps up with the finger.
        expect(strip()).not.toHaveClass('transition-transform');

        fireEvent(shown(), pointer('pointerup', [260, 402]));
        expect(strip().style.transform).toBe('translate3d(calc(-100% + 0px), 0, 0)');
        expect(strip()).toHaveClass('transition-transform');
    });

    it('gives only a little past the last image', () => {
        render(<MediaViewer items={items} index={2} onIndexChange={jest.fn()} onClose={jest.fn()} />);

        press(shown(), [300, 400], [200, 400]);

        expect(strip().style.transform).toBe('translate3d(calc(-200% + -30px), 0, 0)');
    });

    it('draws only the showing image and its neighbours', () => {
        const many = Array.from({ length: 6 }, (_, i) => `https://example.com/${i}.jpg`);
        render(<MediaViewer items={photos(many)} index={3} onIndexChange={jest.fn()} onClose={jest.fn()} />);

        const drawn = Array.from(screen.getByRole('dialog').querySelectorAll('img')).map(img =>
            img.getAttribute('src')
        );
        expect(drawn).toEqual([many[2], many[3], many[4]]);
    });

    it('lets go of a drag the browser cancels', () => {
        const onIndexChange = jest.fn();
        render(<MediaViewer items={items} index={1} onIndexChange={onIndexChange} onClose={jest.fn()} />);

        press(shown(), [300, 400], [100, 400]);
        fireEvent(shown(), pointer('pointercancel', [100, 400]));

        expect(strip().style.transform).toBe('translate3d(calc(-100% + 0px), 0, 0)');
        expect(onIndexChange).not.toHaveBeenCalled();
    });

    it('steps with the arrow keys', () => {
        const onIndexChange = jest.fn();
        render(<MediaViewer items={items} index={1} onIndexChange={onIndexChange} onClose={jest.fn()} />);

        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' });

        expect(onIndexChange.mock.calls).toEqual([[2], [0]]);
    });

    it('draws no count, arrows or swipe for a single image', () => {
        const onIndexChange = jest.fn();
        render(<MediaViewer items={[items[0]]} index={0} onIndexChange={onIndexChange} onClose={jest.fn()} />);

        expect(screen.queryByText('1 / 1')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
        drag(shown(), [300, 400], [100, 400]);
        expect(onIndexChange).not.toHaveBeenCalled();
    });

    it('closes from the button, and on a tap beside the image but not on the image', () => {
        const onClose = jest.fn();
        render(
            <MediaViewer
                items={items}
                index={0}
                onIndexChange={jest.fn()}
                onClose={onClose}
                labels={{ close: '닫기' }}
            />
        );

        fireEvent.click(shown());
        expect(onClose).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('dialog'));
        fireEvent.click(screen.getByRole('button', { name: '닫기' }));
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    // The count still matches what was sent, so a broken item keeps its page.
    it('draws a broken item as a placeholder page, counted with the rest', () => {
        const withBroken: MediaViewerItem[] = [items[0], { ...items[1], state: 'broken' }, items[2]];
        render(<MediaViewer items={withBroken} index={1} onIndexChange={jest.fn()} onClose={jest.fn()} />);

        expect(screen.getByText('2 / 3')).toBeInTheDocument();
        const page = screen.getByRole('dialog').querySelector('[data-page]:not([aria-hidden])') as HTMLElement;
        expect(page.querySelector('[data-broken]')).toBeInTheDocument();
        expect(page.querySelector('img')).toBeNull();
    });

    describe('actions', () => {
        it("draws the host's buttons for the showing item, and follows it to the next", () => {
            const renderFooter = jest.fn((index: number) => <button type="button">save {index}</button>);
            const { rerender } = render(
                <MediaViewer
                    items={items}
                    index={1}
                    onIndexChange={jest.fn()}
                    onClose={jest.fn()}
                    renderFooter={renderFooter}
                />
            );
            expect(screen.getByRole('button', { name: 'save 1' })).toBeTruthy();
            expect(renderFooter).toHaveBeenLastCalledWith(1);

            rerender(
                <MediaViewer
                    items={items}
                    index={2}
                    onIndexChange={jest.fn()}
                    onClose={jest.fn()}
                    renderFooter={renderFooter}
                />
            );
            expect(screen.getByRole('button', { name: 'save 2' })).toBeTruthy();
        });

        it('draws nothing extra without renderFooter', () => {
            render(
                <MediaViewer
                    items={items}
                    index={0}
                    onIndexChange={jest.fn()}
                    onClose={jest.fn()}
                    labels={{ close: '닫기' }}
                />
            );
            const buttons = screen.getAllByRole('button').map(button => button.getAttribute('aria-label'));
            expect(buttons).toEqual(['Next', '닫기']);
        });

        it('does not close when an action is pressed', () => {
            const onClose = jest.fn();
            const onSave = jest.fn();
            render(
                <MediaViewer
                    items={items}
                    index={0}
                    onIndexChange={jest.fn()}
                    onClose={onClose}
                    renderFooter={() => (
                        <MediaViewerActionButton label="저장" onClick={onSave}>
                            S
                        </MediaViewerActionButton>
                    )}
                />
            );
            fireEvent.click(screen.getByRole('button', { name: '저장' }));
            expect(onSave).toHaveBeenCalledTimes(1);
            expect(onClose).not.toHaveBeenCalled();
        });
    });

    it('stays open when something drawn over it, such as a toast, is pressed', async () => {
        const onClose = jest.fn();
        render(
            <>
                <MediaViewer items={items} index={0} onIndexChange={jest.fn()} onClose={onClose} />
                <button type="button">toast action</button>
            </>
        );
        // Radix arms its outside-press listener on the next tick.
        await new Promise(resolve => setTimeout(resolve, 0));

        const action = screen.getByText('toast action');
        fireEvent.pointerDown(action);
        fireEvent.pointerUp(action);
        fireEvent.click(action);

        expect(onClose).not.toHaveBeenCalled();
    });

    it('ignores keys and drags on something a host portals out of its footer, such as a sheet', () => {
        const onIndexChange = jest.fn();
        render(
            <MediaViewer
                items={items}
                index={1}
                onIndexChange={onIndexChange}
                onClose={jest.fn()}
                renderFooter={() => createPortal(<button type="button">sheet option</button>, document.body)}
            />
        );
        const option = screen.getByText('sheet option');

        fireEvent.keyDown(option, { key: 'ArrowRight' });
        fireEvent.keyDown(option, { key: 'ArrowLeft' });

        expect(onIndexChange).not.toHaveBeenCalled();
    });

    describe('MediaViewerActionButton', () => {
        it('shows its icon, or a spinner while busy, or a ring once progress is known', () => {
            const { rerender } = render(
                <MediaViewerActionButton label="저장" onClick={jest.fn()}>
                    <span data-testid="icon" />
                </MediaViewerActionButton>
            );
            expect(screen.getByTestId('icon')).toBeTruthy();

            rerender(
                <MediaViewerActionButton label="저장" onClick={jest.fn()} busy>
                    <span data-testid="icon" />
                </MediaViewerActionButton>
            );
            const busy = screen.getByRole('button', { name: '저장' });
            expect(busy.getAttribute('aria-busy')).toBe('true');
            // Still focusable, so focus stays on the button just pressed.
            expect((busy as HTMLButtonElement).disabled).toBe(false);
            expect(busy.getAttribute('aria-disabled')).toBe('true');
            expect(screen.queryByTestId('icon')).toBeNull();
            expect(busy.querySelector('[data-progress]')).toBeNull();

            rerender(
                <MediaViewerActionButton label="저장" onClick={jest.fn()} busy progress={0.42}>
                    <span data-testid="icon" />
                </MediaViewerActionButton>
            );
            expect(busy.querySelector('[data-progress]')?.getAttribute('data-progress')).toBe('42');
            expect(screen.getByRole('progressbar', { name: '저장' }).getAttribute('aria-valuenow')).toBe('42');
        });

        it('ignores presses while busy', () => {
            const onClick = jest.fn();
            render(
                <MediaViewerActionButton label="저장" onClick={onClick} busy>
                    S
                </MediaViewerActionButton>
            );
            fireEvent.click(screen.getByRole('button', { name: '저장' }));
            expect(onClick).not.toHaveBeenCalled();
        });

        it('does nothing while disabled', () => {
            const onClick = jest.fn();
            render(
                <MediaViewerActionButton label="공유" onClick={onClick} disabled>
                    S
                </MediaViewerActionButton>
            );
            fireEvent.click(screen.getByRole('button', { name: '공유' }));
            expect(onClick).not.toHaveBeenCalled();
        });
    });

    describe('previews', () => {
        const thumbs = ['https://example.com/a-t.jpg', 'https://example.com/b-t.jpg', 'https://example.com/c-t.jpg'];
        // The showing page is the one without aria-hidden.
        const placeholder = () =>
            screen.getByRole('dialog').querySelector('[data-page]:not([aria-hidden]) img[data-placeholder]');

        // An original can take seconds; the small copy stands in until it has arrived.
        it('draws the preview under the original until the original loads', () => {
            render(
                <MediaViewer items={photos(images, thumbs)} index={1} onIndexChange={jest.fn()} onClose={jest.fn()} />
            );
            expect(placeholder()).toHaveAttribute('src', thumbs[1]);

            fireEvent.load(shown());

            expect(placeholder()).toBeNull();
            expect(shown()).toHaveAttribute('src', images[1]);
        });

        it('shows only the preview while the original has no address yet', () => {
            render(
                <MediaViewer
                    items={photos([undefined], [thumbs[0]])}
                    index={0}
                    onIndexChange={jest.fn()}
                    onClose={jest.fn()}
                />
            );

            expect(screen.getByRole('dialog').querySelector('img[data-current]')).toBeNull();
            expect(placeholder()).toHaveAttribute('src', thumbs[0]);
        });

        // A refreshed address is a new download; the preview covers it again until it lands.
        it('brings the preview back for a new address', () => {
            const { rerender } = render(
                <MediaViewer items={photos(images, thumbs)} index={0} onIndexChange={jest.fn()} onClose={jest.fn()} />
            );
            fireEvent.load(shown());
            expect(placeholder()).toBeNull();

            rerender(
                <MediaViewer
                    items={photos(['https://example.com/a-fresh.jpg', ...images.slice(1)], thumbs)}
                    index={0}
                    onIndexChange={jest.fn()}
                    onClose={jest.fn()}
                />
            );

            expect(placeholder()).toHaveAttribute('src', thumbs[0]);
        });
    });

    it('reports which image failed to load', () => {
        const onError = jest.fn();
        render(<MediaViewer items={items} index={2} onIndexChange={jest.fn()} onClose={jest.fn()} onError={onError} />);

        fireEvent.error(shown());

        expect(onError).toHaveBeenCalledWith(2);
    });

    describe('zoom', () => {
        // jsdom lays nothing out: give the page and the photo sizes so a pan has somewhere to go.
        // The page's centre is the origin, since jsdom's bounding rect is all zeros.
        beforeEach(() => {
            jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
            jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(800);
            jest.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(400);
            jest.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(300);
        });
        afterEach(() => jest.restoreAllMocks());

        const layer = () => screen.getByRole('dialog').querySelector('[data-zoom-layer]') as HTMLElement;
        const content = () => screen.getByRole('dialog');

        it('scales the showing photo with a pinch', () => {
            render(<MediaViewer items={items} index={1} onIndexChange={jest.fn()} onClose={jest.fn()} />);

            zoomIn(content());

            expect(layer().style.transform).toContain('scale(2)');
        });

        it('lets a pinch that ends barely zoomed fit the page again', () => {
            render(<MediaViewer items={items} index={1} onIndexChange={jest.fn()} onClose={jest.fn()} />);

            pinch(
                content(),
                [
                    [-50, 0],
                    [50, 0],
                ],
                [
                    [-51, 0],
                    [51, 0],
                ]
            );

            expect(layer().style.transform).toContain('scale(1)');
        });

        // Zoomed, a drag moves the photo; it does not turn the page.
        it('pans a zoomed photo instead of turning the page, up to its edge', () => {
            const onIndexChange = jest.fn();
            render(<MediaViewer items={items} index={1} onIndexChange={onIndexChange} onClose={jest.fn()} />);
            zoomIn(content());

            drag(content(), [0, 0], [-300, 0]);

            expect(onIndexChange).not.toHaveBeenCalled();
            // 2x of a 400-wide photo on a 400-wide page leaves 200 of travel each way.
            expect(layer().style.transform).toContain('translate3d(-200px, 0px, 0)');
        });

        it('zooms in on a double tap on the photo, and back out on the next', () => {
            render(<MediaViewer items={items} index={1} onIndexChange={jest.fn()} onClose={jest.fn()} />);

            tap(shown(), [0, 0]);
            tap(shown(), [0, 0]);
            expect(layer().style.transform).toContain('scale(2.5)');

            tap(shown(), [0, 0]);
            tap(shown(), [0, 0]);
            expect(layer().style.transform).toContain('scale(1)');
        });

        it('does not zoom on two taps far apart in time', () => {
            const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
            render(<MediaViewer items={items} index={1} onIndexChange={jest.fn()} onClose={jest.fn()} />);

            tap(shown(), [0, 0]);
            now.mockReturnValue(1500);
            tap(shown(), [0, 0]);

            expect(layer().style.transform).toContain('scale(1)');
        });

        it('does not close on a tap beside a zoomed photo', () => {
            const onClose = jest.fn();
            render(<MediaViewer items={items} index={1} onIndexChange={jest.fn()} onClose={onClose} />);
            zoomIn(content());

            fireEvent.click(layer());

            expect(onClose).not.toHaveBeenCalled();
        });

        it('starts the next page fitted', () => {
            const { rerender } = render(
                <MediaViewer items={items} index={1} onIndexChange={jest.fn()} onClose={jest.fn()} />
            );
            zoomIn(content());

            rerender(<MediaViewer items={items} index={2} onIndexChange={jest.fn()} onClose={jest.fn()} />);

            expect(layer().style.transform).toContain('scale(1)');
        });
    });

    describe('video', () => {
        const clip = (i: number, extra: Partial<MediaViewerItem> = {}): MediaViewerItem => ({
            key: `video-${i}`,
            kind: 'video',
            src: `https://example.com/v${i}.mp4`,
            preview: `https://example.com/v${i}-poster.jpg`,
            state: 'ready',
            ...extra,
        });
        // A photo, a video, a photo: the video sits between two pages to turn to.
        const mixed = [items[0], clip(1), items[2]];
        const video = () => screen.getByRole('dialog').querySelector('video') as HTMLVideoElement;

        let play: jest.SpyInstance;
        let pause: jest.SpyInstance;
        let load: jest.SpyInstance;
        beforeEach(() => {
            play = jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
            pause = jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
            load = jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
        });
        // Unmount while the stubs are still in place: closing releases the video, and jsdom has no
        // `pause` or `load` of its own.
        afterEach(() => {
            cleanup();
            jest.restoreAllMocks();
        });

        it("plays with the browser's controls, inline, its poster showing until it starts", () => {
            render(<MediaViewer items={mixed} index={1} onIndexChange={jest.fn()} onClose={jest.fn()} />);

            expect(video()).toHaveAttribute('src', mixed[1].src);
            expect(video()).toHaveAttribute('poster', mixed[1].preview);
            expect(video()).toHaveAttribute('controls');
            expect(video()).toHaveAttribute('playsinline');
            expect(video()).toHaveAttribute('preload', 'metadata');
            expect(screen.getByText('2 / 3')).toBeInTheDocument();
        });

        // Prefetching a video is a download the user may never watch.
        it('draws only the poster of a neighbouring video', () => {
            render(<MediaViewer items={mixed} index={0} onIndexChange={jest.fn()} onClose={jest.fn()} />);

            expect(screen.getByRole('dialog').querySelector('video')).toBeNull();
            expect(screen.getByRole('dialog').querySelector('img[data-poster]')).toHaveAttribute(
                'src',
                mixed[1].preview
            );
        });

        it('starts the video it opened on with autoPlay, and not without', () => {
            const { rerender } = render(
                <MediaViewer items={mixed} index={null} onIndexChange={jest.fn()} onClose={jest.fn()} autoPlay />
            );
            rerender(<MediaViewer items={mixed} index={1} onIndexChange={jest.fn()} onClose={jest.fn()} autoPlay />);
            expect(play).toHaveBeenCalled();
            expect(play.mock.contexts.at(-1)).toBe(video());

            rerender(<MediaViewer items={mixed} index={null} onIndexChange={jest.fn()} onClose={jest.fn()} />);
            play.mockClear();
            rerender(<MediaViewer items={mixed} index={1} onIndexChange={jest.fn()} onClose={jest.fn()} />);
            expect(play).not.toHaveBeenCalled();
        });

        it('does not start a video paged to after opening', () => {
            const { rerender } = render(
                <MediaViewer items={mixed} index={0} onIndexChange={jest.fn()} onClose={jest.fn()} autoPlay />
            );
            rerender(<MediaViewer items={mixed} index={1} onIndexChange={jest.fn()} onClose={jest.fn()} autoPlay />);

            expect(play).not.toHaveBeenCalled();
        });

        it('offers a play button when the browser refuses to start it, which plays on a tap', async () => {
            play.mockRejectedValueOnce(Object.assign(new Error('refused'), { name: 'NotAllowedError' }));
            render(
                <MediaViewer
                    items={mixed}
                    index={1}
                    onIndexChange={jest.fn()}
                    onClose={jest.fn()}
                    autoPlay
                    labels={{ play: '재생' }}
                />
            );
            const button = await screen.findByRole('button', { name: '재생' });
            play.mockClear();

            fireEvent.click(button);
            expect(play).toHaveBeenCalledTimes(1);

            fireEvent.play(video());
            expect(screen.queryByRole('button', { name: '재생' })).toBeNull();
        });

        // An interrupted play is not a refusal; there is nothing to ask the user for.
        it('offers no play button for a play that was interrupted', async () => {
            play.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }));
            render(<MediaViewer items={mixed} index={1} onIndexChange={jest.fn()} onClose={jest.fn()} autoPlay />);
            await act(async () => undefined);

            expect(screen.queryByRole('button', { name: 'Play video' })).toBeNull();
        });

        it('stops, rewinds and lets go of a video paged away from', () => {
            const { rerender } = render(
                <MediaViewer items={mixed} index={1} onIndexChange={jest.fn()} onClose={jest.fn()} />
            );
            const left = video();
            left.currentTime = 12;

            rerender(<MediaViewer items={mixed} index={2} onIndexChange={jest.fn()} onClose={jest.fn()} />);

            expect(pause.mock.contexts).toContain(left);
            expect(left.currentTime).toBe(0);
            expect(left).not.toHaveAttribute('src');
            expect(load.mock.contexts).toContain(left);
            expect(screen.getByRole('dialog').querySelector('video')).toBeNull();
        });

        it('stops the video when the viewer closes', () => {
            const { rerender } = render(
                <MediaViewer items={mixed} index={1} onIndexChange={jest.fn()} onClose={jest.fn()} />
            );
            const playing = video();

            rerender(<MediaViewer items={mixed} index={null} onIndexChange={jest.fn()} onClose={jest.fn()} />);

            expect(pause.mock.contexts).toContain(playing);
            expect(playing).not.toHaveAttribute('src');
        });

        // The bottom of the video is its seek bar; a drag there scrubs, it does not page.
        it("leaves a drag on the video's controls alone, and pages on a drag above them", () => {
            const onIndexChange = jest.fn();
            render(<MediaViewer items={mixed} index={1} onIndexChange={onIndexChange} onClose={jest.fn()} />);
            jest.spyOn(video(), 'getBoundingClientRect').mockReturnValue({
                top: 100,
                bottom: 700,
                left: 0,
                right: 400,
                width: 400,
                height: 600,
                x: 0,
                y: 100,
                toJSON: () => ({}),
            });

            drag(video(), [300, 650], [100, 650]);
            expect(onIndexChange).not.toHaveBeenCalled();

            drag(video(), [300, 400], [100, 400]);
            expect(onIndexChange).toHaveBeenCalledWith(2);
        });

        it('does not zoom on a pinch or a double tap', () => {
            const onIndexChange = jest.fn();
            render(<MediaViewer items={mixed} index={1} onIndexChange={onIndexChange} onClose={jest.fn()} />);

            zoomIn(video());
            tap(video(), [0, 0]);
            tap(video(), [0, 0]);

            expect(screen.getByRole('dialog').querySelector('[style*="scale"]')).toBeNull();
            expect(onIndexChange).not.toHaveBeenCalled();
        });

        it('reports which video failed to load', () => {
            const onError = jest.fn();
            render(
                <MediaViewer items={mixed} index={1} onIndexChange={jest.fn()} onClose={jest.fn()} onError={onError} />
            );

            fireEvent.error(video());

            expect(onError).toHaveBeenCalledWith(1);
        });

        it('draws a video still on its way as its preview, and a broken one as the placeholder', () => {
            const { rerender } = render(
                <MediaViewer
                    items={[clip(0, { state: 'sending', src: undefined })]}
                    index={0}
                    onIndexChange={jest.fn()}
                    onClose={jest.fn()}
                />
            );
            expect(screen.getByRole('dialog').querySelector('video')).toBeNull();
            expect(screen.getByRole('dialog').querySelector('img[data-poster]')).toBeInTheDocument();

            rerender(
                <MediaViewer
                    items={[clip(0, { state: 'broken' })]}
                    index={0}
                    onIndexChange={jest.fn()}
                    onClose={jest.fn()}
                />
            );
            expect(screen.getByRole('dialog').querySelector('video')).toBeNull();
            expect(screen.getByRole('dialog').querySelector('[data-broken]')).toBeInTheDocument();
        });
    });

    describe('snackbar lift', () => {
        const lift = () => document.documentElement.style.getPropertyValue('--toast-lift');
        const footer = () => <button type="button">save</button>;

        it('lifts the snackbar above the action bar while the viewer shows it', () => {
            const { unmount } = render(
                <MediaViewer
                    items={items}
                    index={0}
                    onIndexChange={jest.fn()}
                    onClose={jest.fn()}
                    renderFooter={footer}
                />
            );
            expect(lift()).toBe(`${MEDIA_VIEWER_FOOTER_TOAST_LIFT}px`);
            unmount();
        });

        it('leaves the lift alone when there is no action bar', () => {
            render(<MediaViewer items={items} index={0} onIndexChange={jest.fn()} onClose={jest.fn()} />);
            expect(lift()).toBe('');
        });

        it('drops its lift once the viewer closes', () => {
            const { rerender } = render(
                <MediaViewer
                    items={items}
                    index={0}
                    onIndexChange={jest.fn()}
                    onClose={jest.fn()}
                    renderFooter={footer}
                />
            );
            rerender(
                <MediaViewer
                    items={items}
                    index={null}
                    onIndexChange={jest.fn()}
                    onClose={jest.fn()}
                    renderFooter={footer}
                />
            );
            expect(lift()).toBe('');
        });
    });
});
