import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { ClipboardList, Crosshair, MousePointer } from 'lucide-react';

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
    const { t } = useTranslation();
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
        <div className="h-full overflow-auto">
            <div className="max-w-4xl mx-auto p-6">
                {/* Page Header */}
                <div className="mb-6">
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <MousePointer className="h-6 w-6" /> {t('nav.pointerTest')}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Move your mouse in the canvas area to sync position with Admin
                    </p>
                </div>

                {/* Connection Status */}
                <div className="flex items-center gap-3 mb-6">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border">
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
                    <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
                        <Crosshair className="h-4 w-4" /> Pointer Tracking Area
                    </h2>

                    <PointerCanvas onPointerMove={handlePointerMove} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />

                    <div className="mt-4 text-xs text-muted-foreground space-y-1">
                        <p>• Move your mouse inside the canvas area</p>
                        <p>• Position is sent to server at 20fps (throttled)</p>
                        <p>• Admin dashboard will display your cursor position in real-time</p>
                    </div>
                </div>

                {/* Info */}
                <div className="mt-6 p-4 rounded-lg border bg-card">
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <ClipboardList className="h-4 w-4" /> How it works
                    </h3>
                    <div className="text-xs text-muted-foreground space-y-1.5">
                        <div className="flex gap-2">
                            <span className="font-semibold text-foreground">1.</span>
                            <span>
                                Mouse position is captured on canvas ({CANVAS_WIDTH}×{CANVAS_HEIGHT} pixels)
                            </span>
                        </div>
                        <div className="flex gap-2">
                            <span className="font-semibold text-foreground">2.</span>
                            <span>Position is throttled to 50ms intervals (20fps)</span>
                        </div>
                        <div className="flex gap-2">
                            <span className="font-semibold text-foreground">3.</span>
                            <span>WebSocket sends: {'{ type: "sync", action: "update", payload: { ... } }'}</span>
                        </div>
                        <div className="flex gap-2">
                            <span className="font-semibold text-foreground">4.</span>
                            <span>Server broadcasts to Admin channel</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
