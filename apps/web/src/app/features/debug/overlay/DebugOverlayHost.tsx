import { useEffect } from 'react';

import { useSocketState } from '@chatic/app-runtime';

import { isDevEnv } from '../lib/isDevEnv';
import { metricsCollector } from '../metrics/MetricsCollector';
import { useDebugMode } from '../hooks';
import { debugOverlayActions, useDebugOverlayState } from './overlayStore';
import { ExpandedSheet } from './ExpandedSheet';
import { MiniPanel } from './MiniPanel';

// Always-on socket quality reporter — keeps connect/disconnect counts accurate
// even while the monitoring overlay is closed.
function MetricsSocketReporter() {
    const socketState = useSocketState();
    useEffect(() => {
        metricsCollector.reportSocketState(socketState.state);
    }, [socketState.state]);
    return null;
}

/**
 * Single web debug entry point, mounted at the app.tsx level (outside the
 * Router and AppRuntime) so it stays reachable during a boot hang. Gated by
 * the hidden 10-tap unlock everywhere, with auto-enable on DEV/LOCAL builds.
 * The env read lives here rather than in `isDevEnv` because `import.meta` is
 * unavailable under ts-jest.
 */
export const DebugOverlayHost = () => {
    const { isEnabled } = useDebugMode();
    const { isOpen, mode } = useDebugOverlayState();

    if (!isDevEnv(import.meta.env.VITE_ENV) && !isEnabled) return null;

    return (
        <>
            <MetricsSocketReporter />
            {!isOpen && (
                <button
                    onClick={() => debugOverlayActions.open()}
                    className="fixed bottom-4 right-4 z-50 px-3 py-1.5 rounded-full bg-muted text-muted-foreground text-xs font-mono shadow-md border border-border hover:bg-accent transition-colors"
                >
                    debug
                </button>
            )}
            {isOpen && (mode === 'mini' ? <MiniPanel /> : <ExpandedSheet />)}
        </>
    );
};
