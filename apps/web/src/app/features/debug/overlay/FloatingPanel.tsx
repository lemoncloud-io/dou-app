import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { GripHorizontal } from 'lucide-react';

import type { DebugPanelSize } from './screenManifest';

const FLOATING_CHROME = 'fixed rounded-2xl border border-border bg-card shadow-2xl ring-1 ring-black/5';

const SIZE_CLASSNAMES: Record<DebugPanelSize, string> = {
    mini: `${FLOATING_CHROME} max-h-[42dvh] w-[min(80vw,17rem)]`,
    dock: `${FLOATING_CHROME} max-h-[80dvh] w-[min(92vw,32rem)]`,
    full: 'fixed inset-0 bg-background pt-safe-top pb-safe-bottom',
};

export const FloatingPanel = ({
    size,
    title,
    leading,
    actions,
    children,
}: {
    size: DebugPanelSize;
    title: ReactNode;
    leading?: ReactNode;
    actions: ReactNode;
    children: ReactNode;
}) => {
    const panelRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState(() => ({
        x: Math.max(16, (typeof window !== 'undefined' ? window.innerWidth : 400) - 380 - 16),
        y: 72,
    }));
    const dragRef = useRef<{ dx: number; dy: number } | null>(null);
    const isFloating = size !== 'full';

    const clampToViewport = (x: number, y: number) => {
        const el = panelRef.current;
        const w = el?.offsetWidth ?? 360;
        const h = el?.offsetHeight ?? 400;
        const maxX = Math.max(0, window.innerWidth - w);
        const maxY = Math.max(0, window.innerHeight - h);
        return { x: Math.min(Math.max(0, x), maxX), y: Math.min(Math.max(0, y), maxY) };
    };

    useLayoutEffect(() => {
        if (!isFloating) return;
        setPos(current => clampToViewport(current.x, current.y));
    }, [isFloating, size]);

    const onHandlePointerDown = (e: React.PointerEvent) => {
        const el = panelRef.current;
        if (!el || !isFloating) return;
        if ((e.target as HTMLElement).closest('button')) return;
        const rect = el.getBoundingClientRect();
        dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
        e.currentTarget.setPointerCapture?.(e.pointerId);
    };
    const onHandlePointerMove = (e: React.PointerEvent) => {
        if (!dragRef.current) return;
        setPos(clampToViewport(e.clientX - dragRef.current.dx, e.clientY - dragRef.current.dy));
    };
    const onHandlePointerUp = (e: React.PointerEvent) => {
        dragRef.current = null;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
    };

    return (
        <div
            ref={panelRef}
            style={isFloating ? { left: pos.x, top: pos.y } : undefined}
            className={`z-50 flex flex-col overflow-hidden ${SIZE_CLASSNAMES[size]}`}
        >
            <div
                onPointerDown={onHandlePointerDown}
                onPointerMove={onHandlePointerMove}
                onPointerUp={onHandlePointerUp}
                className={`flex shrink-0 touch-none select-none items-center gap-1 border-b border-border px-2 ${
                    size === 'mini' ? 'py-1.5' : 'py-3'
                } ${isFloating ? 'cursor-move' : ''}`}
            >
                {leading ??
                    (isFloating ? <GripHorizontal size={16} className="ml-1 text-muted-foreground/50" /> : null)}
                <span className={`flex-1 truncate px-1 font-semibold ${size === 'mini' ? 'text-xs' : 'text-sm'}`}>
                    {title}
                </span>
                <div className="flex shrink-0 items-center gap-1">{actions}</div>
            </div>

            {children}
        </div>
    );
};
