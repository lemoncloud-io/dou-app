import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

// Initialises i18next, so the position line reads as the viewer says it.
import '../../../../../i18n';

import { ImageViewer } from './ImageViewer';
import { CLICK_ZOOM_SCALE, MAX_ZOOM_SCALE, ZOOM_STEP } from './imageZoom';

const images = ['a.png', 'b.png', 'c.png'].map((name, index) => ({ id: `i${index}`, name, url: `blob:${name}` }));

const wrapper = ({ children }: { children: ReactNode }) => <TooltipProvider>{children}</TooltipProvider>;

const viewerProps = (openIndex: number | null, onClose = vi.fn()) => ({
    images,
    openIndex,
    onClose,
    author: { name: 'Ada', colorSeed: 'ada', time: '10:00' },
    onDownload: vi.fn(),
    onDownloadAll: vi.fn(),
    onCopy: vi.fn(),
});

const renderViewer = (openIndex = 0, onClose = vi.fn()) =>
    render(<ImageViewer {...viewerProps(openIndex, onClose)} />, { wrapper });

const position = () =>
    screen
        .getAllByRole('status')
        .map(node => node.textContent)
        .join(' ');

describe('ImageViewer keys', () => {
    afterEach(cleanup);

    it('says the new position as the arrows step through the set', () => {
        renderViewer();
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });
        expect(position()).toContain('Image 2 of 3');
    });

    it('describes the picture by position and sender, not by its file name', () => {
        renderViewer(1);
        expect(screen.getByRole('img', { name: 'Image 2 of 3 from Ada' })).toBeTruthy();
    });

    // The dialog description already reads the position on open; saying it again doubled it.
    it('stays quiet about the position until it changes', () => {
        renderViewer();
        expect(position()).toBe('');
    });
});

describe('ImageViewer zoom', () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    beforeEach(() => {
        // The zoom layer is 400x400 and the photo inside it a 400x200 landscape.
        vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
        vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(400);
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
            return this instanceof HTMLImageElement ? 200 : 400;
        });
        // jsdom has no pointer capture; the product handler calls it for a real pointer.
        HTMLElement.prototype.setPointerCapture ??= () => undefined;
        // jsdom has no PointerEvent; the product listens for pointerdown/move with clientX/Y.
        globalThis.PointerEvent ??= class extends MouseEvent {
            pointerId: number;
            constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
                super(type, init);
                this.pointerId = init.pointerId ?? 0;
            }
        } as typeof PointerEvent;
        vi.spyOn(HTMLElement.prototype, 'setPointerCapture').mockImplementation(() => undefined);
    });

    const layer = () => document.querySelector('[data-zoom-layer]') as HTMLElement;
    const stage = () => document.querySelector('[data-zoom-stage]') as HTMLElement;
    const photo = () => screen.getByRole('img', { name: /from Ada/ });
    const scaleOf = () => Number(layer().style.transform.match(/scale\(([^)]+)\)/)?.[1]);
    const translateY = () => parseFloat(layer().style.transform.split(',')[1] ?? '');
    const wheelZoomIn = (clientX = 200, clientY = 200) => {
        const event = new WheelEvent('wheel', {
            deltaY: -400,
            bubbles: true,
            cancelable: true,
            clientX,
            clientY,
        });
        act(() => {
            stage().dispatchEvent(event);
        });
        return event;
    };
    const pointer = (type: string, clientX: number, clientY: number, target: HTMLElement = layer()) => {
        act(() => {
            target.dispatchEvent(
                new PointerEvent(type, { clientX, clientY, bubbles: true, cancelable: true, pointerId: 1 })
            );
        });
    };

    it('scales the picture around the pointer and stops the browser taking the wheel', () => {
        renderViewer();
        const event = wheelZoomIn();
        expect(event.defaultPrevented).toBe(true);
        expect(scaleOf()).toBeGreaterThan(1);
    });

    it('pans a zoomed photo without closing or stepping the set', () => {
        const onClose = vi.fn();
        renderViewer(0, onClose);
        wheelZoomIn(0, 0);
        const before = layer().style.transform;

        pointer('pointerdown', 0, 0);
        pointer('pointermove', -150, 0);
        pointer('pointerup', -150, 0);

        expect(layer().style.transform).not.toBe(before);
        expect(layer().style.transform.includes('NaN')).toBe(false);
        expect(onClose).not.toHaveBeenCalled();
        expect(photo()).toHaveProperty('alt', 'Image 1 of 3 from Ada');
    });

    const clickPhoto = (clientX = 200, clientY = 200) => {
        pointer('pointerdown', clientX, clientY, photo());
        pointer('pointerup', clientX, clientY, photo());
    };

    it('keeps a zoomed photo from being dragged past its edge', () => {
        renderViewer();
        // A click on the layer's centre (200, 200) leaves translate at 0, so a pan that never
        // moves would fail.
        clickPhoto();
        expect(scaleOf()).toBe(CLICK_ZOOM_SCALE);
        // The 400x200 photo at 2.5x is 1000x500 in a 400x400 layer, so it can move 50 up or down.
        pointer('pointerdown', 0, 0);
        pointer('pointermove', 0, -1000);
        expect(Math.abs(translateY())).toBe(50);
    });

    it('zooms in on a click on the photo, and back out to fit on the next', () => {
        renderViewer();
        clickPhoto();
        expect(scaleOf()).toBe(CLICK_ZOOM_SCALE);
        clickPhoto();
        expect(scaleOf()).toBe(1);
    });

    it('does not zoom in on a click on the empty stage around the photo', () => {
        renderViewer();
        pointer('pointerdown', 200, 200);
        pointer('pointerup', 200, 200);
        expect(scaleOf()).toBe(1);
    });

    it('treats a drag on a zoomed photo as a pan, not a click back to fit', () => {
        renderViewer();
        clickPhoto();
        pointer('pointerdown', 200, 200, photo());
        pointer('pointermove', 260, 200, photo());
        pointer('pointerup', 260, 200, photo());
        expect(scaleOf()).toBe(CLICK_ZOOM_SCALE);
    });

    it('steps the zoom with the buttons, and the percentage goes back to fit', () => {
        renderViewer();
        const zoomOut = screen.getByRole('button', { name: 'Zoom out' });
        expect(zoomOut).toHaveProperty('disabled', true);

        fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
        expect(scaleOf()).toBe(ZOOM_STEP);
        expect(screen.getByRole('button', { name: 'Fit to window' }).textContent).toBe('150%');

        fireEvent.click(screen.getByRole('button', { name: 'Fit to window' }));
        expect(scaleOf()).toBe(1);
    });

    it('zooms with + and -, fits with 0, and stops at the maximum', () => {
        renderViewer();
        const dialog = screen.getByRole('dialog');
        for (let i = 0; i < 6; i++) fireEvent.keyDown(dialog, { key: '+' });
        expect(scaleOf()).toBe(MAX_ZOOM_SCALE);
        expect(screen.getByRole('button', { name: 'Zoom in' })).toHaveProperty('disabled', true);

        fireEvent.keyDown(dialog, { key: '-' });
        expect(scaleOf()).toBeCloseTo(MAX_ZOOM_SCALE / ZOOM_STEP);
        fireEvent.keyDown(dialog, { key: '0' });
        expect(scaleOf()).toBe(1);
    });

    it('starts the next picture fitted after a zoom', () => {
        renderViewer();
        wheelZoomIn();
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });
        expect(scaleOf()).toBe(1);
        expect(position()).toContain('Image 2 of 3');
    });

    it('starts at fit when closed and opened again', () => {
        const view = renderViewer();
        wheelZoomIn();
        expect(scaleOf()).toBeGreaterThan(1);
        view.rerender(<ImageViewer {...viewerProps(null)} />);
        view.rerender(<ImageViewer {...viewerProps(0)} />);
        expect(scaleOf()).toBe(1);
    });

    it('starts the clicked thumbnail fitted after a zoom', () => {
        renderViewer();
        wheelZoomIn();
        fireEvent.click(screen.getByRole('button', { name: 'Open b.png' }));
        expect(scaleOf()).toBe(1);
        expect(position()).toContain('Image 2 of 3');
    });
});
