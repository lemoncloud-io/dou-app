import { useRef, useState } from 'react';

import { Maximize2, X } from 'lucide-react';

import { debugOverlayActions } from './overlayStore';
import { PerfTab } from './tabs/PerfTab';
import { StateTab } from './tabs/StateTab';
import { UnreadTab } from './tabs/UnreadTab';

const TABS = ['상태', '성능', '안읽음'] as const;
type MiniTab = (typeof TABS)[number];

/**
 * Floating read-only observation panel. The panel is the only element capturing
 * pointer events (no full-screen backdrop), so the app underneath stays
 * interactive — this is the "watch while using the app" mode.
 */
export const MiniPanel = () => {
    const [tab, setTab] = useState<MiniTab>('상태');

    // Floating draggable panel: start near the top-right so it doesn't cover the header.
    const panelRef = useRef<HTMLDivElement>(null);
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
            className="fixed z-50 w-[min(92vw,32rem)] max-h-[80dvh] flex flex-col overflow-hidden rounded-2xl bg-card border border-border shadow-xl"
        >
            <div
                onPointerDown={onHandlePointerDown}
                onPointerMove={onHandlePointerMove}
                onPointerUp={onHandlePointerUp}
                className="flex items-center justify-between px-4 py-3 border-b border-border cursor-move select-none touch-none"
            >
                <span className="font-semibold text-sm">Debug</span>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => debugOverlayActions.expand()}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="expand"
                    >
                        <Maximize2 size={14} />
                    </button>
                    <button
                        onClick={() => debugOverlayActions.close()}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="close"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            <div className="overflow-y-auto p-4 space-y-3">
                <div className="flex gap-1 mb-3">
                    {TABS.map(t => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={`px-3 py-1 text-xs rounded ${
                                tab === t ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {t}
                        </button>
                    ))}
                </div>

                {tab === '상태' && <StateTab />}
                {tab === '성능' && <PerfTab />}
                {tab === '안읽음' && <UnreadTab />}
            </div>
        </div>
    );
};
