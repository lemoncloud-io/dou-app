import { useState } from 'react';

import { Maximize2, X } from 'lucide-react';

import { FloatingPanel } from './FloatingPanel';
import { debugOverlayActions } from './overlayStore';
import { BootTab } from './tabs/BootTab';
import { PerfTab } from './tabs/PerfTab';
import { StateTab } from './tabs/StateTab';
import { UnreadTab } from './tabs/UnreadTab';

const TABS = ['상태', '부팅', '성능', '안읽음'] as const;
type MiniTab = (typeof TABS)[number];

/**
 * Floating read-only observation panel — the "watch while using the app" mode. Its tabs are fixed
 * observers, not registry screens; to float a tool screen instead, see `FloatingScreen`.
 */
export const MiniPanel = () => {
    const [tab, setTab] = useState<MiniTab>('상태');

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
            <div className="space-y-3 overflow-y-auto p-4">
                <div className="mb-3 flex gap-1">
                    {TABS.map(t => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={`rounded px-3 py-1 text-xs ${
                                tab === t ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {t}
                        </button>
                    ))}
                </div>

                {tab === '상태' && <StateTab />}
                {tab === '부팅' && <BootTab />}
                {tab === '성능' && <PerfTab />}
                {tab === '안읽음' && <UnreadTab />}
            </div>
        </FloatingPanel>
    );
};
