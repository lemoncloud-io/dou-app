import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

const MIN_WIDTH = 280;
const MAX_WIDTH = 720;
const KEYBOARD_STEP = 16;

const clampWidth = (width: number): number => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));

const readStoredWidth = (storageKey: string, defaultWidth: number): number => {
    const stored = Number(localStorage.getItem(storageKey));
    return Number.isFinite(stored) && stored > 0 ? clampWidth(stored) : defaultWidth;
};

interface PanelWidthOptions {
    /** localStorage key the width persists under — one per panel kind. */
    storageKey: string;
    defaultWidth: number;
}

/**
 * Drag-resizable trailing-panel width, persisted across sessions. The handle
 * sits on the panel's LEFT edge, so dragging (or ArrowLeft) toward the chat
 * grows the panel. Width is clamped to [280, 720] px. Shared by the thread and
 * profile panes — each passes its own storage key.
 *
 * While a drag is live the width is written straight to `panelRef`'s style — a
 * React state write per pointermove would re-render the whole panel subtree
 * (message list included) every frame. State is committed once on release.
 */
export const usePanelWidth = ({ storageKey, defaultWidth }: PanelWidthOptions) => {
    const [width, setWidth] = useState(() => readStoredWidth(storageKey, defaultWidth));
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
                const next = clampWidth(startWidth + (startX - move.clientX));
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
        [persist]
    );

    // Unmounting mid-drag must tear the window listeners (and body style) down.
    useEffect(() => () => endDragRef.current?.(), []);

    const resizeByKey = useCallback(
        (event: ReactKeyboardEvent<HTMLElement>) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const next = clampWidth(widthRef.current + (event.key === 'ArrowLeft' ? KEYBOARD_STEP : -KEYBOARD_STEP));
            widthRef.current = next;
            setWidth(next);
            persist();
        },
        [persist]
    );

    return { width, minWidth: MIN_WIDTH, maxWidth: MAX_WIDTH, panelRef, startResize, resizeByKey };
};
