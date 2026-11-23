import { useEffect } from 'react';

import { ErrorBoundary } from 'react-error-boundary';
import { Bug } from 'lucide-react';

import { runtime } from '@chatic/runtime';

import { metricsCollector } from '../metrics/MetricsCollector';
import { useDebugMode } from '../hooks';
import { debugOverlayActions, useDebugOverlayState } from './overlayStore';
import { DebugPanel } from './DebugPanel';

function MetricsSocketReporter() {
    const socketState = runtime.connection.useRuntimeSocketState();
    useEffect(() => {
        metricsCollector.reportSocketState(socketState.state);
    }, [socketState.state]);
    return null;
}

export const DebugOverlayHost = () => {
    const { isEnabled } = useDebugMode();
    const { isOpen } = useDebugOverlayState();

    if (!isEnabled) return null;

    return (
        <ErrorBoundary FallbackComponent={OverlayCrashNotice}>
            <MetricsSocketReporter />
            {!isOpen && (
                <button
                    onClick={() => debugOverlayActions.open()}
                    className="fixed bottom-4 right-4 z-50 flex items-center gap-1.5 rounded-full border border-border bg-card/95 px-3 py-1.5 font-mono text-xs text-muted-foreground shadow-lg backdrop-blur transition-colors hover:text-foreground"
                >
                    <Bug size={13} />
                    debug
                </button>
            )}
            {isOpen && <DebugPanel />}
        </ErrorBoundary>
    );
};

const OverlayCrashNotice = ({ error }: { error: Error }) => (
    <div className="fixed bottom-4 right-4 z-50 max-w-[80vw] rounded-md border border-destructive bg-background p-3 font-mono text-xs text-destructive shadow-md">
        debug overlay crashed: {error.message}
    </div>
);
