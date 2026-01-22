import { useEffect } from 'react';
import { Link } from 'react-router-dom';

import { ArrowLeft } from 'lucide-react';

import { useWebSocketStore } from '@chatic/socket';
import { Button } from '@chatic/ui-kit/components/ui/button';

import { useSessionId } from '../../socket-test/hooks/useSessionId';
import { RemotePointerCanvas } from '../components';
import { useInitPointerWebSocket, useRemotePointers } from '../hooks';
import { usePointerStore } from '../stores';

import type { JSX } from 'react';

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 400;

/**
 * Admin Pointer Test Page - Displays remote mouse positions
 * Receives pointer positions from Web App via WebSocket
 */
export const PointerTestPage = (): JSX.Element => {
    const sessionId = useSessionId();
    const { isConnected, connectionStatus } = useWebSocketStore();
    const { connect, disconnect } = useInitPointerWebSocket(sessionId);
    const clearPointers = usePointerStore(state => state.clearPointers);

    // Subscribe to remote pointer updates
    useRemotePointers();

    // Initial connection
    useEffect(() => {
        void connect();
    }, [connect]);

    return (
        <div className="min-h-screen bg-background p-6">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-4 mb-6">
                    <Link to="/socket-test">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold">Remote Pointer Viewer</h1>
                        <p className="text-sm text-muted-foreground">
                            View real-time mouse positions from connected Web App clients
                        </p>
                    </div>
                </div>

                {/* Connection Status */}
                <div className="flex items-center gap-3 mb-6">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted/50">
                        <div
                            className={`h-2.5 w-2.5 rounded-full ${
                                isConnected
                                    ? 'bg-green-500 animate-pulse'
                                    : connectionStatus === 'connecting'
                                      ? 'bg-yellow-500 animate-pulse'
                                      : 'bg-red-500'
                            }`}
                        />
                        <span className="text-sm font-medium">
                            {connectionStatus === 'connected'
                                ? 'Connected'
                                : connectionStatus === 'connecting'
                                  ? 'Connecting...'
                                  : connectionStatus === 'error'
                                    ? 'Error'
                                    : 'Disconnected'}
                        </span>
                    </div>

                    {connectionStatus === 'connected' ? (
                        <Button size="sm" variant="destructive" className="h-8" onClick={disconnect}>
                            Disconnect
                        </Button>
                    ) : connectionStatus === 'disconnected' || connectionStatus === 'error' ? (
                        <Button size="sm" variant="default" className="h-8" onClick={() => void connect()}>
                            Reconnect
                        </Button>
                    ) : null}

                    <Button size="sm" variant="outline" className="h-8" onClick={clearPointers}>
                        Clear Pointers
                    </Button>
                </div>

                {/* Remote Pointer Canvas */}
                <div className="p-6 rounded-lg border bg-card">
                    <h2 className="text-sm font-medium text-muted-foreground mb-4">📍 Remote Pointer Display</h2>

                    <RemotePointerCanvas width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />

                    <div className="mt-4 text-xs text-muted-foreground">
                        <p>• Remote cursors appear when Web App users move their mouse</p>
                        <p>• Each device gets a unique color</p>
                        <p>• Stale pointers (no update for 5s) are dimmed</p>
                    </div>
                </div>

                {/* Info */}
                <div className="mt-6 p-4 rounded-lg border bg-muted/20">
                    <h3 className="text-sm font-medium mb-2">How it works</h3>
                    <div className="text-xs text-muted-foreground space-y-1">
                        <p>1. Web App users move their mouse on their canvas</p>
                        <p>
                            2. Position is sent via WebSocket: {'{ type: "position", action: "sync", payload: {...} }'}
                        </p>
                        <p>3. Server adds deviceId and broadcasts to Admin channel</p>
                        <p>
                            4. Admin receives and displays cursor at position ({CANVAS_WIDTH}×{CANVAS_HEIGHT})
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
