import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

// Initialises i18next, so the position line reads as the viewer says it.
import '../../../../../i18n';

import { ImageViewer } from './ImageViewer';
import { DOUBLE_TAP_ZOOM_SCALE } from './imageZoom';

const images = ['a.png', 'b.png', 'c.png'].map((name, index) => ({ id: `i${index}`, name, url: `blob:${name}` }));

const wrapper = ({ children }: { children: ReactNode }) => <TooltipProvider>{children}</TooltipProvider>;

const renderViewer = (openIndex = 0, onClose = vi.fn()) =>
    render(
        <ImageViewer
            images={images}
            openIndex={openIndex}
            onClose={onClose}
            author={{ name: 'Ada', colorSeed: 'ada', time: '10:00' }}
            onDownload={vi.fn()}
            onDownloadAll={vi.fn()}
            onCopy={vi.fn()}
        />,
        { wrapper }
    );

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
        vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
        vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(400);
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(300);
        // jsdom has no pointer capture; the product handler calls it for a real pointer.
        HTMLElement.prototype.setPointerCapture ??= () => undefined;
        vi.spyOn(HTMLElement.prototype, 'setPointerCapture').mockImplementation(() => undefined);
    });

    const layer = () => document.querySelector('[data-zoom-layer]') as HTMLElement;
    const stage = () => document.querySelector('[data-zoom-stage]') as HTMLElement;
    const photo = () => screen.getByRole('img');
    const scaleOf = () => Number(layer().style.transform.match(/scale\(([^)]+)\)/)?.[1]);
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

        fireEvent.pointerDown(layer(), { clientX: 0, clientY: 0, pointerId: 1 });
        fireEvent.pointerMove(layer(), { clientX: -150, clientY: 0, pointerId: 1 });
        fireEvent.pointerUp(layer(), { clientX: -150, clientY: 0, pointerId: 1 });

        expect(layer().style.transform).not.toBe(before);
        expect(onClose).not.toHaveBeenCalled();
        expect(photo()).toHaveProperty('alt', 'Image 1 of 3 from Ada');
    });

    it('zooms in on a double click on the photo, and back out on the next', () => {
        renderViewer();
        fireEvent.doubleClick(photo(), { clientX: 0, clientY: 0 });
        expect(scaleOf()).toBe(DOUBLE_TAP_ZOOM_SCALE);
        fireEvent.doubleClick(photo(), { clientX: 0, clientY: 0 });
        expect(scaleOf()).toBe(1);
    });

    it('starts the next picture fitted after a zoom', () => {
        renderViewer();
        wheelZoomIn();
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });
        expect(scaleOf()).toBe(1);
        expect(position()).toContain('Image 2 of 3');
    });
});
