import { Suspense, useState, type ReactNode } from 'react';

import { Maximize2, X } from 'lucide-react';

import type { DebugScreenKey } from './debugMenu';
import { FloatingPanel } from './FloatingPanel';
import { DEBUG_SCREEN_COMPONENTS } from './screenRegistry';
import { debugOverlayActions } from './overlayStore';
import { BootTab } from './tabs/BootTab';
import { PerfTab } from './tabs/PerfTab';
import { StateTab } from './tabs/StateTab';
import { UnreadTab } from './tabs/UnreadTab';

/**
 * Tabs of the floating Debug panel. Most are purpose-built observers; the last two mount a registry
 * screen so inspection tools live in the SAME panel as the observers instead of replacing it —
 * switching from "what is the socket doing" to "what is in the DB" should not cost the other tabs.
 *
 * Only inspection screens belong here. Screens that drive something (Cache DB Test, Upload Test,
 * Push) stay menu-only; float them from the expanded sheet when needed.
 *
 * Logs earn a tab for the same reason the DB browser did: the thing you want to read is what the
 * app writes *while you drive it*, and a full-screen sheet covers the app you are driving.
 */
const TABS: { title: string; render: () => ReactNode }[] = [
    { title: '상태', render: () => <Padded>{<StateTab />}</Padded> },
    { title: '부팅', render: () => <Padded>{<BootTab />}</Padded> },
    { title: '성능', render: () => <Padded>{<PerfTab />}</Padded> },
    { title: '안읽음', render: () => <Padded>{<UnreadTab />}</Padded> },
    // Registry screens bring their own padding; the observers above do not.
    { title: '로그', render: () => <LazyScreen screen="LogBuffer" /> },
    { title: 'DB', render: () => <LazyScreen screen="DBBrowser" /> },
    { title: '캐시', render: () => <LazyScreen screen="CacheMetrics" /> },
];

const Padded = ({ children }: { children: ReactNode }) => <div className="p-4">{children}</div>;

const LazyScreen = ({ screen }: { screen: DebugScreenKey }) => {
    const Screen = DEBUG_SCREEN_COMPONENTS[screen];
    return (
        <Suspense fallback={<p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>}>
            <Screen />
        </Suspense>
    );
};

/**
 * Floating observation panel — the "watch while using the app" mode. The panel captures pointer
 * events but nothing else does, so the app underneath stays interactive.
 */
export const MiniPanel = () => {
    const [tab, setTab] = useState(TABS[0].title);
    const active = TABS.find(t => t.title === tab) ?? TABS[0];

    return (
        <FloatingPanel
            title="Debug"
            actions={
                <>
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
                </>
            }
        >
            <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-4 py-2">
                {TABS.map(t => (
                    <button
                        key={t.title}
                        onClick={() => setTab(t.title)}
                        className={`shrink-0 rounded px-3 py-1 text-xs ${
                            tab === t.title ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        {t.title}
                    </button>
                ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">{active.render()}</div>
        </FloatingPanel>
    );
};
