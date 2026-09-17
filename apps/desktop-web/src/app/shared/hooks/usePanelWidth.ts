import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

const MIN_WIDTH = 280;
const MAX_WIDTH = 720;
const KEYBOARD_STEP = 16;

/**
 * The message column never gets narrower than this. The rails, the sidebar and a
 * trailing panel were each clamped against a constant, and nothing clamped the
 * sum: 136 + 480 + 720 = 1336px of chrome, so at a 1280px window the
 * conversation could be squeezed to nothing with no floor at any width.
 */
export const MIN_CHAT_WIDTH = 420;
/** Rails: 56px cloud + 80px place. Fixed, so they are part of the budget. */
const RAIL_WIDTH = 136;

/**
 * Live width of every mounted panel, keyed by storage key. Clamping each panel
 * against the whole room on its own let the sidebar take 480 and a trailing panel
 * 720 at the same time — the overflow the budget exists to prevent — so a panel's
 * room is what is left after the rails, the chat floor, AND the other panels.
 * At the narrowest docked widths a panel's own minimum can still overrun it; the
 * chat column's min-width is the backstop there.
 */
const liveWidths = new Map<string, number>();
const otherPanelsWidth = (self: string): number => {
    let sum = 0;
    liveWidths.forEach((w, key) => {
        if (key !== self) sum += w;
    });
    return sum;
};

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
    // The live viewport, not just the constant: a panel may never claim so much
    // that the chat column drops under MIN_CHAT_WIDTH.
    const clampWidth = useCallback(
        (next: number): number => {
            const room = window.innerWidth - RAIL_WIDTH - MIN_CHAT_WIDTH - otherPanelsWidth(storageKey);
            const ceiling = Math.max(minWidth, Math.min(maxWidth, room));
            return Math.min(ceiling, Math.max(minWidth, next));
        },
        [minWidth, maxWidth, storageKey]
    );
    // Moving the pointer toward the chat pane grows the panel: leftward for a
    // left-edge handle, rightward for a right-edge one.
    const grow = edge === 'left' ? 1 : -1;
    // The width the user chose, as opposed to the width the window allows now.
    const [preferred] = useState(() => {
        const stored = Number(localStorage.getItem(storageKey));
        return Number.isFinite(stored) && stored > 0 ? stored : defaultWidth;
    });
    const preferredRef = useRef(preferred);
    const [width, setWidth] = useState(() => clampWidth(preferred));
    const widthRef = useRef(width);
    const panelRef = useRef<HTMLElement | null>(null);
    const endDragRef = useRef<(() => void) | null>(null);

    const persist = useCallback(() => {
        preferredRef.current = widthRef.current;
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

    // Register this panel's committed width in the shared budget while mounted.
    useEffect(() => {
        liveWidths.set(storageKey, width);
        return () => {
            liveWidths.delete(storageKey);
        };
    }, [storageKey, width]);

    // The ceiling depends on the window, so a resize re-clamps now rather than on
    // the next drag. It clamps the preference, not the current width: clamping the
    // current width only ever narrowed the panel, so one small window left it at
    // its minimum until the app was reloaded.
    useEffect(() => {
        const onResize = () => {
            const next = clampWidth(preferredRef.current);
            if (next === widthRef.current) return;
            widthRef.current = next;
            setWidth(next);
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [clampWidth]);

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
