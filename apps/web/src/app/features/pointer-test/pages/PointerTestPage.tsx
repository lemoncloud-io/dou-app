import { useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';

import { ArrowLeft } from 'lucide-react';

import { useWebSocketStore } from '@chatic/socket';
import { Button } from '@chatic/ui-kit/components/ui/button';

import { useSessionId } from '../../home/hooks/useSessionId';
import { PointerCanvas } from '../components';
import { useInitPointerWebSocket, usePointerSync } from '../hooks';

import type { JSX } from 'react';

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 400;

/**
 * Pointer Test Page - Sends mouse position via WebSocket
 * Admin can view this position in real-time
 */
export const PointerTestPage = (): JSX.Element => {
    const sessionId = useSessionId();
    const { isConnected, connectionStatus } = useWebSocketStore();
    const { connect, disconnect, send } = useInitPointerWebSocket(sessionId);
    const { sendPosition } = usePointerSync({ send, isConnected });

    const handlePointerMove = useCallback(
        (posX: number, posY: number) => {
            sendPosition(posX, posY);
        },
        [sendPosition]
    );

    // Initial connection
    useEffect(() => {
        void connect();
    }, [connect]);

    return (
        <div className="min-h-screen bg-background p-6">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-4 mb-6">
                    <Link to="/">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold">Pointer Sync Test</h1>
                        <p className="text-sm text-muted-foreground">
                            Move your mouse in the canvas area to sync position with Admin
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
                </div>

                {/* Canvas Area */}
                <div className="p-6 rounded-lg border bg-card">
                    <h2 className="text-sm font-medium text-muted-foreground mb-4">📍 Pointer Tracking Area</h2>

                    <PointerCanvas onPointerMove={handlePointerMove} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />

                    <div className="mt-4 text-xs text-muted-foreground">
                        <p>• Move your mouse inside the canvas area</p>
                        <p>• Position is sent to server at 20fps (throttled)</p>
                        <p>• Admin dashboard will display your cursor position in real-time</p>
                    </div>
                </div>

                {/* Info */}
                <div className="mt-6 p-4 rounded-lg border bg-muted/20">
                    <h3 className="text-sm font-medium mb-2">How it works</h3>
                    <div className="text-xs text-muted-foreground space-y-1">
                        <p>
                            1. Mouse position is captured on canvas ({CANVAS_WIDTH}×{CANVAS_HEIGHT} pixels)
                        </p>
                        <p>2. Position is throttled to 50ms intervals (20fps)</p>
                        <p>
                            3. WebSocket sends:{' '}
                            {'{ type: "sync", action: "update", payload: { posX, posY, ts, tick, status } }'}
                        </p>
                        <p>4. Server broadcasts to Admin channel</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
