import { fireEvent, render, screen } from '@testing-library/react';

import { ImageViewer } from './ImageViewer';

const images = ['https://example.com/a.jpg', 'https://example.com/b.jpg', 'https://example.com/c.jpg'];
const shown = () => screen.getByRole('dialog').querySelector('img[data-current]') as HTMLImageElement;
const strip = () => screen.getByRole('dialog').querySelector('.flex') as HTMLElement;

// jsdom's PointerEvent drops clientX/Y from the init, so the coordinates are hung on the event.
const pointer = (type: string, [x, y]: [number, number]) => {
    const event = new Event(type, { bubbles: true });
    Object.assign(event, { clientX: x, clientY: y, pointerId: 1 });
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

    describe('placeholders', () => {
        const thumbs = ['https://example.com/a-t.jpg', 'https://example.com/b-t.jpg', 'https://example.com/c-t.jpg'];
        // The showing page is the one without aria-hidden.
        const placeholder = () =>
            screen.getByRole('dialog').querySelector('div:not([aria-hidden]) > img[data-placeholder]');

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
});
