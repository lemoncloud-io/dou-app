import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

const MIN_WIDTH = 280;
const MAX_WIDTH = 720;
const KEYBOARD_STEP = 16;

/** The panel edge the drag handle sits on — the one facing the chat pane. */
export type PanelEdge = 'left' | 'right';

interface PanelWidthOptions {
    /** localStorage key the width persists under — one per panel kind. */
    storageKey: string;
    defaultWidth: number;
    /** `left` for trailing panels (default), `right` for the leading sidebar. */
    edge?: PanelEdge;
    minWidth?: number;
    maxWidth?: number;
}

/**
 * Drag-resizable panel width, persisted across sessions. The handle sits on the
 * edge facing the chat pane — the LEFT edge of a trailing panel, the RIGHT edge
 * of the sidebar — so dragging (or the arrow key) toward the chat grows the
 * panel. Width is clamped to [minWidth, maxWidth] (default [280, 720] px). Each
 * panel passes its own storage key; `PanelResizeHandle` renders the handle.
 *
 * While a drag is live the width is written straight to `panelRef`'s style — a
 * React state write per pointermove would re-render the whole panel subtree
 * (message list included) every frame. State is committed once on release.
 */
export const usePanelWidth = ({
    storageKey,
    defaultWidth,
    edge = 'left',
    minWidth = MIN_WIDTH,
    maxWidth = MAX_WIDTH,
}: PanelWidthOptions) => {
    const clampWidth = useCallback(
        (next: number): number => Math.min(maxWidth, Math.max(minWidth, next)),
        [minWidth, maxWidth]
    );
    // Moving the pointer toward the chat pane grows the panel: leftward for a
    // left-edge handle, rightward for a right-edge one.
    const grow = edge === 'left' ? 1 : -1;
    const [width, setWidth] = useState(() => {
        const stored = Number(localStorage.getItem(storageKey));
        return Number.isFinite(stored) && stored > 0 ? clampWidth(stored) : defaultWidth;
    });
    const widthRef = useRef(width);
    const panelRef = useRef<HTMLElement | null>(null);
    const endDragRef = useRef<(() => void) | null>(null);

    const persist = useCallback(() => {
        localStorage.setItem(storageKey, String(widthRef.current));
    }, [storageKey]);

    const startResize = useCallback(
        (event: ReactPointerEvent<HTMLElement>) => {
            event.preventDefault();
            const startX = event.clientX;
            const startWidth = widthRef.current;
            const onMove = (move: PointerEvent) => {
                const next = clampWidth(startWidth + grow * (startX - move.clientX));
                widthRef.current = next;
                if (panelRef.current) panelRef.current.style.width = `${next}px`;
            };
            const onUp = () => {
                endDragRef.current = null;
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
                document.body.style.removeProperty('user-select');
                document.body.style.removeProperty('cursor');
                setWidth(widthRef.current);
                persist();
            };
            // Suppress text selection / cursor flicker for the whole drag, not
            // just while over the 6px handle.
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'col-resize';
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
            endDragRef.current = onUp;
        },
        [clampWidth, grow, persist]
    );

    // Unmounting mid-drag must tear the window listeners (and body style) down.
    useEffect(() => () => endDragRef.current?.(), []);

    const resizeByKey = useCallback(
        (event: ReactKeyboardEvent<HTMLElement>) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const step = (event.key === 'ArrowLeft' ? KEYBOARD_STEP : -KEYBOARD_STEP) * grow;
            const next = clampWidth(widthRef.current + step);
            widthRef.current = next;
            setWidth(next);
            persist();
        },
        [clampWidth, grow, persist]
    );

    return { width, minWidth, maxWidth, edge, panelRef, startResize, resizeByKey };
};

export type PanelWidth = ReturnType<typeof usePanelWidth>;
