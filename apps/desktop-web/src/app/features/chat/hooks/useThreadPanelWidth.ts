import { useCallback, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

const STORAGE_KEY = 'chatic.threadPanel.width';
const MIN_WIDTH = 280;
const MAX_WIDTH = 720;
const DEFAULT_WIDTH = 384;
const KEYBOARD_STEP = 16;

const clampWidth = (width: number): number => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));

const readStoredWidth = (): number => {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0 ? clampWidth(stored) : DEFAULT_WIDTH;
};

/**
 * Drag-resizable thread panel width, persisted across sessions. The handle sits
 * on the panel's LEFT edge, so dragging (or ArrowLeft) toward the chat grows
 * the panel. Width is clamped to [280, 720] px.
 */
export const useThreadPanelWidth = () => {
    const [width, setWidth] = useState(readStoredWidth);
    const widthRef = useRef(width);

    const apply = useCallback((next: number) => {
        const clamped = clampWidth(next);
        widthRef.current = clamped;
        setWidth(clamped);
    }, []);

    const persist = useCallback(() => {
        localStorage.setItem(STORAGE_KEY, String(widthRef.current));
    }, []);

    const startResize = useCallback(
        (event: ReactPointerEvent<HTMLElement>) => {
            event.preventDefault();
            const startX = event.clientX;
            const startWidth = widthRef.current;
            const onMove = (move: PointerEvent) => apply(startWidth + (startX - move.clientX));
            const onUp = () => {
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
                document.body.style.removeProperty('user-select');
                document.body.style.removeProperty('cursor');
                persist();
            };
            // Suppress text selection / cursor flicker for the whole drag, not
            // just while over the 6px handle.
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'col-resize';
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
        },
        [apply, persist]
    );

    const resizeByKey = useCallback(
        (event: ReactKeyboardEvent<HTMLElement>) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            apply(widthRef.current + (event.key === 'ArrowLeft' ? KEYBOARD_STEP : -KEYBOARD_STEP));
            persist();
        },
        [apply, persist]
    );

    return { width, minWidth: MIN_WIDTH, maxWidth: MAX_WIDTH, startResize, resizeByKey };
};
