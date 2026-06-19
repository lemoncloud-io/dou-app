import { useEffect, useState } from 'react';

import { cn } from '@chatic/lib/utils';

import { useDebugModeStore, usePanelWidth } from '../../../shared';
import { DebugAuthPage } from './DebugAuthPage';
import { DebugBadgeCountPage } from './DebugBadgeCountPage';
import { DebugChatPage } from './DebugChatPage';
import { DebugStatePage } from './DebugStatePage';
import { DebugSyncPage } from './DebugSyncPage';

type TabId = 'state' | 'sync' | 'chat' | 'badge' | 'auth';

const TABS: { id: TabId; label: string }[] = [
    { id: 'state', label: 'State' },
    { id: 'sync', label: 'Socket / Cache' },
    { id: 'chat', label: 'Cache stream' },
    { id: 'badge', label: 'OS badge' },
    // Dev-only account switcher — tree-shaken from production builds so it never
    // surfaces in the installed app even when debug mode is toggled on.
    ...(import.meta.env.DEV ? [{ id: 'auth' as const, label: 'Login' }] : []),
];

const PAGES: Record<TabId, () => JSX.Element> = {
    state: DebugStatePage,
    sync: DebugSyncPage,
    chat: DebugChatPage,
    badge: DebugBadgeCountPage,
    auth: DebugAuthPage,
};

/**
 * Debug panel docked into the right trailing-panel slot of the chat shell — same
 * mechanism as the profile / thread panes. On wide (xl) screens it sits in flow
 * (`xl:relative`), so the chat pane shrinks beside it instead of being covered;
 * below xl it overlays. Because it renders in the same window as the app it
 * shares every store + the IndexedDB cache, so it shows the *actual* live app
 * state and you can keep chatting while watching it update. Width drag-resizes
 * (left edge, persisted); closes on Esc, ✕, or Exit.
 */
export const DebugPanel = () => {
    const setOverlayOpen = useDebugModeStore(s => s.setOverlayOpen);
    const [active, setActive] = useState<TabId>('state');
    const { width, minWidth, maxWidth, panelRef, startResize, resizeByKey } = usePanelWidth({
        storageKey: 'chatic.debugPanel.width',
        defaultWidth: 440,
    });

    const close = () => setOverlayOpen(false);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const ActivePage = PAGES[active];

    return (
        <aside
            ref={panelRef}
            style={{ width }}
            className="absolute inset-y-0 right-0 z-30 flex max-w-[85vw] shrink-0 flex-col overflow-hidden border-l border-border bg-background text-foreground shadow-raised xl:relative xl:z-auto xl:max-w-none xl:shadow-none"
        >
            {/* Drag the panel's left edge to resize (arrow keys when focused). */}
            <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize debug panel"
                aria-valuenow={width}
                aria-valuemin={minWidth}
                aria-valuemax={maxWidth}
                tabIndex={0}
                onPointerDown={startResize}
                onKeyDown={resizeByKey}
                className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize transition-colors hover:bg-primary/40 active:bg-primary/60"
            />
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
                <span className="text-xs font-bold uppercase tracking-widest text-primary">Debug</span>
                <button
                    type="button"
                    onClick={close}
                    className="ml-auto rounded-lg px-2 py-1 text-xs text-red-600 hover:bg-red-500/10 dark:text-red-400"
                >
                    Exit
                </button>
            </header>
            <nav className="scrollbar-hide flex shrink-0 gap-1 overflow-x-auto border-b border-border p-2">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActive(tab.id)}
                        className={cn(
                            'whitespace-nowrap rounded-lg px-3 py-1.5 text-xs transition-colors',
                            active === tab.id
                                ? 'bg-primary/15 font-semibold text-primary'
                                : 'text-muted-foreground hover:bg-muted'
                        )}
                    >
                        {tab.label}
                    </button>
                ))}
            </nav>
            <main className="scrollbar-thin flex-1 overflow-y-auto">
                <ActivePage />
            </main>
        </aside>
    );
};
