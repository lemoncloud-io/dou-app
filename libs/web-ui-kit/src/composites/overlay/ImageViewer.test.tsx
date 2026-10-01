import { fireEvent, render, screen } from '@testing-library/react';

import { ImageViewer, ImageViewerActionButton } from './ImageViewer';
import { createPortal } from 'react-dom';

const images = ['https://example.com/a.jpg', 'https://example.com/b.jpg', 'https://example.com/c.jpg'];
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

describe('ImageViewer', () => {
    it('is closed while no image is chosen', () => {
        render(<ImageViewer images={images} index={null} onIndexChange={jest.fn()} onClose={jest.fn()} />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('shows the chosen image and where it is among them', () => {
        render(<ImageViewer images={images} index={1} onIndexChange={jest.fn()} onClose={jest.fn()} title="사진" />);

        expect(screen.getByRole('dialog', { name: '사진' })).toBeInTheDocument();
        expect(shown()).toHaveAttribute('src', images[1]);
        expect(screen.getByText('2 / 3')).toBeInTheDocument();
    });

    it('steps with the arrow buttons', () => {
        const onIndexChange = jest.fn();
        render(
            <ImageViewer
                images={images}
                index={1}
                onIndexChange={onIndexChange}
                onClose={jest.fn()}
                previousLabel="이전"
                nextLabel="다음"
            />
        );

        fireEvent.click(screen.getByRole('button', { name: '다음' }));
        fireEvent.click(screen.getByRole('button', { name: '이전' }));

        expect(onIndexChange.mock.calls).toEqual([[2], [0]]);
    });

    // A count that jumps from the last back to "1" reads as a different message.
    it('stops at the ends instead of wrapping', () => {
        const { rerender } = render(
            <ImageViewer images={images} index={0} onIndexChange={jest.fn()} onClose={jest.fn()} />
        );
        expect(screen.queryByRole('button', { name: 'Previous photo' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Next photo' })).toBeInTheDocument();

        rerender(<ImageViewer images={images} index={2} onIndexChange={jest.fn()} onClose={jest.fn()} />);
        expect(screen.queryByRole('button', { name: 'Next photo' })).not.toBeInTheDocument();
    });

    it('turns the page on a horizontal swipe, either way', () => {
        const onIndexChange = jest.fn();
        render(<ImageViewer images={images} index={1} onIndexChange={onIndexChange} onClose={jest.fn()} />);

        drag(shown(), [300, 400], [150, 410]);
        drag(shown(), [150, 400], [300, 390]);

        expect(onIndexChange.mock.calls).toEqual([[2], [0]]);
    });

    it('ignores a short or mostly vertical drag', () => {
        const onIndexChange = jest.fn();
        render(<ImageViewer images={images} index={1} onIndexChange={onIndexChange} onClose={jest.fn()} />);

        drag(shown(), [300, 400], [280, 400]);
        drag(shown(), [300, 400], [230, 600]);

        expect(onIndexChange).not.toHaveBeenCalled();
    });

    // A swipe that ends beside the image is followed by a click there; it must not close the viewer.
    it('does not close on the click that ends a swipe on the backdrop', () => {
        const onClose = jest.fn();
        render(<ImageViewer images={images} index={1} onIndexChange={jest.fn()} onClose={onClose} />);
        const backdrop = screen.getByRole('dialog');

        drag(backdrop, [300, 400], [100, 400]);
        fireEvent.click(backdrop);
        expect(onClose).not.toHaveBeenCalled();

        fireEvent.click(backdrop);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('moves the strip under the finger, and slides it into place on release', () => {
        render(<ImageViewer images={images} index={1} onIndexChange={jest.fn()} onClose={jest.fn()} />);

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
        render(<ImageViewer images={images} index={2} onIndexChange={jest.fn()} onClose={jest.fn()} />);

        press(shown(), [300, 400], [200, 400]);

        expect(strip().style.transform).toBe('translate3d(calc(-200% + -30px), 0, 0)');
    });

    it('draws only the showing image and its neighbours', () => {
        const many = Array.from({ length: 6 }, (_, i) => `https://example.com/${i}.jpg`);
        render(<ImageViewer images={many} index={3} onIndexChange={jest.fn()} onClose={jest.fn()} />);

        const drawn = Array.from(screen.getByRole('dialog').querySelectorAll('img')).map(img =>
            img.getAttribute('src')
        );
        expect(drawn).toEqual([many[2], many[3], many[4]]);
    });

    it('lets go of a drag the browser cancels', () => {
        const onIndexChange = jest.fn();
        render(<ImageViewer images={images} index={1} onIndexChange={onIndexChange} onClose={jest.fn()} />);

        press(shown(), [300, 400], [100, 400]);
        fireEvent(shown(), pointer('pointercancel', [100, 400]));

        expect(strip().style.transform).toBe('translate3d(calc(-100% + 0px), 0, 0)');
        expect(onIndexChange).not.toHaveBeenCalled();
    });

    it('steps with the arrow keys', () => {
        const onIndexChange = jest.fn();
        render(<ImageViewer images={images} index={1} onIndexChange={onIndexChange} onClose={jest.fn()} />);

        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' });

        expect(onIndexChange.mock.calls).toEqual([[2], [0]]);
    });

    it('draws no count, arrows or swipe for a single image', () => {
        const onIndexChange = jest.fn();
        render(<ImageViewer images={[images[0]]} index={0} onIndexChange={onIndexChange} onClose={jest.fn()} />);

        expect(screen.queryByText('1 / 1')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Next photo' })).not.toBeInTheDocument();
        drag(shown(), [300, 400], [100, 400]);
        expect(onIndexChange).not.toHaveBeenCalled();
    });

    it('closes from the button, and on a tap beside the image but not on the image', () => {
        const onClose = jest.fn();
        render(<ImageViewer images={images} index={0} onIndexChange={jest.fn()} onClose={onClose} closeLabel="닫기" />);

        fireEvent.click(shown());
        expect(onClose).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('dialog'));
        fireEvent.click(screen.getByRole('button', { name: '닫기' }));
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    describe('actions', () => {
        it("draws the host's buttons for the showing image, and follows it to the next", () => {
            const renderFooter = jest.fn((index: number) => <button type="button">save {index}</button>);
            const { rerender } = render(
                <ImageViewer
                    images={images}
                    index={1}
                    onIndexChange={jest.fn()}
                    onClose={jest.fn()}
                    renderFooter={renderFooter}
                />
            );
            expect(screen.getByRole('button', { name: 'save 1' })).toBeTruthy();
            expect(renderFooter).toHaveBeenLastCalledWith(1);

            rerender(
                <ImageViewer
                    images={images}
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
                <ImageViewer
                    images={images}
                    index={0}
                    onIndexChange={jest.fn()}
                    onClose={jest.fn()}
                    closeLabel="닫기"
                />
            );
            const buttons = screen.getAllByRole('button').map(button => button.getAttribute('aria-label'));
            expect(buttons).toEqual(['Next photo', '닫기']);
        });

        it('does not close when an action is pressed', () => {
            const onClose = jest.fn();
            const onSave = jest.fn();
            render(
                <ImageViewer
                    images={images}
                    index={0}
                    onIndexChange={jest.fn()}
                    onClose={onClose}
                    renderFooter={() => (
                        <ImageViewerActionButton label="저장" onClick={onSave}>
                            S
                        </ImageViewerActionButton>
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
                <ImageViewer images={images} index={0} onIndexChange={jest.fn()} onClose={onClose} />
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
            <ImageViewer
                images={images}
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

    describe('ImageViewerActionButton', () => {
        it('shows its icon, or a spinner while busy, or a ring once progress is known', () => {
            const { rerender } = render(
                <ImageViewerActionButton label="저장" onClick={jest.fn()}>
                    <span data-testid="icon" />
                </ImageViewerActionButton>
            );
            expect(screen.getByTestId('icon')).toBeTruthy();

            rerender(
                <ImageViewerActionButton label="저장" onClick={jest.fn()} busy>
                    <span data-testid="icon" />
                </ImageViewerActionButton>
            );
            const busy = screen.getByRole('button', { name: '저장' });
            expect(busy.getAttribute('aria-busy')).toBe('true');
            // Still focusable, so focus stays on the button just pressed.
            expect((busy as HTMLButtonElement).disabled).toBe(false);
            expect(busy.getAttribute('aria-disabled')).toBe('true');
            expect(screen.queryByTestId('icon')).toBeNull();
            expect(busy.querySelector('[data-progress]')).toBeNull();

            rerender(
                <ImageViewerActionButton label="저장" onClick={jest.fn()} busy progress={0.42}>
                    <span data-testid="icon" />
                </ImageViewerActionButton>
            );
            expect(busy.querySelector('[data-progress]')?.getAttribute('data-progress')).toBe('42');
            expect(screen.getByRole('progressbar', { name: '저장' }).getAttribute('aria-valuenow')).toBe('42');
        });

        it('ignores presses while busy', () => {
            const onClick = jest.fn();
            render(
                <ImageViewerActionButton label="저장" onClick={onClick} busy>
                    S
                </ImageViewerActionButton>
            );
            fireEvent.click(screen.getByRole('button', { name: '저장' }));
            expect(onClick).not.toHaveBeenCalled();
        });

        it('does nothing while disabled', () => {
            const onClick = jest.fn();
            render(
                <ImageViewerActionButton label="공유" onClick={onClick} disabled>
                    S
                </ImageViewerActionButton>
            );
            fireEvent.click(screen.getByRole('button', { name: '공유' }));
            expect(onClick).not.toHaveBeenCalled();
        });
    });

    describe('placeholders', () => {
        const thumbs = ['https://example.com/a-t.jpg', 'https://example.com/b-t.jpg', 'https://example.com/c-t.jpg'];
        // The showing page is the one without aria-hidden.
        const placeholder = () =>
            screen.getByRole('dialog').querySelector('[data-page]:not([aria-hidden]) img[data-placeholder]');

        // An original can take seconds; the small copy stands in until it has arrived.
        it('draws the placeholder under the original until the original loads', () => {
            render(
                <ImageViewer
                    images={images}
                    placeholders={thumbs}
                    index={1}
                    onIndexChange={jest.fn()}
                    onClose={jest.fn()}
                />
            );
            expect(placeholder()).toHaveAttribute('src', thumbs[1]);

            fireEvent.load(shown());

            expect(placeholder()).toBeNull();
            expect(shown()).toHaveAttribute('src', images[1]);
        });

        it('shows only the placeholder while the original has no address yet', () => {
            render(
                <ImageViewer
                    images={[undefined]}
                    placeholders={[thumbs[0]]}
                    index={0}
                    onIndexChange={jest.fn()}
                    onClose={jest.fn()}
                />
            );

            expect(screen.getByRole('dialog').querySelector('img[data-current]')).toBeNull();
            expect(placeholder()).toHaveAttribute('src', thumbs[0]);
        });

        // A refreshed address is a new download; the placeholder covers it again until it lands.
        it('brings the placeholder back for a new address', () => {
            const { rerender } = render(
                <ImageViewer
                    images={images}
                    placeholders={thumbs}
                    index={0}
                    onIndexChange={jest.fn()}
                    onClose={jest.fn()}
                />
            );
            fireEvent.load(shown());
            expect(placeholder()).toBeNull();

            rerender(
                <ImageViewer
                    images={['https://example.com/a-fresh.jpg', ...images.slice(1)]}
                    placeholders={thumbs}
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
        render(
            <ImageViewer images={images} index={2} onIndexChange={jest.fn()} onClose={jest.fn()} onError={onError} />
        );

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
        const pinch = (from: [[number, number], [number, number]], to: [[number, number], [number, number]]) => {
            fireEvent(content(), pointer('pointerdown', from[0], 1));
            fireEvent(content(), pointer('pointerdown', from[1], 2));
            fireEvent(content(), pointer('pointermove', to[0], 1));
            fireEvent(content(), pointer('pointermove', to[1], 2));
            fireEvent(content(), pointer('pointerup', to[0], 1));
            fireEvent(content(), pointer('pointerup', to[1], 2));
        };
        const tap = (target: Element, at: [number, number]) => {
            fireEvent(target, pointer('pointerdown', at));
            fireEvent(target, pointer('pointerup', at));
        };
        const zoomIn = () =>
            pinch(
                [
                    [-50, 0],
                    [50, 0],
                ],
                [
                    [-100, 0],
                    [100, 0],
                ]
            );

        it('scales the showing photo with a pinch', () => {
            render(<ImageViewer images={images} index={1} onIndexChange={jest.fn()} onClose={jest.fn()} />);

            zoomIn();

            expect(layer().style.transform).toContain('scale(2)');
        });

        it('lets a pinch that ends barely zoomed fit the page again', () => {
            render(<ImageViewer images={images} index={1} onIndexChange={jest.fn()} onClose={jest.fn()} />);

            pinch(
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
            render(<ImageViewer images={images} index={1} onIndexChange={onIndexChange} onClose={jest.fn()} />);
            zoomIn();

            drag(content(), [0, 0], [-300, 0]);

            expect(onIndexChange).not.toHaveBeenCalled();
            // 2x of a 400-wide photo on a 400-wide page leaves 200 of travel each way.
            expect(layer().style.transform).toContain('translate3d(-200px, 0px, 0)');
        });

        it('zooms in on a double tap on the photo, and back out on the next', () => {
            render(<ImageViewer images={images} index={1} onIndexChange={jest.fn()} onClose={jest.fn()} />);

            tap(shown(), [0, 0]);
            tap(shown(), [0, 0]);
            expect(layer().style.transform).toContain('scale(2.5)');

            tap(shown(), [0, 0]);
            tap(shown(), [0, 0]);
            expect(layer().style.transform).toContain('scale(1)');
        });

        it('does not zoom on two taps far apart in time', () => {
            const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
            render(<ImageViewer images={images} index={1} onIndexChange={jest.fn()} onClose={jest.fn()} />);

            tap(shown(), [0, 0]);
            now.mockReturnValue(1500);
            tap(shown(), [0, 0]);

            expect(layer().style.transform).toContain('scale(1)');
        });

        it('does not close on a tap beside a zoomed photo', () => {
            const onClose = jest.fn();
            render(<ImageViewer images={images} index={1} onIndexChange={jest.fn()} onClose={onClose} />);
            zoomIn();

            fireEvent.click(layer());

            expect(onClose).not.toHaveBeenCalled();
        });

        it('starts the next page fitted', () => {
            const { rerender } = render(
                <ImageViewer images={images} index={1} onIndexChange={jest.fn()} onClose={jest.fn()} />
            );
            zoomIn();

            rerender(<ImageViewer images={images} index={2} onIndexChange={jest.fn()} onClose={jest.fn()} />);

            expect(layer().style.transform).toContain('scale(1)');
        });
    });
});
