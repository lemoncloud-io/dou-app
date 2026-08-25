import { Suspense } from 'react';

import { Maximize2, X } from 'lucide-react';

import { DEBUG_SCREEN_TITLES } from './debugMenu';
import { FloatingPanel } from './FloatingPanel';
import { DEBUG_SCREEN_COMPONENTS } from './screenRegistry';
import { debugOverlayActions, useDebugOverlayState } from './overlayStore';

/**
 * A tool screen in the floating panel instead of the full-screen sheet, so it can be used *while*
 * the app underneath is driven — the DB Browser motivated this: watching rows change as you send a
 * message is impossible when the sheet covers the app.
 *
 * Any registry screen can float; the mode carries whichever screen was selected. With no screen
 * selected there is nothing to float, so this falls back to the mini panel's mode.
 */
export const FloatingScreen = () => {
    const { screen } = useDebugOverlayState();
    if (!screen) return null;

    const Screen = DEBUG_SCREEN_COMPONENTS[screen];

    return (
        <FloatingPanel
            title={DEBUG_SCREEN_TITLES[screen]}
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
            <div className="min-h-0 flex-1 overflow-y-auto">
                <Suspense fallback={<p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>}>
                    <Screen />
                </Suspense>
            </div>
        </FloatingPanel>
    );
};
