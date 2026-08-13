import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Draggable, viewport-clamped panel chrome. The panel is the only element capturing pointer events
 * (no full-screen backdrop), so the app underneath stays interactive — this is what makes the
 * "watch/poke while using the app" modes possible.
 *
 * Shared by the mini observation panel and the floating tool screen so the drag maths lives once.
 */
export const FloatingPanel = ({
    title,
    actions,
    children,
}: {
    title: ReactNode;
    actions: ReactNode;
    children: ReactNode;
}) => {
    const panelRef = useRef<HTMLDivElement>(null);
    // Start near the top-right so it doesn't cover the header.
    const [pos, setPos] = useState(() => ({
        x: Math.max(16, (typeof window !== 'undefined' ? window.innerWidth : 400) - 380 - 16),
        y: 72,
    }));
    const dragRef = useRef<{ dx: number; dy: number } | null>(null);

    const clampToViewport = (x: number, y: number) => {
        const el = panelRef.current;
        const w = el?.offsetWidth ?? 360;
        const h = el?.offsetHeight ?? 400;
        const maxX = Math.max(0, window.innerWidth - w);
        const maxY = Math.max(0, window.innerHeight - h);
        return { x: Math.min(Math.max(0, x), maxX), y: Math.min(Math.max(0, y), maxY) };
    };

    // The seed position above guesses the width; the panel is `min(92vw, 32rem)`, so on a wide
    // viewport it is 512px and the guess hangs it off the right edge. Re-clamp once the real box
    // exists — before paint, so it never renders clipped.
    useLayoutEffect(() => {
        setPos(current => clampToViewport(current.x, current.y));
         
    }, []);

    const onHandlePointerDown = (e: React.PointerEvent) => {
        const el = panelRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };
    const onHandlePointerMove = (e: React.PointerEvent) => {
        if (!dragRef.current) return;
        setPos(clampToViewport(e.clientX - dragRef.current.dx, e.clientY - dragRef.current.dy));
    };
    const onHandlePointerUp = (e: React.PointerEvent) => {
        dragRef.current = null;
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    };

    return (
        <div
            ref={panelRef}
            style={{ left: pos.x, top: pos.y }}
            className="fixed z-50 flex max-h-[80dvh] w-[min(92vw,32rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
        >
            <div
                onPointerDown={onHandlePointerDown}
                onPointerMove={onHandlePointerMove}
                onPointerUp={onHandlePointerUp}
                className="flex cursor-move touch-none select-none items-center justify-between border-b border-border px-4 py-3"
            >
                <span className="truncate text-sm font-semibold">{title}</span>
                <div className="flex shrink-0 items-center gap-3">{actions}</div>
            </div>

            {children}
        </div>
    );
};
