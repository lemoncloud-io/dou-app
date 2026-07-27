import { useEffect } from 'react';

import { useRuntimeSocketState } from '@chatic/app-runtime';

import { metricsCollector } from '../metrics/MetricsCollector';
import { useDebugMode } from '../hooks';
import { debugOverlayActions, useDebugOverlayState } from './overlayStore';
import { ExpandedSheet } from './ExpandedSheet';
import { MiniPanel } from './MiniPanel';

// Always-on socket quality reporter — keeps connect/disconnect counts accurate
// even while the monitoring overlay is closed.
function MetricsSocketReporter() {
    const socketState = useRuntimeSocketState();
    useEffect(() => {
        metricsCollector.reportSocketState(socketState.state);
    }, [socketState.state]);
    return null;
}

/**
 * Single web debug entry point, mounted at the app.tsx level (outside the Router and AppRuntime)
 * so it stays reachable during a boot hang. NEVER shown by default in any environment (PROD or
 * DEV/LOCAL): the only trigger is the hidden 10-tap unlock. Visible iff debug mode is currently
 * enabled, and the web can hide it again by disabling debug mode.
 */
export const DebugOverlayHost = () => {
    const { isEnabled } = useDebugMode();
    const { isOpen, mode } = useDebugOverlayState();

    // Initially hidden everywhere; 10-tap (MyPage app version) is the sole entry, web disable exits.
    if (!isEnabled) return null;

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
