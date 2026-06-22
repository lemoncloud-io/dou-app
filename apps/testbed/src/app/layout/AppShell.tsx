import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { RuntimeOverlay } from '../overlays/RuntimeOverlay';

export const AppShell = () => {
    const [overlayOpen, setOverlayOpen] = useState(false);

    return (
        <div className="flex flex-col h-dvh bg-background text-foreground">
            {/* 상단 디버그 버튼 */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card shrink-0">
                <span className="text-xs font-mono text-muted-foreground">testbed</span>
                <button
                    onClick={() => setOverlayOpen(true)}
                    className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground hover:bg-accent transition-colors"
                >
                    debug
                </button>
            </div>

            {/* 페이지 콘텐츠 */}
            <div className="flex-1 overflow-y-auto pb-16">
                <Outlet />
            </div>

            <BottomNav />

            {overlayOpen && <RuntimeOverlay onClose={() => setOverlayOpen(false)} />}
        </div>
    );
};
