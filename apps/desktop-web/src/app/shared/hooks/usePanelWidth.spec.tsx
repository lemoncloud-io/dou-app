import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PanelResizeHandle } from '../components/PanelResizeHandle';
import { type PanelEdge, usePanelWidth } from './usePanelWidth';

const Panel = ({ edge }: { edge?: PanelEdge }) => {
    const resize = usePanelWidth({ storageKey: 'test.width', defaultWidth: 300, edge, minWidth: 200, maxWidth: 400 });
    return (
        <aside ref={resize.panelRef} style={{ width: resize.width }}>
            <PanelResizeHandle label="Resize" panel={resize} />
        </aside>
    );
};

// jsdom has no PointerEvent, and fireEvent.pointerDown drops clientX on a plain Event —
// a MouseEvent typed `pointerdown` carries the coordinates React's handler reads.
const pointer = (target: EventTarget, type: string, clientX = 0) =>
    act(() => {
        target.dispatchEvent(new MouseEvent(type, { clientX, bubbles: true }));
    });

const width = () => Number(screen.getByRole('separator').getAttribute('aria-valuenow'));

describe('usePanelWidth', () => {
    afterEach(() => localStorage.clear());

    it('grows a trailing (left-edge) panel when dragged left', () => {
        render(<Panel />);
        pointer(screen.getByRole('separator'), 'pointerdown', 500);
        pointer(window, 'pointermove', 450);
        pointer(window, 'pointerup');
        expect(width()).toBe(350);
        expect(localStorage.getItem('test.width')).toBe('350');
    });

    it('grows the sidebar (right-edge) when dragged right, clamped to maxWidth', () => {
        render(<Panel edge="right" />);
        pointer(screen.getByRole('separator'), 'pointerdown', 300);
        pointer(window, 'pointermove', 900);
        pointer(window, 'pointerup');
        expect(width()).toBe(400);
    });

    it('steps toward the chat pane with the arrow key for each edge', () => {
        const { unmount } = render(<Panel />);
        fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowLeft' });
        expect(width()).toBe(316);
        unmount();
        localStorage.clear();

        render(<Panel edge="right" />);
        fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' });
        expect(width()).toBe(316);
    });
});
