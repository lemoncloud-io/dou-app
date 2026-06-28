import { useEffect, useState } from 'react';

import { useSocketState } from '@chatic/app-runtime';

import { isDevEnv } from './isDevEnv';
import { metricsCollector } from './metrics/MetricsCollector';
import { RuntimeOverlay } from './overlays/RuntimeOverlay';

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
 * DEV-only runtime monitoring entry point: a floating trigger that opens the runtime overlay.
 * Self-gates on VITE_ENV so production builds render (and subscribe) nothing. The env read
 * lives here rather than in `isDevEnv` because `import.meta` is unavailable under ts-jest.
 */
export const DevMonitorOverlay = () => {
    const [open, setOpen] = useState(false);

    if (!isDevEnv(import.meta.env.VITE_ENV)) return null;

    return (
        <>
            <MetricsSocketReporter />
            {!open && (
                <button
                    onClick={() => setOpen(true)}
                    className="fixed bottom-4 right-4 z-50 px-3 py-1.5 rounded-full bg-muted text-muted-foreground text-xs font-mono shadow-md border border-border hover:bg-accent transition-colors"
                >
                    debug
                </button>
            )}
            {open && <RuntimeOverlay onClose={() => setOpen(false)} />}
        </>
    );
};
