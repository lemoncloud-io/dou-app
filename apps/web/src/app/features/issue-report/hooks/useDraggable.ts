import { useCallback, useEffect, useRef, useState } from 'react';

export interface Position {
    x: number;
    y: number;
}

/** Pointer travel (px) below which a press is treated as a click, not a drag. */
export const DRAG_THRESHOLD_PX = 6;

const readStored = (key: string): Position | null => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<Position>;
        if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
            return { x: parsed.x, y: parsed.y };
        }
    } catch {
        // Corrupt value — fall back to the default position.
    }
    return null;
};

/**
 * Current viewport size, tolerant of environments that transiently report
 * `window.innerWidth` as 0 before layout (some WebViews / headless browsers):
 * falls back to the document client size.
 */
export const getViewportSize = (): { width: number; height: number } => {
    if (typeof window === 'undefined') return { width: 0, height: 0 };
    const doc = document.documentElement;
    return {
        width: window.innerWidth || doc?.clientWidth || 0,
        height: window.innerHeight || doc?.clientHeight || 0,
    };
};

/** Keep a position inside the viewport given the element's measured size. */
const clampToViewport = (pos: Position, width: number, height: number): Position => {
    const { width: vw, height: vh } = getViewportSize();
    // Viewport not measurable yet (0×0) — leave the position untouched instead of
    // collapsing it to the top-left corner.
    if (!vw || !vh) return pos;
    const maxX = Math.max(0, vw - width);
    const maxY = Math.max(0, vh - height);
    return {
        x: Math.min(Math.max(0, pos.x), maxX),
        y: Math.min(Math.max(0, pos.y), maxY),
    };
};

export interface UseDraggableResult {
    /** Attach to the draggable element (used to measure size for clamping). */
    ref: React.RefObject<HTMLDivElement | null>;
    /** Current top-left position; apply as `style={{ left, top }}`. */
    position: Position;
    /** Spread onto the drag handle element. */
    dragHandlers: {
        onPointerDown: (e: React.PointerEvent) => void;
        onPointerMove: (e: React.PointerEvent) => void;
        onPointerUp: (e: React.PointerEvent) => void;
        onPointerCancel: (e: React.PointerEvent) => void;
    };
    /**
     * Whether the most recent press moved past the drag threshold (→ suppress the
     * click). Reading it consumes the flag so a later keyboard-activated click
     * (no preceding pointer sequence) is not wrongly suppressed.
     */
    didDrag: () => boolean;
}

/**
 * Draggable floating element with viewport clamping, localStorage persistence,
 * resize re-clamping, and click-vs-drag detection. Generalizes the pointer-drag
 * pattern from the debug MiniPanel (`features/debug/overlay/MiniPanel.tsx`).
 */
export const useDraggable = (storageKey: string, getDefault: () => Position): UseDraggableResult => {
    const ref = useRef<HTMLDivElement | null>(null);
    const [position, setPosition] = useState<Position>(() => readStored(storageKey) ?? getDefault());

    // Mirror state into a ref so pointer handlers persist the latest value
    // without a side effect inside the state updater (StrictMode-safe).
    const positionRef = useRef(position);
    useEffect(() => {
        positionRef.current = position;
    }, [position]);

    const drag = useRef<{ dx: number; dy: number; startX: number; startY: number; moved: boolean } | null>(null);
    const draggedRef = useRef(false);

    // Clamp on mount and on resize so a stored/off-screen position is pulled back in.
    useEffect(() => {
        const reclamp = () => {
            const el = ref.current;
            setPosition(prev => clampToViewport(prev, el?.offsetWidth ?? 0, el?.offsetHeight ?? 0));
        };
        reclamp();
        window.addEventListener('resize', reclamp);
        return () => window.removeEventListener('resize', reclamp);
    }, []);

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        drag.current = {
            dx: e.clientX - rect.left,
            dy: e.clientY - rect.top,
            startX: e.clientX,
            startY: e.clientY,
            moved: false,
        };
        draggedRef.current = false;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    }, []);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        const d = drag.current;
        if (!d) return;
        // Ignore sub-threshold jitter so a tap still registers as a click.
        if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD_PX) return;
        d.moved = true;
        draggedRef.current = true;
        const el = ref.current;
        setPosition(
            clampToViewport({ x: e.clientX - d.dx, y: e.clientY - d.dy }, el?.offsetWidth ?? 0, el?.offsetHeight ?? 0)
        );
    }, []);

    // Shared end-of-interaction handler for pointerup and pointercancel (system
    // gesture / focus loss): without cancel handling `drag.current` would stay
    // non-null and the next press would misbehave.
    const endDrag = useCallback(
        (e: React.PointerEvent) => {
            const d = drag.current;
            drag.current = null;
            (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
            if (d?.moved) {
                try {
                    localStorage.setItem(storageKey, JSON.stringify(positionRef.current));
                } catch {
                    // Persistence is best-effort; a full/blocked store is non-fatal.
                }
            }
        },
        [storageKey]
    );

    const didDrag = useCallback(() => {
        const dragged = draggedRef.current;
        draggedRef.current = false; // consume — see UseDraggableResult.didDrag
        return dragged;
    }, []);

    return {
        ref,
        position,
        dragHandlers: { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag },
        didDrag,
    };
};
